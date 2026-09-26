/**
 * lib/seo/search-console.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Search Console's searchAnalytics.query, with the three things that make
 * it awkward handled once: pagination, mixed dimensions, and the fact that
 * the numbers it returns do not add up the way a reader expects.
 *
 * ROWS DO NOT SUM TO THE TOTAL, AND THAT IS NOT A BUG
 *
 * Google drops queries searched by very few people, to stop a rare search
 * identifying the person who made it. Ask for totals and you get every
 * click; ask for a breakdown by query and the rows add up to less. The
 * difference is real traffic from searches Google will not name.
 *
 * Every screen that shows a breakdown has to say so, or somebody reports
 * it as a bug once a month for ever. queryWithTotals() returns both halves
 * for exactly that reason.
 *
 * PAGINATION IS NOT OPTIONAL
 *
 * The API caps a response at 25,000 rows and says nothing about there
 * being more. A site with two thousand pages across four locales and a
 * year of queries passes that easily, and the failure mode is a report
 * that is quietly missing its tail — the long tail being the part anybody
 * reads this report to find.
 *
 * NOTHING HERE FORMATS OR ROUNDS
 *
 * ctr and position come back as floats and are stored as floats. The
 * screens decide how to show them; a helper that rounded on the way in
 * would make "0.0%" out of a real 0.04% and there would be no way back.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { getAccessToken, SCOPES } from "@/lib/seo/google-client";

/** What Search Console can group by. */
export type SearchDimension = "date" | "query" | "page" | "country" | "device" | "searchAppearance" | "hour";

export type SearchRow = {
  keys: string[];
  clicks: number;
  impressions: number;
  /** 0–1, not a percentage. */
  ctr: number;
  /** Average position; 1 is the top of the page. */
  position: number;
};

export type DimensionFilter = {
  dimension: SearchDimension;
  operator?: "equals" | "notEquals" | "contains" | "notContains" | "includingRegex" | "excludingRegex";
  expression: string;
};

/**
 * `FINAL` waits until Google is done counting and is what a report should
 * use. `ALL` includes the most recent, still-moving days. `HOURLY_ALL` is
 * the only way to get the `hour` dimension, and only reaches back ten
 * days.
 */
export type DataState = "FINAL" | "ALL" | "HOURLY_ALL";

export type QueryOptions = {
  siteUrl: string;
  /** yyyy-mm-dd, inclusive at both ends — Search Console's own convention,
   *  unlike everything else in this codebase, so it is not converted. */
  startDate: string;
  endDate: string;
  dimensions: SearchDimension[];
  filters?: DimensionFilter[];
  dataState?: DataState;
  type?: "web" | "image" | "video" | "news" | "discover" | "googleNews";
  /** Stop after this many rows in total. A guard on memory, not on
   *  correctness: a caller that wants everything passes Infinity. */
  maxRows?: number;
};

export type QueryResult =
  | { ok: true; rows: SearchRow[]; truncated: boolean }
  | { ok: false; error: string };

/** Google's hard cap on one response. */
export const PAGE_SIZE = 25_000;

/** Search Console has sixteen months of history and no more. */
export const HISTORY_MONTHS = 16;

const ENDPOINT = "https://www.googleapis.com/webmasters/v3";

type FetchLike = typeof fetch;

/**
 * Every row matching the query, following pagination to the end.
 *
 * `fetchImpl` exists so the tests can drive this with fixtures: the
 * pagination loop, the filter shape and the "rows do not sum" handling are
 * the parts worth testing, and none of them should need a network or a
 * credential to exercise.
 */
