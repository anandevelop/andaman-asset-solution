/**
 * lib/reports/seo-report.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Everything the monthly report prints, gathered once.
 *
 * WHAT THIS FILE REFUSES TO DO
 *
 * It never divides a count of one population by a count of another. The
 * conversion rate per development is Google leads over Google clicks, and
 * while the clicks half does not exist — it arrives with Search Console in
 * phase 4 — the rate is null and the column prints a dash. A rate computed
 * against "leads from everywhere" would be a number the report could show
 * today, and it would be wrong in the specific way lib/reports/google-origin.ts
 * exists to prevent. "Leads from all channels" is still shown, in its own
 * column, clearly not part of any rate.
 *
 * WHAT IS MISSING IS SAID OUT LOUD
 *
 * Phases 4 and 5 are not built, so search clicks and index coverage are
 * absent rather than zero. `available: false` travels with each of them and
 * the screen prints "not connected to Google yet". Zero would read as "we
 * got no clicks in August", which is a different and much worse claim.
 *
 * COUNTED SINCE
 *
 * Landing capture began when phase 3 deployed and cannot be backfilled, so
 * every lead older than that has no landing at all and can never be
 * credited to Google. The date it began is derived from the data itself —
 * the first lead that carries a landing — and printed on the report. Without
 * it, an August report covering a July deploy reads as "Google sent us
 * almost nobody".
 *
 * Every read goes through safeQuery: a report screen should come up empty
 * rather than 500 when Postgres blinks.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { getGoogleConfig } from "@/lib/google-config";
import "server-only";
import { prisma } from "@/lib/prisma";
import { safeQuery } from "@/lib/db";
import { pickLocale } from "@/lib/locale";
import { stripLocale } from "@/lib/public-paths";
import { isGoogleOrigin, landingBucket } from "@/lib/reports/google-origin";
import {
  lastCoveredDay,
  precedingPeriod,
  type Period,
} from "@/lib/reports/period";
import {
  MIN_SAMPLES,
  rateVital,
  type VitalKey,
  type VitalRating,
} from "@/lib/analytics/vitals";

/** A figure that needs a data source this deployment does not have yet. */
/**
 * A figure that needs Google, and why it is not here.
 *
 *   notConfigured  no service account or no property set
 *   noData         connected, and Google has nothing for this property —
 *                  which is what a site it has never crawled looks like
 *
 * The two are a different problem with a different fix, and the screen
 * that says "not connected to Google yet" when the credentials are in
 * fact working sends somebody to check the wrong thing.
 */
export type Unavailable = {
  available: false;
  reason: "notConfigured" | "noData";
};

export type LeadTotals = {
  /** Landed from a Google search result, no utm — see google-origin.ts. */
  google: number;
  /** Every lead in the period, whatever brought them. Context, never a
   *  denominator. */
  all: number;
};

export type ReportRow = {
  /** A project id, or the literal "news" for the articles row. */
  key: string;
  name: string;
  /** Clicks from Google search results onto this development's pages
   *  (Search Console), or why there are none to show. */
  googleClicks: number | Unavailable;
  googleLeads: number;
  allLeads: number;
  /** googleLeads / googleClicks as a percentage; null without clicks. */
  rate: number | null;
};

/** Search Console's figures for the period (lib/seo/search-sync.ts). */
export type SearchSummary = {
  available: true;
  clicks: number;
  impressions: number;
  previousClicks: number;
  /** Impression-weighted average position, or null with no impressions. */
  position: number | null;
  topQueries: { query: string; clicks: number; impressions: number }[];
};

export type ReportVital = {
  metric: VitalKey;
  value: number;
  rating: VitalRating;
  sampleCount: number;
  enoughSamples: boolean;
};

export type ReportNoteView = {
  body: string;
  /** True while nobody has edited the system's draft — the sent report
   *  carries an "automatic draft" label. */
  isDraft: boolean;
  editedBy: string | null;
  updatedAt: Date | null;
};

