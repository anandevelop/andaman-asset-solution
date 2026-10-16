/**
 * lib/seo/search-performance.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Search Console's Performance report, for the Google Search panel on
 * /admin/analytics: totals, the line over time, and a breakdown by query,
 * page, country, device or search appearance, for any range Search Console
 * itself offers.
 *
 * READ LIVE, NOT FROM SeoQueryStat
 *
 * The nightly sync (lib/seo/search-sync.ts) keeps date × query × page ×
 * device, which is what the keyword tracking needs and is kept beyond
 * Google's sixteen months. This panel asks for things the sync never
 * stores: countries, search appearance, image and video search, the last
 * 24 hours by the hour, and today's still-moving figures. Storing all of
 * those for every combination of filters would cost more than asking.
 * Answers are kept for ten minutes, in process, so moving between tabs
 * does not spend Google's quota on the same question twice.
 *
 * FAILURES ARE ANSWERS
 *
 * Nothing here throws. An unset GSC_SITE_URL and a property that is not
 * shared with the service account each come back as their own state, so
 * the panel can say which one it is and what to do about it, instead of
 * showing an empty chart nobody can interpret.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import isoCountries from "i18n-iso-countries";
import { googleCredentials } from "@/lib/seo/google-client";
import { intlLocale } from "@/lib/format";
import { querySearchAnalytics, type QueryOptions, type SearchRow } from "@/lib/seo/search-console";
import {
  fillDays,
  fillHours,
  groupBy,
  resolveRange,
  splitHourWindows,
  sumMetrics,
  toDimensionFilters,
  type Breakdown,
  type BreakdownRow,
  type Metrics,
  type SearchFilters,
  type SearchRange,
  type SearchType,
  type SeriesPoint,
} from "@/lib/seo/search-performance-shape";

export type SearchPerformanceParams = {
  range: SearchRange;
  type: SearchType;
  breakdown: Breakdown;
  filters: SearchFilters;
};

export type SearchPerformance =
  | {
      ok: true;
      siteUrl: string;
      startDate: string;
      endDate: string;
      hourly: boolean;
      totals: Metrics;
      previous: Metrics | null;
      series: SeriesPoint[];
      rows: BreakdownRow[];
      /** More rows existed than were fetched. */
      truncated: boolean;
      /** Clicks Google counted but would not name a query for. */
      withheldClicks: number;
      fetchedAt: string;
    }
  | { ok: false; reason: "NOT_CONFIGURED" }
  | { ok: false; reason: "NO_ACCESS"; siteUrl: string; serviceAccount: string | null; detail: string }
  | { ok: false; reason: "FAILED"; detail: string };

/** The table's ceiling. Search Console's own screen shows a thousand. */
const MAX_ROWS = 5_000;
const TTL_MS = 10 * 60_000;
const cache = new Map<string, { at: number; value: SearchPerformance }>();

export function searchConsoleSiteUrl(): string | null {
  return process.env.GSC_SITE_URL?.trim() || null;
}

export async function loadSearchPerformance(
  params: SearchPerformanceParams,
  locale: string,
  now: Date = new Date(),
): Promise<SearchPerformance> {
  const siteUrl = searchConsoleSiteUrl();
  if (!siteUrl || !googleCredentials()) return { ok: false, reason: "NOT_CONFIGURED" };

  const cacheKey = JSON.stringify([siteUrl, locale, params]);
  const hit = cache.get(cacheKey);
  if (hit && now.getTime() - hit.at < TTL_MS) return hit.value;

  const value = await load(siteUrl, params, locale, now);
  // Failures are not kept: a property shared a minute ago should work on
  // the next click, not ten minutes later.
  if (value.ok) cache.set(cacheKey, { at: now.getTime(), value });
  return value;
}

