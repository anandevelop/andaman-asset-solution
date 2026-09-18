import "server-only";

/**
 * lib/leads-board.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Read side of the leads Kanban board (LeadBoard.dc.html).
 *
 * The board and the existing table (app/[locale]/admin/leads/page.tsx)
 * share one filter set and one SALES-role scoping rule; this module is
 * the single place both apply it, so a filter added to one view cannot
 * silently drift from the other.
 *
 * LOST is deliberately not a column — same call the dashboard's pipeline
 * funnel already made (see FUNNEL_STAGES in lib/reports.ts): a lost deal
 * is not something a rep drags back into work, it is a count off to the
 * side ("ไม่สำเร็จ N") that explains why the board's total looks smaller
 * than the team's all-time lead count.
 *
 * Card "age" badges are column-aware rather than one universal
 * "time since created" figure:
 *   - NEW: hours since createdAt — the response-SLA clock — red past
 *     RESPONSE_SLA_HOURS (lib/dashboard-queue.ts, same constant the
 *     dashboard's overdue-response card already uses).
 *   - VIEWING_SCHEDULED: the next active appointment's date, not an age
 *     at all — "today"/"tomorrow"/a short date, because what a rep needs
 *     to see on that column is when the viewing is, not when the lead
 *     first came in.
 *   - Every other open status: days since the row was last touched
 *     (updatedAt — bumped by a status change, a reassignment, a new
 *     follow-up date, or a note), red past STALE_DAYS. There is no
 *     separate "last activity" ledger to query instead; updatedAt is the
 *     one timestamp guaranteed to move every time a rep actually does
 *     something with the lead.
 *   - WON: the date it closed. Nothing marks the closing moment
 *     explicitly, so updatedAt stands in here too — a won deal is not
 *     expected to be edited again, so the assumption holds in practice.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { LeadSource, LeadStatus, Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { safeQuery } from "@/lib/db";
import { RESPONSE_SLA_HOURS } from "@/lib/dashboard-queue";
import { type RangeDays } from "@/lib/dashboard-range";

/** Columns the board draws, left to right. LOST is excluded — see header. */
export const LEAD_BOARD_STATUSES = [
  LeadStatus.NEW,
  LeadStatus.CONTACTED,
  LeadStatus.QUALIFIED,
  LeadStatus.VIEWING_SCHEDULED,
  LeadStatus.NEGOTIATING,
  LeadStatus.WON,
] as const satisfies readonly LeadStatus[];

/** A row sits in this bucket if it is a day older than this with no touch. */
const STALE_DAYS = 10;

/** Mirrors lib/appointments.ts's own ACTIVE_STATUSES — a cancelled or
 *  no-show appointment should not be what a rep sees as "the next viewing". */
const ACTIVE_APPOINTMENT_STATUSES = ["REQUESTED", "CONFIRMED"] as const;

export type LeadBoardFilters = {
  /** A user id, the literal "unassigned", or undefined for everyone. */
  assignedTo?: string;
  projectId?: string;
  source?: LeadSource;
  rangeDays?: RangeDays;
  /** Response-SLA overdue only (NEW, older than RESPONSE_SLA_HOURS). */
  overdueOnly?: boolean;
};

export type LeadCard = {
  id: string;
  name: string;
  phone: string;
  status: LeadStatus;
  source: LeadSource;
  createdAt: Date;
  updatedAt: Date;
  followUpAt: Date | null;
  consentGiven: boolean;
  project: { slug: string; nameEn: string; nameTh: string } | null;
  assignedTo: { id: string; name: string } | null;
  latestNoteBody: string | null;
  /** Next active appointment's start time, VIEWING_SCHEDULED cards only. */
  nextAppointmentAt: Date | null;
  /** True when this card should render with the overdue/stale red treatment. */
  isUrgent: boolean;
};

export type LeadBoardData = {
  columns: Record<(typeof LEAD_BOARD_STATUSES)[number], LeadCard[]>;
  openCount: number;
  lostCount: number;
  overdueCount: number;
};