export type ReportData = {
  period: Period;
  coversUntil: Date;
  /** When landing capture started, or null if no lead carries one yet. */
  countedSince: Date | null;
  leads: { current: LeadTotals; previous: LeadTotals };
  audit: { score: number | null; previous: number | null; runAt: Date | null };
  /** Rules failing on the most URLs at the end of the period, worst first.
   *  What the drafted note turns into "fill in the 37 missing meta
   *  descriptions". */
  topIssues: { rule: string; urlCount: number }[];
  vitals: ReportVital[];
  rows: ReportRow[];
  /** Search Console for the period, or why it is absent. */
  search: SearchSummary | Unavailable;
  /** Phase 5. */
  indexing: Unavailable;
  note: ReportNoteView;
};

const NOT_CONFIGURED: Unavailable = { available: false, reason: "notConfigured" };
const NO_DATA: Unavailable = { available: false, reason: "noData" };

/**
 * Whether Search Console is wired up at all.
 *
 * Both halves are needed: a service account with no property to ask about
 * is as useless as a property with no credentials, and either one missing
 * means "not finished being set up" rather than "Google has nothing".
 */
async function searchConsoleConfigured(): Promise<boolean> {
  // Back office first, environment behind it — lib/google-config.ts.
  const config = await getGoogleConfig();
  return Boolean(config.credentials && config.gscSiteUrl);
}

type LeadRow = {
  projectId: string | null;
  landingPath: string | null;
  landingReferrer: string | null;
  utmMedium: string | null;
};

export async function getReportData(options: {
  period: Period;
  locale: string;
  audience: string;
}): Promise<ReportData> {
  const { period, locale, audience } = options;
  const previous = precedingPeriod(period);
  const gscConfigured = await searchConsoleConfigured();

  const [
    leads,
    previousLeads,
    projects,
    countedSince,
    audit,
    previousAudit,
    latestAudit,
    vitals,
    note,
    searchPages,
    searchQueries,
    previousSearchClicks,
  ] = await Promise.all([
    leadsBetween(period.start, period.end),
    leadsBetween(previous.start, previous.end),
    safeQuery(
      "report:projects",
      () =>
        prisma.project.findMany({
          where: { deletedAt: null },
          select: { id: true, slug: true, nameEn: true, nameTh: true },
        }),
      [] as { id: string; slug: string; nameEn: string; nameTh: string }[],
    ),
    getCountedSince(),
    auditScoreAt(period.end),
    auditScoreAt(previous.end),
    auditScoreAt(null),
    vitalsFor(period.start, period.end),
    readNote(period, audience, locale),
    searchByPage(period.start, period.end),
    searchTopQueries(period.start, period.end),
    searchClicks(previous.start, previous.end),
  ]);

  /*
    Search Console is read from the same table the Keywords screen reads
    (seo_query_stats, filled nightly). The report used to print "not
    connected" whatever was in it, because this half was written before the
    sync existed.
  */
  const slugToProjectId = new Map(projects.map((project) => [project.slug, project.id]));
  const hasSearchData = searchPages.length > 0;
  const clicksByKey = new Map<string, number>();
  let clicks = 0;
  let impressions = 0;
  let weighted = 0;
  for (const row of searchPages) {
    clicks += row.clicks;
    impressions += row.impressions;
    weighted += row.position * row.impressions;
    const bucket = landingBucket(pathOfPage(row.page), slugToProjectId);
    const key = bucket?.kind === "project" ? bucket.projectId : bucket?.kind === "news" ? "news" : null;
    if (key) clicksByKey.set(key, (clicksByKey.get(key) ?? 0) + row.clicks);
  }
  const unavailable = gscConfigured ? NO_DATA : NOT_CONFIGURED;
  const search: SearchSummary | Unavailable = hasSearchData
    ? {
        available: true,
        clicks,
        impressions,
        previousClicks: previousSearchClicks,
        position: impressions > 0 ? weighted / impressions : null,
        topQueries: searchQueries,
      }
    : unavailable;


  return {
    period,
    coversUntil: lastCoveredDay(period),
    countedSince,
    leads: {
      current: totals(leads),
      previous: totals(previousLeads),
    },
    audit: {
      score: audit?.avgScore ?? null,
      previous: previousAudit?.avgScore ?? null,
      runAt: audit?.runAt ?? null,
    },
    /*
      "What to fix" comes from the newest audit there is — the same run the
      Health check screen shows — not from the last run inside the period.
      The October report listed 48 pages without og:image for weeks after
      they were fixed (and after the rule that miscounted them was), because
      it was reading a run from the end of October. The two scores above
      stay tied to the period: they are history, this list is a to-do.
    */
    topIssues: topIssuesOf((latestAudit ?? audit)?.failCountByRule),
    vitals,
    rows: buildRows(leads, projects, slugToProjectId, locale, hasSearchData ? clicksByKey : unavailable),
    search,
    indexing: unavailable,
    note: note ?? draftNoteView(),
  };
}

