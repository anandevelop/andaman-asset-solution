import "server-only";

/**
 * lib/admin/dashboard.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The reads behind "งานวันนี้" (app/[locale]/admin/page.tsx).
 *
 * One function per panel, each through safeQuery, so a database blip
 * empties a panel rather than taking the operator's home screen down. The
 * page decides which panels a role gets (canSeeItem against the nav
 * config) and only calls the loaders it will draw — a SALES account's
 * dashboard never reads the audit log it could not open anyway.
 *
 * Rows come back raw; lib/admin/dashboard-model.ts holds the arithmetic
 * and the page does the translating, so none of this needs a locale.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { AppointmentStatus, LeadStatus, type Role, UnitStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { safeQuery } from "@/lib/db";
import { CLOSED_LEAD_STATUSES } from "@/lib/admin-nav-counts";
import { SEAT_TAKING_STATUSES } from "@/lib/events";
import { AUTH_MODEL } from "@/lib/audit/events";
import { DAY_MS, utcDayStart } from "@/lib/admin/dashboard-model";

/** How many rows of each kind the inbox shows. The counts beside them
 *  are exact; the list is a starting point, not the whole backlog. */
const INBOX_TAKE = 12;

const projectNames = { select: { nameEn: true, nameTh: true } } as const;

/* ── Daily brief + inbox ────────────────────────────────────────────── */

export type UnassignedLeadRow = {
  id: string;
  name: string;
  source: string;
  createdAt: Date;
  project: { nameEn: string; nameTh: string } | null;
};

export async function getUnassignedLeads(): Promise<{ count: number; rows: UnassignedLeadRow[] }> {
  const where = { assignedToId: null, status: { notIn: CLOSED_LEAD_STATUSES } };
  const [count, rows] = await Promise.all([
    safeQuery("dashboard:unassigned:count", () => prisma.leadInquiry.count({ where }), 0),
    safeQuery(
      "dashboard:unassigned:rows",
      () =>
        prisma.leadInquiry.findMany({
          where,
          orderBy: { createdAt: "asc" },
          take: INBOX_TAKE,
          select: { id: true, name: true, source: true, createdAt: true, project: projectNames },
        }),
      [],
    ),
  ]);
  return { count, rows };
}

export type OverdueAppointmentRow = {
  id: string;
  scheduledAt: Date;
  lead: { name: string } | null;
  project: { nameEn: string; nameTh: string } | null;
};

/**
 * REQUESTED appointments whose time has passed — a viewing that either
 * happened or did not, and nobody has said which.
 *
 * A SALES account sees the ones it could act on and no others: its own and
 * the unassigned, the same rule updateAppointmentStatus enforces. Listing
 * a colleague's appointment with a button that would then be refused is
 * the dashboard version of a nav link to a denied page.
 */
export async function getOverdueAppointments(viewer: {
  id: string;
  role: Role;
}): Promise<{ count: number; rows: OverdueAppointmentRow[] }> {
  const where = {
    status: AppointmentStatus.REQUESTED,
    scheduledAt: { lt: new Date() },
    ...(viewer.role === "SALES" ? { OR: [{ assignedToId: null }, { assignedToId: viewer.id }] } : {}),
  };
  const [count, rows] = await Promise.all([
    safeQuery("dashboard:overdueAppointments:count", () => prisma.appointment.count({ where }), 0),
    safeQuery(
      "dashboard:overdueAppointments:rows",
      () =>
        prisma.appointment.findMany({
          where,
          orderBy: { scheduledAt: "asc" },
          take: INBOX_TAKE,
          select: { id: true, scheduledAt: true, lead: { select: { name: true } }, project: projectNames },
        }),
      [],
    ),
  ]);
  return { count, rows };
}

export type TodayEventRow = {
  id: string;
  titleEn: string;
  titleTh: string;
  startsAt: Date;
  capacity: number | null;
  /** Heads holding a seat — confirmed, pending or checked in; the same
   *  statuses the registration desk counts. */
  seatsTaken: number;
};

/** Events running at any point today: started today, or started earlier
 *  and not yet ended. */
export async function getTodayEvents(): Promise<TodayEventRow[]> {
  const start = utcDayStart(new Date());
  const end = new Date(start.getTime() + DAY_MS);

  return safeQuery(
    "dashboard:todayEvents",
    async () => {
      const events = await prisma.event.findMany({
        where: {
          isPublished: true,
          startsAt: { lt: end },
          OR: [{ startsAt: { gte: start } }, { endsAt: { gte: start } }],
        },
        orderBy: { startsAt: "asc" },
        select: { id: true, titleEn: true, titleTh: true, startsAt: true, capacity: true },
      });
      if (events.length === 0) return [];

      const seats = await prisma.eventRegistration.groupBy({
        by: ["eventId"],
        where: { eventId: { in: events.map((e) => e.id) }, status: { in: [...SEAT_TAKING_STATUSES] } },
        _sum: { partySize: true },
      });

      return events.map((event) => ({
        ...event,
        seatsTaken: seats.find((row) => row.eventId === event.id)?._sum.partySize ?? 0,
      }));
    },
    [],
  );
}