export type LeadBoardFilterOptions = {
  assignees: { id: string; name: string }[];
  projects: { id: string; nameEn: string; nameTh: string }[];
};

function whereFromFilters(
  filters: LeadBoardFilters,
  scopeWhere: Prisma.LeadInquiryWhereInput | undefined,
): Prisma.LeadInquiryWhereInput {
  const clauses: Prisma.LeadInquiryWhereInput[] = [];

  if (scopeWhere) clauses.push(scopeWhere);
  if (filters.assignedTo === "unassigned") clauses.push({ assignedToId: null });
  else if (filters.assignedTo) clauses.push({ assignedToId: filters.assignedTo });
  if (filters.projectId) clauses.push({ projectId: filters.projectId });
  if (filters.source) clauses.push({ source: filters.source });
  if (filters.rangeDays) {
    const since = new Date(Date.now() - Number(filters.rangeDays) * 24 * 60 * 60_000);
    clauses.push({ createdAt: { gte: since } });
  }

  return clauses.length > 0 ? { AND: clauses } : {};
}

/**
 * The board plus its two headline counts ("87 open · 34 lost").
 *
 * One query per status bucket rather than a single findMany + client-side
 * grouping: LOST and the open statuses have different select needs (LOST
 * cards are not drawn, so lib/leads-board.ts never fetches their rows,
 * only their count), and six small indexed queries against
 * (status, createdAt) beat one broad scan the database then has to sort
 * into buckets itself.
 */
/**
 * The rows this session may see at all, before any filter the person chose.
 *
 * Two independent narrowings, both of which must hold:
 *
 *  · A SALES account sees the unassigned pool plus its own leads. Ranks
 *    above it see everyone's — EDITOR does not reach this page at all any
 *    more (lib/permissions.ts).
 *  · Any account with scoped projects is held to them, whatever its role.
 *    An empty scope list means unscoped, i.e. the whole company — that is
 *    the state every existing account is in, and the one that must not
 *    silently lock anybody out.
 *
 * Queried here rather than passed in so no call site can forget it; there
 * are two, and the duplication is what this function replaces.
 */
async function leadScopeWhere(session: {
  id: string;
  role: Role;
}): Promise<Prisma.LeadInquiryWhereInput | undefined> {
  const clauses: Prisma.LeadInquiryWhereInput[] = [];

  if (session.role === Role.SALES) {
    clauses.push({ OR: [{ assignedToId: null }, { assignedToId: session.id }] });
  }

  const scoped = await prisma.user.findUnique({
    where: { id: session.id },
    select: { scopedProjects: { select: { id: true } } },
  });
  const projectIds = scoped?.scopedProjects.map((project) => project.id) ?? [];
  if (projectIds.length > 0) clauses.push({ projectId: { in: projectIds } });

  if (clauses.length === 0) return undefined;
  return clauses.length === 1 ? clauses[0] : { AND: clauses };
}