/** "https://site/th/projects/victory?x" → "/projects/victory". */
function pathOfPage(page: string): string {
  let path = page;
  try {
    path = new URL(page).pathname;
  } catch {
    // Already a path, or nothing parseable: bucket it as it is.
  }
  return stripLocale(path);
}

type SearchPageRow = { page: string; clicks: number; impressions: number; position: number };

/** Search Console per page for the period: clicks, impressions, and the
 *  impression-weighted position. */
async function searchByPage(start: Date, end: Date): Promise<SearchPageRow[]> {
  const rows = await safeQuery(
    "report:searchByPage",
    () =>
      prisma.seoQueryStat.findMany({
        where: { date: { gte: start, lt: end } },
        select: { page: true, clicks: true, impressions: true, position: true },
      }),
    [] as SearchPageRow[],
  );
  const byPage = new Map<string, { clicks: number; impressions: number; weighted: number }>();
  for (const row of rows) {
    const entry = byPage.get(row.page) ?? { clicks: 0, impressions: 0, weighted: 0 };
    entry.clicks += row.clicks;
    entry.impressions += row.impressions;
    entry.weighted += row.position * row.impressions;
    byPage.set(row.page, entry);
  }
  return [...byPage].map(([page, e]) => ({
    page,
    clicks: e.clicks,
    impressions: e.impressions,
    position: e.impressions > 0 ? e.weighted / e.impressions : 0,
  }));
}

async function searchTopQueries(start: Date, end: Date): Promise<SearchSummary["topQueries"]> {
  const rows = await safeQuery(
    "report:searchQueries",
    () =>
      prisma.seoQueryStat.groupBy({
        by: ["query"],
        where: { date: { gte: start, lt: end } },
        _sum: { clicks: true, impressions: true },
        orderBy: [{ _sum: { clicks: "desc" } }, { _sum: { impressions: "desc" } }],
        take: 5,
      }),
    [] as { query: string; _sum: { clicks: number | null; impressions: number | null } }[],
  );
  return rows.map((row) => ({ query: row.query, clicks: row._sum.clicks ?? 0, impressions: row._sum.impressions ?? 0 }));
}

async function searchClicks(start: Date, end: Date): Promise<number> {
  const result = await safeQuery(
    "report:searchClicksPrevious",
    () => prisma.seoQueryStat.aggregate({ where: { date: { gte: start, lt: end } }, _sum: { clicks: true } }),
    { _sum: { clicks: null as number | null } },
  );
  return result._sum.clicks ?? 0;
}

function leadsBetween(start: Date, end: Date): Promise<LeadRow[]> {
  return safeQuery(
    "report:leads",
    () =>
      prisma.leadInquiry.findMany({
        where: { createdAt: { gte: start, lt: end } },
        select: {
          projectId: true,
          landingPath: true,
          landingReferrer: true,
          utmMedium: true,
        },
      }),
    [] as LeadRow[],
  );
}

function totals(leads: readonly LeadRow[]): LeadTotals {
  return {
    google: leads.filter(isGoogleOrigin).length,
    all: leads.length,
  };
}

