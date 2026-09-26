/**
 * lib/seo/audit-report.ts
 * ─────────────────────────────────────────────────────────────────────────
 * What the two audit screens read. All of it is derived from the two tables
 * lib/seo/run-audit.ts writes, and none of it recomputes a rule: the screen
 * shows what the last run found, not a second opinion formed at page load.
 *
 * That is the opposite of lib/seo-audit.ts, which recomputes its numbers on
 * every render because they are cheap aggregates over a few dozen rows.
 * These are not: an audit means fetching every page on the site.
 *
 * WHY THE PREVIOUS RUN IS FETCHED TOO
 *
 * "71" on its own says nothing. "71, up 4 since Tuesday" is the only form
 * of this number anybody acts on, and SeoUrlState cannot produce it —
 * it is overwritten every run. That comparison is the entire reason
 * SeoAuditRun exists.
 *
 * Every read goes through safeQuery: this is an admin dashboard, and a
 * database blink should empty a panel rather than 500 the page. The four
 * states each card has to show (data, never run, stale, offline) are
 * distinguishable from what comes back here — see AuditOverview.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { safeQuery } from "@/lib/db";
import { SEO_RULES } from "@/lib/seo/rules";

/** A run older than this is worth saying so about — the job is meant to be
 *  nightly, so two days means it has missed at least one. */
export const STALE_AFTER_MS = 48 * 60 * 60 * 1000;

export type RunPoint = { at: Date; avgScore: number; urlCount: number; passAllCount: number };

export type RuleCount = {
  key: string;
  severity: string;
  weight: number;
  /** URLs failing it in the latest run. */
  count: number;
};

export type AuditOverview = {
  /** Null when the audit has never run — the "no data yet" state, which is
   *  different from "it ran and found nothing". */
  latest: RunPoint | null;
  previous: RunPoint | null;
  /** Oldest first, for the trend graph. */
  trend: RunPoint[];
  rules: RuleCount[];
  /** True when the latest run is old enough to distrust. */
  stale: boolean;
};

const EMPTY_OVERVIEW: AuditOverview = {
  latest: null,
  previous: null,
  trend: [],
  rules: [],
  stale: false,
};

export async function getAuditOverview(): Promise<AuditOverview> {
  return safeQuery(
    "seo:auditOverview",
    async () => {
      const runs = await prisma.seoAuditRun.findMany({
        orderBy: { runAt: "desc" },
        // Thirty nightly runs is a month of trend, which is as far back as
        // anybody reads a line like this.
        take: 30,
        select: {
          runAt: true,
          avgScore: true,
          urlCount: true,
          passAllCount: true,
          failCountByRule: true,
        },
      });

      if (runs.length === 0) return EMPTY_OVERVIEW;

      const [newest, second] = runs;
      const counts = (newest.failCountByRule ?? {}) as Record<string, number>;

      return {
        latest: point(newest),
        previous: second ? point(second) : null,
        // Oldest first for the graph; the query is newest-first because
        // that is the order the two comparisons above want.
        trend: [...runs].reverse().map(point),
        // Driven off the rule list rather than off the stored keys, so a
        // rule nothing currently fails still appears — with a zero, which
        // is the answer somebody is looking for when they check.
        rules: SEO_RULES.map((rule) => ({
          key: rule.key,
          severity: rule.severity,
          weight: rule.weight,
          count: counts[rule.key] ?? 0,
        })),
        stale: Date.now() - newest.runAt.getTime() > STALE_AFTER_MS,
      };
    },
    EMPTY_OVERVIEW,
  );
}

function point(row: {
  runAt: Date;
  avgScore: number;
  urlCount: number;
  passAllCount: number;
}): RunPoint {
  return {
    at: row.runAt,
    avgScore: row.avgScore,
    urlCount: row.urlCount,
    passAllCount: row.passAllCount,
  };
}