/* ── KPIs ───────────────────────────────────────────────────────────── */

/** Leads that are still somebody's job: everything but WON and LOST. */
export async function getOpenLeadCount(): Promise<number> {
  return safeQuery(
    "dashboard:openLeads",
    () => prisma.leadInquiry.count({ where: { status: { notIn: CLOSED_LEAD_STATUSES } } }),
    0,
  );
}

/** New leads per UTC day over the window — the open-leads card's line. */
export async function getLeadArrivals(days: number): Promise<{ day: Date; count: number }[]> {
  const from = new Date(utcDayStart(new Date()).getTime() - (days - 1) * DAY_MS);
  const rows = await safeQuery(
    "dashboard:leadArrivals",
    () => prisma.leadInquiry.findMany({ where: { createdAt: { gte: from } }, select: { createdAt: true } }),
    [],
  );
  return rows.map((row) => ({ day: row.createdAt, count: 1 }));
}

/* ── Pipeline and stock ─────────────────────────────────────────────── */

export async function getLeadStatusCounts(): Promise<Partial<Record<LeadStatus, number>>> {
  const rows = await safeQuery(
    "dashboard:funnel",
    () => prisma.leadInquiry.groupBy({ by: ["status"], _count: { _all: true } }),
    [],
  );
  return Object.fromEntries(rows.map((row) => [row.status, row._count._all]));
}

export type ProjectStockRow = {
  id: string;
  nameEn: string;
  nameTh: string;
  status: string;
  imageUrl: string | null;
  available: number;
  reserved: number;
  sold: number;
  total: number;
  unitTypes: number;
};

/**
 * Unit stock per project, for the stock card and the units KPI.
 *
 * A project with no units entered is left out: its bar would be empty,
 * which at a glance reads as "sold out". Every unit being AVAILABLE — the
 * state of the data as this was written — is a normal result and draws a
 * full "available" bar with zero reserved and sold.
 */
export async function getProjectStock(): Promise<ProjectStockRow[]> {
  return safeQuery(
    "dashboard:stock",
    async () => {
      const [projects, counts] = await Promise.all([
        prisma.project.findMany({
          where: { deletedAt: null },
          orderBy: { sortOrder: "asc" },
          select: {
            id: true,
            nameEn: true,
            nameTh: true,
            status: true,
            heroImageUrl: true,
            ogImageUrl: true,
            _count: { select: { unitTypes: true } },
          },
        }),
        prisma.projectUnit.groupBy({ by: ["projectId", "status"], _count: { _all: true } }),
      ]);

      const count = (projectId: string, status: UnitStatus) =>
        counts.find((row) => row.projectId === projectId && row.status === status)?._count._all ?? 0;

      return projects
        .map(({ heroImageUrl, ogImageUrl, _count, ...project }) => {
          const available = count(project.id, UnitStatus.AVAILABLE);
          const reserved = count(project.id, UnitStatus.RESERVED);
          const sold = count(project.id, UnitStatus.SOLD);
          return {
            ...project,
            imageUrl: heroImageUrl ?? ogImageUrl,
            available,
            reserved,
            sold,
            total: available + reserved + sold,
            unitTypes: _count.unitTypes,
          };
        })
        .filter((project) => project.total > 0);
    },
    [],
  );
}

/* ── Keywords and activity ──────────────────────────────────────────── */

export type TrackedKeywordRow = {
  id: string;
  phrase: string;
  locale: string;
  currentRank: number;
  previousRank: number | null;
};

/** The five best-ranked tracked keywords. Unranked ones are not "rank 0"
 *  and are left out rather than sorted to the top. */
export async function getTopKeywords(): Promise<TrackedKeywordRow[]> {
  const rows = await safeQuery(
    "dashboard:keywords",
    () =>
      prisma.keyword.findMany({
        where: { currentRank: { not: null } },
        orderBy: { currentRank: "asc" },
        take: 5,
        select: { id: true, phrase: true, locale: true, currentRank: true, previousRank: true },
      }),
    [],
  );
  return rows.map((row) => ({ ...row, currentRank: row.currentRank ?? 0 }));
}

export type ActivityRow = {
  id: string;
  actorEmail: string;
  actorName: string | null;
  action: string;
  model: string;
  recordLabel: string | null;
  createdAt: Date;
};

/** Recent record changes. Sign-ins and sign-outs are left out: on a
 *  dashboard they are most of the log and none of the news. */
export async function getRecentActivity(): Promise<ActivityRow[]> {
  const rows = await safeQuery(
    "dashboard:activity",
    () =>
      prisma.auditLog.findMany({
        where: { model: { not: AUTH_MODEL } },
        orderBy: { createdAt: "desc" },
        take: 6,
        select: {
          id: true,
          actorEmail: true,
          action: true,
          model: true,
          recordLabel: true,
          createdAt: true,
          actor: { select: { name: true } },
        },
      }),
    [],
  );
  return rows.map(({ actor, ...row }) => ({ ...row, actorName: actor?.name ?? null }));
}
