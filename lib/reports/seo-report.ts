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

import "server-only";
import { prisma } from "@/lib/prisma";
import { safeQuery } from "@/lib/db";
import { pickLocale } from "@/lib/locale";
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
  /** Phase 4. */
  googleClicks: Unavailable;
  googleLeads: number;
  allLeads: number;
  /** Phase 4: googleLeads / googleClicks, and null until clicks exist. */
  rate: null;
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
  /** Phase 4. */
  search: Unavailable;
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
function searchConsoleConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_SA_EMAIL?.trim() &&
      process.env.GOOGLE_SA_PRIVATE_KEY?.trim() &&
      process.env.GSC_SITE_URL?.trim(),
  );
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

  const [
    leads,
    previousLeads,
    projects,
    countedSince,
    audit,
    previousAudit,
    vitals,
    note,
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
    vitalsFor(period.start, period.end),
    readNote(period, audience, locale),
  ]);

  const slugToProjectId = new Map(
    projects.map((project) => [project.slug, project.id]),
  );

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
    topIssues: topIssuesOf(audit?.failCountByRule),
    vitals,
    rows: buildRows(leads, projects, slugToProjectId, locale),
    /*
      Phase 6 hardcoded both of these as unavailable, because phase 4 did
      not exist yet. It does now, so the report says which of the two
      reasons applies instead of claiming Google is unconnected on a
      deployment where the credentials work.
    */
    search: searchConsoleConfigured() ? NO_DATA : NOT_CONFIGURED,
    indexing: searchConsoleConfigured() ? NO_DATA : NOT_CONFIGURED,
    note: note ?? draftNoteView(),
  };
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
function auditScoreAt(
  before: Date,
): Promise<{ avgScore: number; runAt: Date; failCountByRule: unknown } | null> {
  return safeQuery(
    "report:auditScore",
    () =>
      prisma.seoAuditRun.findFirst({
        where: { runAt: { lt: before } },
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
): ReportRow[] {
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

  const rows: ReportRow[] = projects
    .filter((project) => counts.has(project.id))
    .map((project) => {
      const entry = counts.get(project.id)!;
      return {
        key: project.id,
        name: pickLocale(locale, project.nameTh, project.nameEn),
        googleClicks: searchConsoleConfigured() ? NO_DATA : NOT_CONFIGURED,
        googleLeads: entry.google,
        allLeads: entry.all,
        rate: null,
      };
    });

  const news = counts.get("news");
  if (news) {
    rows.push({
      key: "news",
      name: "news",
      googleClicks: searchConsoleConfigured() ? NO_DATA : NOT_CONFIGURED,
      googleLeads: news.google,
      allLeads: news.all,
      rate: null,
    });
  }

  // Most Google leads first: the table's job is to say where the work paid
  // off, and while clicks are unavailable that is the only ordering the
  // data supports. Ties fall back to total volume.
  return rows.sort(
    (a, b) => b.googleLeads - a.googleLeads || b.allLeads - a.allLeads,
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