async function load(
  siteUrl: string,
  params: SearchPerformanceParams,
  locale: string,
  now: Date,
): Promise<SearchPerformance> {
  const range = resolveRange(params.range, now);
  const base: Omit<QueryOptions, "dimensions"> = {
    siteUrl,
    startDate: range.startDate,
    endDate: range.endDate,
    type: params.type,
    filters: toDimensionFilters(params.filters),
    dataState: range.hourly ? "HOURLY_ALL" : "ALL",
  };

  try {
    if (range.hourly) return await loadHourly(siteUrl, base, params, locale, now);

    const [totals, series, breakdown, previous] = await Promise.all([
      query({ ...base, dimensions: [], maxRows: 1 }),
      query({ ...base, dimensions: ["date"] }),
      query({ ...base, dimensions: [params.breakdown], maxRows: MAX_ROWS }),
      range.previous
        ? query({ ...base, ...range.previous, dimensions: [], maxRows: 1 })
        : Promise.resolve(null),
    ]);

    const total = metricsOf(totals.rows[0]);
    const named = breakdown.rows.reduce((sum, row) => sum + row.clicks, 0);

    return {
      ok: true,
      siteUrl,
      startDate: range.startDate,
      endDate: range.endDate,
      hourly: false,
      totals: total,
      previous: previous ? metricsOf(previous.rows[0]) : null,
      series: fillDays(
        range.startDate,
        range.endDate,
        series.rows.map((row) => ({ key: row.keys[0], ...metricsOf(row) })),
      ).map((point) => ({ ...point, label: dayLabel(point.key, locale) })),
      rows: breakdown.rows
        .map((row) => ({ key: row.keys[0], ...metricsOf(row) }))
        .map((row) => labelRow(row, params.breakdown, locale)),
      truncated: breakdown.truncated,
      withheldClicks: params.breakdown === "query" ? Math.max(0, total.clicks - named) : 0,
      fetchedAt: now.toISOString(),
    };
  } catch (error) {
    return asFailure(error, siteUrl);
  }
}

async function loadHourly(
  siteUrl: string,
  base: Omit<QueryOptions, "dimensions">,
  params: SearchPerformanceParams,
  locale: string,
  now: Date,
): Promise<SearchPerformance> {
  /*
    Search appearance cannot be asked for alongside another dimension, hour
    included, so on that tab the table covers the days the hours span and
    not exactly the 24 hours. Every other tab is exact.
  */
  const byHourToo = params.breakdown !== "searchAppearance";

  const [hours, breakdown] = await Promise.all([
    query({ ...base, dimensions: ["hour"] }),
    query({
      ...base,
      dimensions: byHourToo ? ["hour", params.breakdown] : [params.breakdown],
      // Google refuses HOURLY_ALL unless hour is one of the dimensions.
      dataState: byHourToo ? "HOURLY_ALL" : "ALL",
      maxRows: byHourToo ? Number.POSITIVE_INFINITY : MAX_ROWS,
    }),
  ]);

  const { current, previous, newest } = splitHourWindows(hours.rows);
  if (newest === null) return emptyHourly(siteUrl, base, now);

  const totals = sumMetrics(current);
  const rows = byHourToo
    ? groupBy(splitHourWindows(breakdown.rows).current, 1)
    : breakdown.rows.map((row) => ({ key: row.keys[0], ...metricsOf(row) }));
  rows.sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);

  const named = rows.reduce((sum, row) => sum + row.clicks, 0);

  return {
    ok: true,
    siteUrl,
    startDate: new Date(newest - 23 * 3_600_000).toISOString(),
    endDate: new Date(newest).toISOString(),
    hourly: true,
    totals,
    previous: previous.length > 0 ? sumMetrics(previous) : null,
    series: fillHours(newest, groupBy(current, 0)).map((point) => ({ ...point, label: hourLabel(point.key, locale) })),
    rows: rows.slice(0, MAX_ROWS).map((row) => labelRow(row, params.breakdown, locale)),
    truncated: rows.length > MAX_ROWS,
    withheldClicks: params.breakdown === "query" ? Math.max(0, totals.clicks - named) : 0,
    fetchedAt: now.toISOString(),
  };
}

export type SearchSummary =
  | {
      ok: true;
      siteUrl: string;
      totals: Metrics;
      previous: Metrics | null;
      series: SeriesPoint[];
      queries: BreakdownRow[];
      pages: BreakdownRow[];
      countries: BreakdownRow[];
      devices: BreakdownRow[];
      withheldClicks: number;
    }
  | Exclude<SearchPerformance, { ok: true }>;

/**
 * One window of Search Console, all at once, for the printed report: the
 * totals and the period before, the days, and the top of each breakdown.
 * The report's window is a day count ending today, not one of the panel's
 * ranges, so it takes dates. Read with dataState ALL, like the panel, so
 * the two show the same figures for the same days.
 */
