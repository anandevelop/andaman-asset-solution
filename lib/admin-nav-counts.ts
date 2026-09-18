/**
 * lib/admin-nav-counts.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The small "still needs a look" numbers shown as badges in the sidebar
 * and topbar (see AdminSidebar.tsx / AdminTopbar.tsx) — matching the
 * mockup's nav badges (Main.dc.html), which read as live queue counts,
 * not decoration.
 *
 * Each number reuses a query this app already has elsewhere rather than
 * inventing new aggregate infrastructure: new/unassigned leads is the
 * same "needs an owner" definition the Leads board uses, appointments
 * today reuses getMyAppointmentsToday (mine-or-unassigned, today), and
 * the review queue reuses the Publishing dashboard's own count.
 *
 * getReviewQueueBreakdown() is exported (not just the sidebar's summed
 * total) because the dashboard's work-queue card wants the per-type
 * split ("news 2 · projects 1"), and re-running four cheap counts is
 * still far cheaper than getPublishingOverview()'s full row + AuditLog
 * fetch — see that function's own comment.
 */

import { ContentStatus, LeadStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { safeQuery } from "@/lib/db";
import { getMyAppointmentsToday } from "@/lib/appointments";

export type AdminNavCounts = {
  /** Unassigned leads that are not yet won or lost — needs an owner. */
  newLeads: number;
  /** This user's own appointments today, plus any still unassigned. */
  appointmentsToday: number;
  /** Content sitting in the draft/review workflow's review queue. */
  reviewQueue: number;
};

/** A lead in either of these statuses is closed — done being worked. */
export const CLOSED_LEAD_STATUSES: LeadStatus[] = [LeadStatus.WON, LeadStatus.LOST];

export type ReviewQueueBreakdown = {
  project: number;
  news: number;
  event: number;
  brochure: number;
  total: number;
};

/**
 * A count-only version of what getPublishingOverview() also answers —
 * that helper fetches and maps every draft/review/scheduled row across
 * all four content types (plus an AuditLog lookup per review row) to
 * build the full Publishing dashboard, which is far more work than a
 * badge needs on every single admin page load. This asks Postgres for
 * four counts instead.
 */
export async function getReviewQueueBreakdown(): Promise<ReviewQueueBreakdown> {
  const where = { contentStatus: ContentStatus.IN_REVIEW } as const;
  const [project, news, event, brochure] = await Promise.all([
    safeQuery("adminNav:reviewQueue:project", () => prisma.project.count({ where }), 0),
    safeQuery("adminNav:reviewQueue:news", () => prisma.newsArticle.count({ where }), 0),
    safeQuery("adminNav:reviewQueue:event", () => prisma.event.count({ where }), 0),
    safeQuery("adminNav:reviewQueue:brochure", () => prisma.eBrochure.count({ where }), 0),
  ]);

  return { project, news, event, brochure, total: project + news + event + brochure };
}

export async function getAdminNavCounts(userId: string): Promise<AdminNavCounts> {
  const [newLeads, appointmentsToday, reviewQueue] = await Promise.all([
    safeQuery(
      "adminNav:newLeads",
      () =>
        prisma.leadInquiry.count({
          where: { assignedToId: null, status: { notIn: CLOSED_LEAD_STATUSES } },
        }),
      0,
    ),
    safeQuery("adminNav:appointmentsToday", () => getMyAppointmentsToday(userId), []).then(
      (rows) => rows.length,
    ),
    getReviewQueueBreakdown().then((breakdown) => breakdown.total),
  ]);

  return { newLeads, appointmentsToday, reviewQueue };
}