export async function getLeadBoardData(
  session: { id: string; role: Role },
  filters: LeadBoardFilters,
): Promise<LeadBoardData> {
  const baseWhere = whereFromFilters(filters, await leadScopeWhere(session));

  const overdueCutoff = new Date(Date.now() - RESPONSE_SLA_HOURS * 60 * 60_000);
  const staleCutoff = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60_000);

  const [rowsByStatus, lostCount, overdueCount] = await Promise.all([
    Promise.all(
      LEAD_BOARD_STATUSES.map((status) =>
        safeQuery(
          `leadsBoard:${status}`,
          () =>
            prisma.leadInquiry.findMany({
              where: { ...baseWhere, status },
              orderBy: { createdAt: "desc" },
              take: 200,
              select: {
                id: true,
                name: true,
                phone: true,
                status: true,
                source: true,
                createdAt: true,
                updatedAt: true,
                followUpAt: true,
                consentGiven: true,
                project: { select: { slug: true, nameEn: true, nameTh: true } },
                assignedTo: { select: { id: true, name: true } },
                notes: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true } },
                appointments: {
                  where: { status: { in: [...ACTIVE_APPOINTMENT_STATUSES] } },
                  orderBy: { scheduledAt: "asc" },
                  take: 1,
                  select: { scheduledAt: true },
                },
              },
            }),
          [],
        ),
      ),
    ),
    safeQuery(
      "leadsBoard:lostCount",
      () => prisma.leadInquiry.count({ where: { ...baseWhere, status: LeadStatus.LOST } }),
      0,
    ),
    // "Overdue" is specifically the response-SLA breach — NEW leads sitting
    // past RESPONSE_SLA_HOURS — matching the toggle chip's own count and
    // the dashboard's identical definition (getOverdueResponseQueue).
    safeQuery(
      "leadsBoard:overdueCount",
      () =>
        prisma.leadInquiry.count({
          where: { ...baseWhere, status: LeadStatus.NEW, createdAt: { lte: overdueCutoff } },
        }),
      0,
    ),
  ]);

  const columns = {} as LeadBoardData["columns"];
  let openCount = 0;

  LEAD_BOARD_STATUSES.forEach((status, index) => {
    const rows = rowsByStatus[index];
    openCount += rows.length;

    columns[status] = rows
      .filter((row) => {
        // The overdue toggle narrows every column to the same definition
        // used for its count, not just the NEW column — a rep who ticks
        // it wants the whole board to answer "what needs me right now",
        // and a stale QUALIFIED lead is exactly that.
        if (!filters.overdueOnly) return true;
        if (row.status === LeadStatus.NEW) return row.createdAt <= overdueCutoff;
        if (row.status === LeadStatus.VIEWING_SCHEDULED) return false;
        return row.updatedAt <= staleCutoff;
      })
      .map((row) => ({
        id: row.id,
        name: row.name,
        phone: row.phone,
        status: row.status,
        source: row.source,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        followUpAt: row.followUpAt,
        consentGiven: row.consentGiven,
        project: row.project,
        assignedTo: row.assignedTo,
        latestNoteBody: row.notes[0]?.body ?? null,
        nextAppointmentAt:
          row.status === LeadStatus.VIEWING_SCHEDULED
            ? (row.appointments[0]?.scheduledAt ?? null)
            : null,
        isUrgent:
          row.status === LeadStatus.NEW
            ? row.createdAt <= overdueCutoff
            : row.status === LeadStatus.VIEWING_SCHEDULED
              ? false
              : row.updatedAt <= staleCutoff,
      }));
  });

  return { columns, openCount, lostCount, overdueCount };
}

/**
 * The "เกิน SLA" filter chip's count on its own — used by the table view,
 * which does not otherwise run the board's six per-column queries.
 */
export async function getOverdueCount(
  session: { id: string; role: Role },
  filters: LeadBoardFilters,
): Promise<number> {
  const baseWhere = whereFromFilters(filters, await leadScopeWhere(session));
  const overdueCutoff = new Date(Date.now() - RESPONSE_SLA_HOURS * 60 * 60_000);

  return safeQuery(
    "leadsBoard:overdueCount:standalone",
    () =>
      prisma.leadInquiry.count({
        where: { ...baseWhere, status: LeadStatus.NEW, createdAt: { lte: overdueCutoff } },
      }),
    0,
  );
}

/** Populates the assignee and project filter dropdowns. */
export async function getLeadBoardFilterOptions(): Promise<LeadBoardFilterOptions> {
  const [assignees, projects] = await Promise.all([
    safeQuery(
      "leadsBoard:assignees",
      () =>
        prisma.user.findMany({
          where: { isActive: true, role: { in: [Role.SALES, Role.EDITOR, Role.ADMIN, Role.SUPER_ADMIN] } },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        }),
      [],
    ),
    safeQuery(
      "leadsBoard:projects",
      () =>
        prisma.project.findMany({
          orderBy: { sortOrder: "asc" },
          select: { id: true, nameEn: true, nameTh: true },
        }),
      [],
    ),
  ]);

  return { assignees, projects };
}
