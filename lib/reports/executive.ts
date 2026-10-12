import "server-only";

/**
 * lib/reports/executive.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The whole-site figures behind the executive report on /admin/reports.
 *
 * The SEO report (seo-report.ts) answers "is Google sending us buyers".
 * An executive reading the monthly PDF also wants to know how many people
 * came, how many enquired, how many booked a viewing, how many bought,
 * and whether the site is healthy, each set against the month before. So
 * this adds the site-wide figures beside it.
 *
 * Every figure is bounded by the report's period ([start, end), UTC, see
 * lib/reports/period.ts) and set against precedingPeriod(). The Analytics
 * screen's getters count back from today, so a PDF for September run in
 * October would have described October. The pipeline is the exception: it
 * is a snapshot of now, and the report labels it that way.
 *
 * "Won" is leads whose status is WON and whose record last changed inside
 * the period. There is no status-history table to say when a lead was
 * won, and counting by creation date would credit a September sale to
 * whichever month the enquiry first arrived in.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { AppointmentStatus, LeadStatus, PathHitKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { safeQuery } from "@/lib/db";
import { hitDay } from "@/lib/redirects";
import { precedingPeriod, type Period } from "@/lib/reports/period";
import { getEventRsvpSummary, getLeadPipeline, type PipelineSummary } from "@/lib/reports";
import { locales } from "@/i18n";

const DAY_MS = 86_400_000;

export type Compared = { current: number; previous: number };

export type ExecutiveData = {
  views: Compared & { days: { day: string; count: number }[] };
  viewings: Compared;
  won: Compared;
  bySource: { source: string; count: number }[];
  /** `title` is the project or article name for /projects/x and /news/x,
   *  null otherwise. The component names the fixed pages from nav labels. */
  topPages: { path: string; title: string | null; views: number }[];
  pipeline: PipelineSummary;
  events: { title: string; startsAt: Date; registered: number; capacity: number | null }[];
};

/** "/th/projects/x" → "/projects/x", so the four languages of a page add up. */
function withoutLocale(path: string): string {
  const match = path.match(new RegExp(`^/(${locales.join("|")})(?=/|$)`));
  const rest = match ? path.slice(match[0].length) : path;
  return rest === "" ? "/" : rest;
}

async function viewsBetween(start: Date, end: Date) {
  return safeQuery(
    "executive:views",
    () =>
      prisma.pathHitDay.groupBy({
        by: ["day"],
        where: { kind: PathHitKind.PAGE_VIEW, day: { gte: hitDay(start), lt: hitDay(end) } },
        _sum: { hits: true },
      }),
    [] as { day: Date; _sum: { hits: number | null } }[],
  );
}

