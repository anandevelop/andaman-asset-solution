/**
 * lib/reports.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Aggregate queries for the admin dashboard.
 *
 * The first three read LeadInquiry over a date range, which is what the
 * (createdAt, status) index exists for — the older (status, createdAt)
 * cannot seek on a date without walking every status bucket first.
 *
 * Months are bucketed in JavaScript rather than with date_trunc. A raw
 * query would push the work into Postgres, but it would also bypass
 * safeQuery's offline handling and hardcode a timezone the rest of the app
 * takes from TZ. At a few thousand leads the difference is unmeasurable;
 * revisit at a scale where it is not.
 *
 * getLeadPipeline() is the one deliberate exception to "windowed to a date
 * range" — see its own doc comment. getEventRsvpSummary() reuses
 * lib/events.ts's SEAT_TAKING_STATUSES rather than redefining what a taken
 * seat is.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { LeadStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { safeQuery } from "@/lib/db";
import { pickLocale } from "@/lib/locale";
import { SEAT_TAKING_STATUSES } from "@/lib/events";

const DAY_MS = 24 * 60 * 60_000;

/** Statuses that represent a won deal, for the conversion figure. */
const CONVERTED: LeadStatus[] = [LeadStatus.WON];

/**
 * Statuses that count as a real, worked lead.
 *
 * LOST is included: a lead that was pursued and lost still belongs in the
 * denominator, or the conversion rate flatters itself by ignoring failures.
 * NEW is excluded — it has not been worked yet, so counting it would
 * penalise a team for leads that arrived this morning.
 */
const WORKED: LeadStatus[] = [
  LeadStatus.CONTACTED,
  LeadStatus.QUALIFIED,
  LeadStatus.VIEWING_SCHEDULED,
  LeadStatus.NEGOTIATING,
  LeadStatus.WON,
  LeadStatus.LOST,
];

export type MonthlyLeadPoint = {
  /** "2026-08" — sortable, and the label is formatted at render time. */
  month: string;
  total: number;
  won: number;
};

export type SourceSlice = { source: string; count: number };

export type ProjectConversion = {
  projectId: string;
  name: string;
  total: number;
  worked: number;
  won: number;
  /** Percentage of worked leads that closed, 0–100. Null when none worked. */
  rate: number | null;
};