export async function loadSearchSummary(
  window: { startDate: string; endDate: string },
  locale: string,
  limit = 10,
): Promise<SearchSummary> {
  const siteUrl = searchConsoleSiteUrl();
  if (!siteUrl || !googleCredentials()) return { ok: false, reason: "NOT_CONFIGURED" };

  const start = Date.parse(`${window.startDate}T00:00:00Z`);
  const end = Date.parse(`${window.endDate}T00:00:00Z`);
  const span = Math.round((end - start) / 86_400_000) + 1;
  const iso = (time: number) => new Date(time).toISOString().slice(0, 10);
  const before = { startDate: iso(start - span * 86_400_000), endDate: iso(start - 86_400_000) };

  const base = { siteUrl, ...window, dataState: "ALL" as const, type: "web" as const };
  const top = (dimension: "query" | "page" | "country" | "device") =>
    query({ ...base, dimensions: [dimension], maxRows: dimension === "query" ? 25_000 : limit * 4 });

  try {
    const [totals, previous, days, queries, pages, countries, devices] = await Promise.all([
      query({ ...base, dimensions: [], maxRows: 1 }),
      query({ ...base, ...before, dimensions: [], maxRows: 1 }),
      query({ ...base, dimensions: ["date"] }),
      top("query"),
      top("page"),
      top("country"),
      top("device"),
    ]);

    const total = metricsOf(totals.rows[0]);
    const rows = (result: { rows: SearchRow[] }, breakdown: Breakdown) =>
      result.rows
        .map((row) => ({ key: row.keys[0], ...metricsOf(row) }))
        .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
        .slice(0, limit)
        .map((row) => labelRow(row, breakdown, locale));

    return {
      ok: true,
      siteUrl,
      totals: total,
      previous: previous.rows.length > 0 ? metricsOf(previous.rows[0]) : null,
      series: fillDays(
        window.startDate,
        window.endDate,
        days.rows.map((row) => ({ key: row.keys[0], ...metricsOf(row) })),
      ).map((point) => ({ ...point, label: dayLabel(point.key, locale) })),
      queries: rows(queries, "query"),
      pages: rows(pages, "page"),
      countries: rows(countries, "country"),
      devices: rows(devices, "device"),
      // Every query row is fetched, not just the top ten, so this is the
      // same figure the panel shows.
      withheldClicks: Math.max(0, total.clicks - queries.rows.reduce((sum, row) => sum + row.clicks, 0)),
    };
  } catch (error) {
    return asFailure(error, siteUrl);
  }
}

function emptyHourly(siteUrl: string, base: Omit<QueryOptions, "dimensions">, now: Date): SearchPerformance {
  const zero = { clicks: 0, impressions: 0, ctr: 0, position: 0 };
  return {
    ok: true,
    siteUrl,
    startDate: base.startDate,
    endDate: base.endDate,
    hourly: true,
    totals: zero,
    previous: null,
    series: [],
    rows: [],
    truncated: false,
    withheldClicks: 0,
    fetchedAt: now.toISOString(),
  };
}

class SearchConsoleError extends Error {}

async function query(options: QueryOptions) {
  const result = await querySearchAnalytics(options);
  if (!result.ok) throw new SearchConsoleError(result.error);
  return result;
}

function asFailure(error: unknown, siteUrl: string): Exclude<SearchPerformance, { ok: true }> {
  const detail = error instanceof Error ? error.message : String(error);
  if (detail.startsWith("403")) {
    return { ok: false, reason: "NO_ACCESS", siteUrl, serviceAccount: googleCredentials()?.email ?? null, detail };
  }
  console.error("[search-performance] Search Console query failed", detail);
  return { ok: false, reason: "FAILED", detail };
}

function metricsOf(row: SearchRow | undefined): Metrics {
  return row
    ? { clicks: row.clicks, impressions: row.impressions, ctr: row.ctr, position: row.position }
    : { clicks: 0, impressions: 0, ctr: 0, position: 0 };
}

function labelRow(row: Metrics & { key: string }, breakdown: Breakdown, locale: string): BreakdownRow {
  if (breakdown === "country") {
    const iso2 = isoCountries.alpha3ToAlpha2(row.key.toUpperCase());
    const name = iso2 ? regionName(iso2, locale) : null;
    return { ...row, label: name ?? row.key.toUpperCase(), flag: iso2 ?? undefined };
  }
  if (breakdown === "searchAppearance") {
    const words = row.key.toLowerCase().replace(/_/g, " ");
    return { ...row, label: words.charAt(0).toUpperCase() + words.slice(1) };
  }
  return { ...row, label: row.key };
}

function regionName(iso2: string, locale: string): string | null {
  try {
    return new Intl.DisplayNames([intlLocale(locale)], { type: "region" }).of(iso2) ?? null;
  } catch {
    return null;
  }
}

/** Day labels in the reader's language; hours on Bangkok's clock, which is
 *  the office's — Search Console's own screen shows the browser's. */
function dayLabel(day: string, locale: string): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${day}T00:00:00Z`),
  );
}

function hourLabel(instant: string, locale: string): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Bangkok",
  }).format(new Date(instant));
}