/**
 * The first lead that carries a landing — in other words, the moment
 * phase 3 went live.
 *
 * Read from the data rather than configured, because a hardcoded date
 * would be wrong for staging, wrong after a restore, and wrong for anyone
 * reading the repository a year from now. Null means capture has not
 * recorded anything yet, and the report says so rather than printing a
 * conversion of zero.
 */
function getCountedSince(): Promise<Date | null> {
  return safeQuery(
    "report:countedSince",
    async () => {
      const first = await prisma.leadInquiry.findFirst({
        where: {
          OR: [
            { landingPath: { not: null } },
            { landingReferrer: { not: null } },
          ],
        },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      });

      return first?.createdAt ?? null;
    },
    null,
  );
}

/**
 * The audit as it stood at the end of a period.
 *
 * The last run *before* the boundary, not the newest run overall: an
 * August report published in October must show August's score, or every
 * report ever reprinted silently shows today's.
 */
/** The newest audit run before `before`, or the newest of all for null. */
function auditScoreAt(
  before: Date | null,
): Promise<{ avgScore: number; runAt: Date; failCountByRule: unknown } | null> {
  return safeQuery(
    "report:auditScore",
    () =>
      prisma.seoAuditRun.findFirst({
        ...(before && { where: { runAt: { lt: before } } }),
        orderBy: { runAt: "desc" },
        select: { avgScore: true, runAt: true, failCountByRule: true },
      }),
    null,
  );
}

/**
 * The run's per-rule failure counts, worst first.
 *
 * Read defensively: failCountByRule is Json, so a row written by an older
 * version of the audit — or by hand — can hold anything at all, and a
 * report must not 500 because one historic row has a string where a number
 * belongs.
 */
function topIssuesOf(
  failCountByRule: unknown,
): { rule: string; urlCount: number }[] {
  if (
    !failCountByRule ||
    typeof failCountByRule !== "object" ||
    Array.isArray(failCountByRule)
  ) {
    return [];
  }

  return Object.entries(failCountByRule as Record<string, unknown>)
    .filter(
      ([, count]) =>
        typeof count === "number" && Number.isFinite(count) && count > 0,
    )
    .map(([rule, count]) => ({ rule, urlCount: count as number }))
    .sort((a, b) => b.urlCount - a.urlCount);
}

/**
 * Core Web Vitals for the period, site-wide.
 *
 * Sample-weighted across days and devices, which is the same approximation
 * lib/analytics/vitals-report.ts documents at length: the true p75 over a
 * month needs the raw values, which are deleted after thirty days by
 * design. `enoughSamples` travels with each figure so the report can
 * decline to print one rather than show a percentile drawn from nine
 * visits.
 */
function vitalsFor(start: Date, end: Date): Promise<ReportVital[]> {
  return safeQuery(
    "report:vitals",
    async () => {
      const rollups = await prisma.vitalDailyRollup.findMany({
        where: { day: { gte: start, lt: end } },
        select: { metric: true, p75: true, sampleCount: true },
      });

      const metrics: VitalKey[] = ["LCP", "INP", "CLS", "TTFB"];

      return metrics.map((metric) => {
        const rows = rollups.filter((row) => row.metric === metric);

        let weighted = 0;
        let samples = 0;
        for (const row of rows) {
          weighted += row.p75 * row.sampleCount;
          samples += row.sampleCount;
        }

        const value = samples === 0 ? 0 : Math.round(weighted / samples);

        return {
          metric,
          value,
          rating: rateVital(metric, value),
          sampleCount: samples,
          enoughSamples: samples >= MIN_SAMPLES,
        };
      });
    },
    [] as ReportVital[],
  );
}

/**
 * One row per development, plus one for articles.
 *
 * Articles share a row deliberately: "which development earned this" is
 * the question an executive report answers, and forty article rows would
 * bury three project rows. Which article earned it is the content report's
 * job.
 *
 * A lead that landed anywhere else — the home page, /contact, /about — is
 * in the headline totals but has no row here, because there is no
 * development to act on. The two therefore do not add up, and the report
 * says so beneath the table rather than quietly padding it with an
 * "other" row nobody can do anything about.
 */