export async function querySearchAnalytics(
  options: QueryOptions,
  fetchImpl: FetchLike = fetch,
): Promise<QueryResult> {
  const token = await getAccessToken(SCOPES.searchConsole);
  if (!token.ok) return { ok: false, error: token.error };

  const url = `${ENDPOINT}/sites/${encodeURIComponent(options.siteUrl)}/searchAnalytics/query`;
  const maxRows = options.maxRows ?? Number.POSITIVE_INFINITY;

  const rows: SearchRow[] = [];
  let startRow = 0;

  while (rows.length < maxRows) {
    const rowLimit = Math.min(PAGE_SIZE, maxRows - rows.length);

    const body: Record<string, unknown> = {
      startDate: options.startDate,
      endDate: options.endDate,
      dimensions: options.dimensions,
      rowLimit,
      startRow,
    };

    if (options.dataState) body.dataState = options.dataState;
    if (options.type) body.type = options.type;

    /*
      One group with AND. Search Console's model is groups OR'd together
      with a filter list inside each; the shape callers actually want here
      is "all of these at once", and offering the full tree would be an API
      nobody in this codebase needs and everybody would have to read.
    */
    if (options.filters?.length) {
      body.dimensionFilterGroups = [
        {
          groupType: "and",
          filters: options.filters.map((filter) => ({
            dimension: filter.dimension,
            operator: filter.operator ?? "equals",
            expression: filter.expression,
          })),
        },
      ];
    }

    let page: { rows?: SearchRow[]; error?: { message?: string } };

    try {
      const response = await fetchImpl(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      });

      page = (await response.json()) as typeof page;

      if (!response.ok) {
        /*
          403 here is almost always one thing: the property is not shared
          with the service account, or the URL asked about is outside it.
          Google's message says which, so it is passed through rather than
          replaced with a status code.
        */
        return { ok: false, error: `${response.status}: ${page.error?.message ?? "no detail"}` };
      }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }

    const returned = page.rows ?? [];
    rows.push(...returned);

    // A short page is the only signal that there is no next one — the API
    // does not say how many rows exist in total.
    if (returned.length < rowLimit) return { ok: true, rows, truncated: false };

    startRow += returned.length;
  }

  return { ok: true, rows, truncated: true };
}

export type TotalsResult =
  | {
      ok: true;
      rows: SearchRow[];
      /** The property-wide figures, which are larger than the rows add up
       *  to whenever Google has withheld a rare query. */
      totals: { clicks: number; impressions: number };
      /** Clicks Google counted but would not attribute to a named row. */
      withheldClicks: number;
    }
  | { ok: false; error: string };

/**
 * A breakdown and the true totals together.
 *
 * Two calls, because Google will not give both in one: asking with no
 * dimensions returns the property totals, asking with dimensions returns
 * rows that exclude the queries it is protecting. A screen that shows only
 * the second under a heading like "clicks from Google" is under-reporting
 * by however much was withheld, and nobody can tell by how much.
 */
export async function queryWithTotals(
  options: QueryOptions,
  fetchImpl: FetchLike = fetch,
): Promise<TotalsResult> {
  const [breakdown, totals] = await Promise.all([
    querySearchAnalytics(options, fetchImpl),
    querySearchAnalytics({ ...options, dimensions: [], maxRows: 1 }, fetchImpl),
  ]);

  if (!breakdown.ok) return breakdown;
  if (!totals.ok) return totals;

  const total = totals.rows[0] ?? { clicks: 0, impressions: 0 };
  const attributed = breakdown.rows.reduce((sum, row) => sum + row.clicks, 0);

  return {
    ok: true,
    rows: breakdown.rows,
    totals: { clicks: total.clicks, impressions: total.impressions },
    // Never negative: the two calls can land either side of Google
    // finishing its own counting, and a negative "withheld" on screen is
    // worse than a zero.
    withheldClicks: Math.max(0, total.clicks - attributed),
  };
}

/**
 * The earliest date worth asking for.
 *
 * Search Console keeps sixteen months. Asking for more is not an error —
 * it silently returns what it has, which makes a first run look like it
 * worked and quietly defines the baseline every later comparison is
 * measured against.
 */
export function earliestAvailable(now: Date = new Date()): string {
  const date = new Date(now);
  date.setUTCMonth(date.getUTCMonth() - HISTORY_MONTHS);
  return date.toISOString().slice(0, 10);
}

/** Search Console's data runs two to three days behind. The most recent
 *  day it will answer for, which is what "data up to" on every screen
 *  should say. */
export function latestSettled(now: Date = new Date()): string {
  const date = new Date(now);
  date.setUTCDate(date.getUTCDate() - 3);
  return date.toISOString().slice(0, 10);
}