export type AuditUrlRow = {
  url: string;
  locale: string;
  score: number;
  /** 0 means the page could not be fetched and `score` says nothing. */
  checkedWeight: number;
  failedRules: string[];
  waivedRules: string[];
  /** Where to go and fix it, or null for a static page with no record. */
  editHref: string | null;
  checkedAt: Date;
};

/**
 * The audit table, worst first.
 *
 * `ruleKey` filters to URLs failing one rule — the "click a rule, filter
 * the table" interaction. Filtered in SQL with a JSON containment check
 * rather than in JavaScript after loading everything, so the filter stays
 * honest as the site grows past a few hundred URLs.
 */
export async function getAuditUrls(options: {
  locale: string;
  ruleKey?: string;
  limit?: number;
}): Promise<AuditUrlRow[]> {
  return safeQuery(
    "seo:auditUrls",
    async () => {
      const rows = await prisma.seoUrlState.findMany({
        where: options.ruleKey
          ? { failedRules: { array_contains: [options.ruleKey] } }
          : undefined,
        orderBy: [{ auditScore: "asc" }, { url: "asc" }],
        take: options.limit ?? 500,
        select: {
          url: true,
          locale: true,
          auditScore: true,
          checkedWeight: true,
          failedRules: true,
          waivedRules: true,
          entityType: true,
          entityId: true,
          checkedAt: true,
        },
      });

      return rows.map((row) => ({
        url: row.url,
        locale: row.locale,
        score: row.auditScore,
        checkedWeight: row.checkedWeight,
        failedRules: asStrings(row.failedRules),
        waivedRules: asStrings(row.waivedRules),
        editHref: editHref(options.locale, row.entityType, row.entityId, row.locale),
        checkedAt: row.checkedAt,
      }));
    },
    [] as AuditUrlRow[],
  );
}

/** Stored JSON, so it is parsed rather than trusted into a string[]. */
function asStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

/**
 * The admin editor for the record behind a URL, with the right language
 * tab already selected — "one click to fix", which is the whole point of
 * the screen. Null for a static page: there is no record to open.
 */
function editHref(
  adminLocale: string,
  entityType: string | null,
  entityId: string | null,
  contentLocale: string,
): string | null {
  if (!entityType || !entityId) return null;

  const section = ADMIN_SECTION[entityType];
  if (!section) return null;

  return `/${adminLocale}/admin/${section}/${entityId}/edit?lang=${contentLocale}`;
}

const ADMIN_SECTION: Record<string, string> = {
  PROJECT: "projects",
  NEWS_ARTICLE: "news",
  EVENT: "events",
  E_BROCHURE: "e-brochures",
};

export type WaiverRow = {
  url: string;
  ruleKey: string;
  reason: string;
  createdAt: Date;
  createdByEmail: string | null;
};

export async function getWaivers(): Promise<WaiverRow[]> {
  return safeQuery(
    "seo:waivers",
    async () => {
      const rows = await prisma.seoRuleWaiver.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          url: true,
          ruleKey: true,
          reason: true,
          createdAt: true,
          createdBy: { select: { email: true } },
        },
      });

      return rows.map((row) => ({
        url: row.url,
        ruleKey: row.ruleKey,
        reason: row.reason,
        createdAt: row.createdAt,
        createdByEmail: row.createdBy?.email ?? null,
      }));
    },
    [] as WaiverRow[],
  );
}

/**
 * The CSV the screen exports — "what is missing", in a form somebody can
 * hand to a translator or a copywriter without editing it first.
 *
 * One row per URL per failed rule rather than one per URL with a list in a
 * cell: a spreadsheet can filter and sort the first, and can do nothing
 * with the second.
 */
export function auditCsvRows(rows: readonly AuditUrlRow[]): unknown[][] {
  const out: unknown[][] = [];

  for (const row of rows) {
    for (const ruleKey of row.failedRules) {
      out.push([row.url, row.locale, row.score, ruleKey, row.editHref ?? ""]);
    }
  }

  return out;
}