/** First day of the month, `months` back, at local midnight. */
function startOfMonthsAgo(months: number): Date {
  const date = new Date();
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  date.setMonth(date.getMonth() - months);
  return date;
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Leads per month for the last `months` months, including empty ones.
 *
 * Gaps are filled deliberately: a chart that skips a month with no leads
 * draws a straight line across it and hides the fact that nothing came in.
 */
export async function getMonthlyLeads(months = 12): Promise<MonthlyLeadPoint[]> {
  const since = startOfMonthsAgo(months - 1);

  const rows = await safeQuery(
    "report:monthlyLeads",
    () =>
      prisma.leadInquiry.findMany({
        where: { createdAt: { gte: since } },
        select: { createdAt: true, status: true },
      }),
    [] as { createdAt: Date; status: LeadStatus }[],
  );

  // Seed every bucket first, so a quiet month renders as zero not absent.
  const buckets = new Map<string, MonthlyLeadPoint>();

  for (let i = 0; i < months; i += 1) {
    const date = startOfMonthsAgo(months - 1 - i);
    buckets.set(monthKey(date), { month: monthKey(date), total: 0, won: 0 });
  }

  for (const row of rows) {
    const bucket = buckets.get(monthKey(row.createdAt));
    if (!bucket) continue;

    bucket.total += 1;
    if (CONVERTED.includes(row.status)) bucket.won += 1;
  }

  return [...buckets.values()];
}

/** Lead volume by source over the same window, largest first. */
export async function getLeadsBySource(months = 12): Promise<SourceSlice[]> {
  const since = startOfMonthsAgo(months - 1);

  const rows = await safeQuery(
    "report:leadsBySource",
    () =>
      prisma.leadInquiry.groupBy({
        by: ["source"],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
      }),
    [] as { source: string; _count: { _all: number } }[],
  );

  return rows
    .map((row) => ({ source: row.source, count: row._count._all }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Conversion per project.
 *
 * Reported as won ÷ worked, not won ÷ total — see the note on WORKED. A
 * project with no worked leads gets null rather than 0%, because "nobody
 * has called them yet" and "we called everyone and closed none" are very
 * different facts and should not render identically.
 */
export async function getProjectConversions(
  locale: string,
  months = 12,
): Promise<ProjectConversion[]> {
  const since = startOfMonthsAgo(months - 1);

  const [projects, leads] = await Promise.all([
    safeQuery(
      "report:conversionProjects",
      () =>
        prisma.project.findMany({
          where: { deletedAt: null },
          select: { id: true, nameEn: true, nameTh: true },
        }),
      [] as { id: string; nameEn: string; nameTh: string }[],
    ),
    safeQuery(
      "report:conversionLeads",
      () =>
        prisma.leadInquiry.groupBy({
          by: ["projectId", "status"],
          where: { createdAt: { gte: since }, projectId: { not: null } },
          _count: { _all: true },
        }),
      [] as { projectId: string | null; status: LeadStatus; _count: { _all: number } }[],
    ),
  ]);

  const byProject = new Map<string, { total: number; worked: number; won: number }>();

  for (const row of leads) {
    if (!row.projectId) continue;

    const entry =
      byProject.get(row.projectId) ?? { total: 0, worked: 0, won: 0 };

    entry.total += row._count._all;
    if (WORKED.includes(row.status)) entry.worked += row._count._all;
    if (CONVERTED.includes(row.status)) entry.won += row._count._all;

    byProject.set(row.projectId, entry);
  }

  return projects
    .map((project) => {
      const counts = byProject.get(project.id) ?? { total: 0, worked: 0, won: 0 };

      return {
        projectId: project.id,
        name: pickLocale(locale, project.nameTh, project.nameEn),
        ...counts,
        rate:
          counts.worked === 0
            ? null
            : Math.round((counts.won / counts.worked) * 1000) / 10,
      };
    })
    // Projects with no leads at all are noise on a conversion table.
    .filter((row) => row.total > 0)
    .sort((a, b) => b.total - a.total);
}

export type WeekOverWeek = {
  thisWeek: number;
  lastWeek: number;
  /** Percentage change vs. last week; null when last week had zero leads — there is no baseline to divide by. */
  changePercent: number | null;
};

/**
 * This week's lead count next to last week's, for a delta badge rather than
 * a lone number a viewer has to remember from last Monday's meeting.
 */
export async function getWeekOverWeekLeads(): Promise<WeekOverWeek> {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS);
  const twoWeeksAgo = new Date(now.getTime() - 14 * DAY_MS);

  const [thisWeek, lastWeek] = await Promise.all([
    safeQuery(
      "report:leadsThisWeek",
      () => prisma.leadInquiry.count({ where: { createdAt: { gte: weekAgo } } }),
      0,
    ),
    safeQuery(
      "report:leadsLastWeek",
      () =>
        prisma.leadInquiry.count({
          where: { createdAt: { gte: twoWeeksAgo, lt: weekAgo } },
        }),
      0,
    ),
  ]);

  return {
    thisWeek,
    lastWeek,
    changePercent:
      lastWeek === 0 ? null : Math.round(((thisWeek - lastWeek) / lastWeek) * 1000) / 10,
  };
}

/** Every LeadStatus, in the order a lead actually moves through them. */
const PIPELINE_ORDER: LeadStatus[] = [
  LeadStatus.NEW,
  LeadStatus.CONTACTED,
  LeadStatus.QUALIFIED,
  LeadStatus.VIEWING_SCHEDULED,
  LeadStatus.NEGOTIATING,
  LeadStatus.WON,
  LeadStatus.LOST,
];

export type PipelineStage = { status: LeadStatus; count: number };

/**
 * Current backlog by status, across every lead ever recorded — deliberately
 * NOT windowed to the last 12 months like the reports above. A lead stuck in
 * NEGOTIATING since three months ago is still stuck; scoping this to a
 * recent window would answer "what came in lately" rather than the question
 * this exists for: where is everything sitting right now.
 */
export async function getLeadPipeline(): Promise<PipelineStage[]> {
  const rows = await safeQuery(
    "report:leadPipeline",
    () =>
      prisma.leadInquiry.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
    [] as { status: LeadStatus; _count: { _all: number } }[],
  );

  const counts = new Map(rows.map((row) => [row.status, row._count._all]));

  return PIPELINE_ORDER.map((status) => ({ status, count: counts.get(status) ?? 0 }));
}

export type EventRsvpSummary = {
  eventId: string;
  title: string;
  startsAt: Date;
  capacity: number | null;
  registered: number;
  /** Percentage of capacity filled, 0-100. Null when the event has no cap. */
  fillRate: number | null;
};

/**
 * The most recent `limit` events (any publish state — an admin report,
 * unlike the public listing, should not hide a draft event's numbers) with
 * registered seats against capacity.
 *
 * "Registered" reuses SEAT_TAKING_STATUSES from lib/events.ts (PENDING,
 * CONFIRMED, ATTENDED) rather than re-deriving "not cancelled" here — it is
 * the same definition of a taken seat the public RSVP form and capacity
 * check already use, so this report and "sold out" on the site can never
 * quietly disagree about what counts.
 */
export async function getEventRsvpSummary(
  locale: string,
  limit = 8,
): Promise<EventRsvpSummary[]> {
  const rows = await safeQuery(
    "report:eventRsvp",
    () =>
      prisma.event.findMany({
        orderBy: { startsAt: "desc" },
        take: limit,
        select: {
          id: true,
          titleEn: true,
          titleTh: true,
          startsAt: true,
          capacity: true,
          registrations: {
            where: { status: { in: [...SEAT_TAKING_STATUSES] } },
            select: { partySize: true },
          },
        },
      }),
    [] as {
      id: string;
      titleEn: string;
      titleTh: string;
      startsAt: Date;
      capacity: number | null;
      registrations: { partySize: number }[];
    }[],
  );

  return rows.map((row) => {
    const registered = row.registrations.reduce((sum, r) => sum + r.partySize, 0);

    return {
      eventId: row.id,
      title: pickLocale(locale, row.titleTh, row.titleEn),
      startsAt: row.startsAt,
      capacity: row.capacity,
      registered,
      fillRate:
        row.capacity && row.capacity > 0
          ? Math.round((registered / row.capacity) * 1000) / 10
          : null,
    };
  });
}
