import "server-only";

/**
 * lib/dashboard-queue.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Read side of the dashboard's "today's work queue" cards (Main.dc.html).
 * Each one is a purpose-built, dashboard-only query — richer than the
 * plain counts in lib/admin-nav-counts.ts (which run on every admin page
 * via the layout, so they stay cheap), because this page is loaded once
 * per visit and the cards want detail: how old, what times, which types.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { LeadStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { safeQuery } from "@/lib/db";
import { CLOSED_LEAD_STATUSES } from "@/lib/admin-nav-counts";
import { getTodayAppointmentsCompanyWide } from "@/lib/appointments";

/** Hours a NEW lead can sit untouched before it counts as overdue. */
export const RESPONSE_SLA_HOURS = 24;

export type UnassignedLeadQueue = { count: number; oldestCreatedAt: Date | null };
export type OverdueResponseQueue = { count: number };
export type TodayAppointmentQueue = { count: number; times: Date[] };

/**
 * Unassigned, still-open leads — the same "needs an owner" definition the
 * Leads board and the sidebar badge use (see admin-nav-counts.ts), plus
 * how long the oldest one has been waiting.
 */
export async function getUnassignedLeadQueue(): Promise<UnassignedLeadQueue> {
  const where = { assignedToId: null, status: { notIn: CLOSED_LEAD_STATUSES } } as const;

  const [count, oldest] = await Promise.all([
    safeQuery("dashboard:unassignedLeads:count", () => prisma.leadInquiry.count({ where }), 0),
    safeQuery(
      "dashboard:unassignedLeads:oldest",
      () =>
        prisma.leadInquiry.findFirst({
          where,
          orderBy: { createdAt: "asc" },
          select: { createdAt: true },
        }),
      null as { createdAt: Date } | null,
    ),
  ]);

  return { count, oldestCreatedAt: oldest?.createdAt ?? null };
}

/**
 * NEW leads still sitting untouched past the SLA window. A lead that has
 * been worked at all moves off NEW (see LeadStatusSelect) — this schema
 * has no separate "first responded at" timestamp to check instead, so
 * "still NEW past the window" is the honest, direct signal rather than an
 * approximation layered on top of one.
 */
export async function getOverdueResponseQueue(): Promise<OverdueResponseQueue> {
  const cutoff = new Date(Date.now() - RESPONSE_SLA_HOURS * 60 * 60_000);

  const count = await safeQuery(
    "dashboard:overdueResponse",
    () =>
      prisma.leadInquiry.count({
        where: { status: LeadStatus.NEW, createdAt: { lte: cutoff } },
      }),
    0,
  );

  return { count };
}

/** Company-wide site visits today, for the work-queue card's time list. */
export async function getTodayAppointmentQueue(): Promise<TodayAppointmentQueue> {
  const rows = await getTodayAppointmentsCompanyWide();
  return { count: rows.length, times: rows.map((row) => row.scheduledAt) };
}