function buildRows(
  leads: readonly LeadRow[],
  projects: readonly { id: string; nameEn: string; nameTh: string }[],
  slugToProjectId: ReadonlyMap<string, string>,
  locale: string,
  /** Search clicks per row key, or why there are none. */
  clicks: ReadonlyMap<string, number> | Unavailable,
): ReportRow[] {
  const clicksOf = (key: string): number | Unavailable => (clicks instanceof Map ? (clicks.get(key) ?? 0) : (clicks as Unavailable));
  const rateOf = (key: string, googleLeads: number): number | null => {
    const n = clicksOf(key);
    return typeof n === "number" && n > 0 ? Math.round((googleLeads / n) * 1000) / 10 : null;
  };
  const counts = new Map<string, { google: number; all: number }>();

  for (const lead of leads) {
    const bucket = landingBucket(lead.landingPath, slugToProjectId);

    /*
      A lead with no landing at all still belongs to its project row when
      the form recorded one — that is what projectId has always meant, and
      dropping those leads would make "all channels" smaller than the truth
      for every lead taken before phase 3.

      It can never count towards the Google column, though: without a
      landing there is no evidence of where it came from.
    */
    const key =
      bucket?.kind === "project"
        ? bucket.projectId
        : bucket?.kind === "news"
          ? "news"
          : lead.projectId;

    if (!key) continue;

    const entry = counts.get(key) ?? { google: 0, all: 0 };
    entry.all += 1;
    if (isGoogleOrigin(lead)) entry.google += 1;
    counts.set(key, entry);
  }

  // A development that drew clicks and no enquiry is the row most worth
  // seeing, so clicks earn a row as leads do.
  const hasClicks = (key: string) => clicks instanceof Map && (clicks.get(key) ?? 0) > 0;
  const rows: ReportRow[] = projects
    .filter((project) => counts.has(project.id) || hasClicks(project.id))
    .map((project) => {
      const entry = counts.get(project.id) ?? { google: 0, all: 0 };
      return {
        key: project.id,
        name: pickLocale(locale, project.nameTh, project.nameEn),
        googleClicks: clicksOf(project.id),
        googleLeads: entry.google,
        allLeads: entry.all,
        rate: rateOf(project.id, entry.google),
      };
    });

  const news = counts.get("news");
  if (news || hasClicks("news")) {
    rows.push({
      key: "news",
      name: "news",
      googleClicks: clicksOf("news"),
      googleLeads: news?.google ?? 0,
      allLeads: news?.all ?? 0,
      rate: rateOf("news", news?.google ?? 0),
    });
  }

  // Most Google leads first: the table's job is to say where the work paid
  // off. Ties fall back to search clicks, then to total volume.
  const clicksNumber = (row: ReportRow) => (typeof row.googleClicks === "number" ? row.googleClicks : 0);
  return rows.sort(
    (a, b) => b.googleLeads - a.googleLeads || clicksNumber(b) - clicksNumber(a) || b.allLeads - a.allLeads,
  );
}

function readNote(
  period: Period,
  audience: string,
  locale: string,
): Promise<ReportNoteView | null> {
  return safeQuery(
    "report:note",
    async () => {
      const note = await prisma.reportNote.findUnique({
        where: {
          period_audience_locale: { period: period.noteKey, audience, locale },
        },
        select: {
          body: true,
          updatedAt: true,
          updatedBy: { select: { name: true } },
        },
      });

      if (!note) return null;

      return {
        body: note.body,
        // Null editor means the stored text is still the system's draft —
        // see the model's own comment.
        isDraft: note.updatedBy === null,
        editedBy: note.updatedBy?.name ?? null,
        updatedAt: note.updatedAt,
      };
    },
    null,
  );
}

/** No row yet: the screen drafts one from the data and offers it for
 *  editing, without writing anything during a page render. */
function draftNoteView(): ReportNoteView {
  return { body: "", isDraft: true, editedBy: null, updatedAt: null };
}