export async function getExecutiveData(period: Period, locale: string): Promise<ExecutiveData> {
  const previous = precedingPeriod(period);
  const inPeriod = { gte: period.start, lt: period.end };
  const inPrevious = { gte: previous.start, lt: previous.end };
  const viewingStatuses = { not: AppointmentStatus.CANCELLED };

  const [
    viewRows,
    previousViewRows,
    pageRows,
    viewings,
    previousViewings,
    won,
    previousWon,
    bySource,
    pipeline,
    events,
  ] = await Promise.all([
    viewsBetween(period.start, period.end),
    viewsBetween(previous.start, previous.end),
    safeQuery(
      "executive:topPages",
      () =>
        prisma.pathHitDay.groupBy({
          by: ["path"],
          where: { kind: PathHitKind.PAGE_VIEW, day: { gte: hitDay(period.start), lt: hitDay(period.end) } },
          _sum: { hits: true },
        }),
      [] as { path: string; _sum: { hits: number | null } }[],
    ),
    safeQuery("executive:viewings", () => prisma.appointment.count({ where: { scheduledAt: inPeriod, status: viewingStatuses } }), 0),
    safeQuery("executive:viewingsPrev", () => prisma.appointment.count({ where: { scheduledAt: inPrevious, status: viewingStatuses } }), 0),
    safeQuery("executive:won", () => prisma.leadInquiry.count({ where: { status: LeadStatus.WON, updatedAt: inPeriod } }), 0),
    safeQuery("executive:wonPrev", () => prisma.leadInquiry.count({ where: { status: LeadStatus.WON, updatedAt: inPrevious } }), 0),
    safeQuery(
      "executive:bySource",
      () => prisma.leadInquiry.groupBy({ by: ["source"], where: { createdAt: inPeriod }, _count: { _all: true } }),
      [] as { source: string; _count: { _all: number } }[],
    ),
    getLeadPipeline(),
    getEventRsvpSummary(locale, 24),
  ]);

  // Every day of the period, zero-filled, so the chart's x-axis is the period.
  const byDay = new Map(viewRows.map((row) => [row.day.toISOString().slice(0, 10), row._sum.hits ?? 0]));
  const days: { day: string; count: number }[] = [];
  for (let at = hitDay(period.start).getTime(); at < hitDay(period.end).getTime(); at += DAY_MS) {
    const key = new Date(at).toISOString().slice(0, 10);
    days.push({ day: key, count: byDay.get(key) ?? 0 });
  }

  const pages = new Map<string, number>();
  for (const row of pageRows) {
    const path = withoutLocale(row.path);
    pages.set(path, (pages.get(path) ?? 0) + (row._sum.hits ?? 0));
  }

  const top = [...pages.entries()]
    .map(([path, views]) => ({ path, views }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 6);
  const titles = await titlesFor(top.map((page) => page.path), locale);

  return {
    views: {
      current: days.reduce((sum, d) => sum + d.count, 0),
      previous: previousViewRows.reduce((sum, row) => sum + (row._sum.hits ?? 0), 0),
      days,
    },
    viewings: { current: viewings, previous: previousViewings },
    won: { current: won, previous: previousWon },
    bySource: bySource
      .map((row) => ({ source: row.source, count: row._count._all }))
      .sort((a, b) => b.count - a.count),
    topPages: top.map((page) => ({ ...page, title: titles.get(page.path) ?? null })),
    pipeline,
    events: events
      .filter((event) => event.startsAt >= period.start && event.startsAt < period.end)
      .map(({ title, startsAt, registered, capacity }) => ({ title, startsAt, registered, capacity })),
  };
}

/**
 * Names for the detail pages among `paths`: "/projects/victory" becomes
 * "The Victory". An executive does not read slugs, and a page that cannot
 * be named keeps its path rather than a guess.
 */
async function titlesFor(paths: string[], locale: string): Promise<Map<string, string>> {
  const slugs = (prefix: string) =>
    paths.filter((path) => path.startsWith(prefix)).map((path) => path.slice(prefix.length).split("/")[0]);
  const thai = locale === "th";

  const [projects, articles] = await Promise.all([
    safeQuery(
      "executive:projectTitles",
      () => prisma.project.findMany({ where: { slug: { in: slugs("/projects/") } }, select: { slug: true, nameTh: true, nameEn: true } }),
      [] as { slug: string; nameTh: string; nameEn: string }[],
    ),
    safeQuery(
      "executive:articleTitles",
      () =>
        prisma.newsArticle.findMany({
          where: { slug: { in: slugs("/news/") } },
          select: { slug: true, titleTh: true, titleEn: true, translations: { where: { locale }, select: { title: true } } },
        }),
      [] as { slug: string; titleTh: string; titleEn: string; translations: { title: string }[] }[],
    ),
  ]);

  const names = new Map<string, string>();
  for (const p of projects) names.set(`/projects/${p.slug}`, thai ? p.nameTh || p.nameEn : p.nameEn || p.nameTh);
  for (const a of articles) {
    names.set(`/news/${a.slug}`, a.translations[0]?.title || (thai ? a.titleTh : a.titleEn) || a.titleEn);
  }
  return names;
}

/** Percentage change, or null when there is nothing to compare against. */
export function changePercent({ current, previous }: Compared): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}
