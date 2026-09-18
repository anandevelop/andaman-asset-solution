import "server-only";

/**
 * lib/admin/sales-performance.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Per-rep numbers for the Sales Team page (SalesTeam.dc.html), all of them
 * derived from the lead timeline rather than typed in by anyone.
 *
 * WHAT EACH NUMBER ACTUALLY MEASURES.
 *
 * Open leads   — assigned to them and not yet WON or LOST.
 * Response     — from the lead arriving to the first human entry on its
 *                timeline (a note, a call or an email). SYSTEM entries are
 *                excluded: "status changed to Contacted" is bookkeeping the
 *                app wrote, not the rep answering the customer, and
 *                counting it would let a rep score a one-second response
 *                by dragging a card.
 * Viewings     — Appointments created for their leads.
 * Closed       — leads that reached WON.
 * Conversion   — closed ÷ received, over the same window.
 *
 * A rep is a SalesPerson (the public profile) joined to a User (the
 * back-office account) through User.salesPersonId. A profile with no
 * account holds no leads and gets no numbers — see `hasAccount`, which the
 * page uses to say so rather than showing a row of zeroes that look like
 * poor performance.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { LeadStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { safeQuery } from "@/lib/db";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The window the comparison table reports on. */
export const PERFORMANCE_WINDOW_DAYS = 90;
/** The shorter window the per-card "viewings" figure uses. */
export const VIEWINGS_WINDOW_DAYS = 30;
/** "Answered quickly" for the table's percentage column. */
export const FAST_RESPONSE_MS = 2 * 60 * 60 * 1000;
/** Above this average, the card shows the response time as a problem. */
export const SLOW_RESPONSE_MS = 4 * 60 * 60 * 1000;

export type SalesPersonPerformance = {
  salesPersonId: string;
  userId: string | null;
  hasAccount: boolean;

  /** Currently assigned and still open. */
  openLeads: number;
  /** Mean time to the first human timeline entry, over the window. Null
   *  when no lead of theirs has been answered yet. */
  avgResponseMs: number | null;
  viewings30d: number;
  closed90d: number;

  // ── The 90-day comparison table ──────────────────────────────────────
  leadsReceived: number;
  respondedFast: number;
  /** respondedFast ÷ the leads that got any response, as a percentage. */
  fastResponseRate: number | null;
  conversionRate: number | null;
  /** Projects their leads actually belong to — derived, not configured. */
  projectNames: string[];
};

type LeadRow = {
  id: string;
  assignedToId: string | null;
  status: LeadStatus;
  createdAt: Date;
  project: { nameEn: string; nameTh: string } | null;
};

function averageOf(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export async function getSalesPerformance(
  locale: string,
  people: { id: string; userId: string | null }[],
): Promise<Map<string, SalesPersonPerformance>> {
  const empty = new Map<string, SalesPersonPerformance>(
    people.map((person) => [
      person.id,
      {
        salesPersonId: person.id,
        userId: person.userId,
        hasAccount: person.userId !== null,
        openLeads: 0,
        avgResponseMs: null,
        viewings30d: 0,
        closed90d: 0,
        leadsReceived: 0,
        respondedFast: 0,
        fastResponseRate: null,
        conversionRate: null,
        projectNames: [],
      },
    ]),
  );

  const userIds = people.map((person) => person.userId).filter((id): id is string => id !== null);
  if (userIds.length === 0) return empty;

  return safeQuery(
    "admin:salesPerformance",
    async () => {
      const now = Date.now();
      const windowStart = new Date(now - PERFORMANCE_WINDOW_DAYS * DAY_MS);
      const viewingsStart = new Date(now - VIEWINGS_WINDOW_DAYS * DAY_MS);

      const [openLeads, windowLeads, firstReplies, appointments] = await Promise.all([
        // Open right now — deliberately not limited to the window: a lead
        // from four months ago that nobody has closed is still on someone's
        // plate today.
        prisma.leadInquiry.findMany({
          where: {
            assignedToId: { in: userIds },
            status: { notIn: [LeadStatus.WON, LeadStatus.LOST] },
          },
          select: { id: true, assignedToId: true },
        }),

        prisma.leadInquiry.findMany({
          where: { assignedToId: { in: userIds }, createdAt: { gte: windowStart } },
          select: {
            id: true,
            assignedToId: true,
            status: true,
            createdAt: true,
            project: { select: { nameEn: true, nameTh: true } },
          },
        }),

        /*
          The first human entry on each lead's timeline. `distinct` keeps
          the earliest per lead because the ordering is applied first — the
          same batching trick the projects list uses on AuditLog, and the
          reason this is one query rather than one per lead.
        */
        prisma.leadNote.findMany({
          where: {
            kind: { in: ["NOTE", "CALL", "EMAIL"] },
            lead: { assignedToId: { in: userIds }, createdAt: { gte: windowStart } },
          },
          orderBy: { createdAt: "asc" },
          distinct: ["leadId"],
          select: { leadId: true, createdAt: true },
        }),

        prisma.appointment.findMany({
          where: {
            lead: { assignedToId: { in: userIds } },
            createdAt: { gte: viewingsStart },
          },
          select: { lead: { select: { assignedToId: true } } },
        }),
      ]);

      const firstReplyAt = new Map(firstReplies.map((row) => [row.leadId, row.createdAt]));

      // userId → the profile it belongs to, so results land on the card.
      const personByUser = new Map(
        people
          .filter((person) => person.userId)
          .map((person) => [person.userId as string, person.id]),
      );

      const result = new Map(empty);
      const responseTimes = new Map<string, number[]>();
      const projects = new Map<string, Set<string>>();

      const bump = (userId: string | null, mutate: (row: SalesPersonPerformance) => void) => {
        const personId = userId ? personByUser.get(userId) : undefined;
        const row = personId ? result.get(personId) : undefined;
        if (row) mutate(row);
      };

      for (const lead of openLeads) bump(lead.assignedToId, (row) => (row.openLeads += 1));

      for (const lead of windowLeads as LeadRow[]) {
        bump(lead.assignedToId, (row) => {
          row.leadsReceived += 1;
          if (lead.status === LeadStatus.WON) row.closed90d += 1;

          const replied = firstReplyAt.get(lead.id);
          if (replied) {
            const elapsed = replied.getTime() - lead.createdAt.getTime();
            const list = responseTimes.get(row.salesPersonId) ?? [];
            list.push(elapsed);
            responseTimes.set(row.salesPersonId, list);
            if (elapsed <= FAST_RESPONSE_MS) row.respondedFast += 1;
          }

          if (lead.project) {
            const set = projects.get(row.salesPersonId) ?? new Set<string>();
            set.add(locale === "th" ? lead.project.nameTh : lead.project.nameEn);
            projects.set(row.salesPersonId, set);
          }
        });
      }

      for (const appointment of appointments) {
        bump(appointment.lead?.assignedToId ?? null, (row) => (row.viewings30d += 1));
      }

      for (const row of result.values()) {
        const times = responseTimes.get(row.salesPersonId) ?? [];
        row.avgResponseMs = averageOf(times);
        // Out of the leads that got *a* response, not out of every lead —
        // an unanswered lead is a different failure, and folding it in here
        // would hide it inside a rate that looks merely mediocre.
        row.fastResponseRate =
          times.length === 0 ? null : Math.round((row.respondedFast / times.length) * 100);
        row.conversionRate =
          row.leadsReceived === 0 ? null : Math.round((row.closed90d / row.leadsReceived) * 1000) / 10;
        row.projectNames = [...(projects.get(row.salesPersonId) ?? [])].sort();
      }

      return result;
    },
    empty,
  );
}
