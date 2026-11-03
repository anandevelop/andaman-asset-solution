/**
 * lib/analytics/ga4-report.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The "Google Analytics" tab of /admin/analytics: GA4's own numbers through
 * the Analytics Data API (runReport), with the same service account the
 * SEO screens use (lib/google-config.ts — saved in Settings → Integrations
 * or in .env). Read-only scope.
 *
 * One call per breakdown, all in parallel, cached 10 minutes per range: the
 * free API quota is generous, but the tab is opened often and GA4's numbers
 * do not move by the minute anyway.
 *
 * Never throws: NOT_CONFIGURED (no key or no property ID), NO_ACCESS (the
 * account is not a Viewer on the property, or the API is off) and FAILED
 * are states the tab explains.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { getGoogleConfig } from "@/lib/google-config";
import { getAccessToken, SCOPES } from "@/lib/seo/google-client";

export const GA_RANGES = ["1", "7", "28", "90"] as const;
export type GaRange = (typeof GA_RANGES)[number];

type DateRange = { startDate: string; endDate: string };

/** GA4 relative dates: "1" = today and yesterday's partial day. */
export function dateRangesFor(range: GaRange, compare: boolean): DateRange[] {
  const days = Number(range);
  const current = { startDate: `${days}daysAgo`, endDate: "today" };
  if (!compare) return [current];
  return [current, { startDate: `${days * 2}daysAgo`, endDate: `${days + 1}daysAgo` }];
}

export type Totals = { users: number; sessions: number; views: number; engagementRate: number; avgSessionSec: number };
export type Row = { key: string; value: number; previous?: number };

export type Ga4Report =
  | {
      ok: true;
      propertyId: string;
      totals: Totals;
      previous: Totals | null;
      daily: { date: string; users: number }[];
      pages: Row[];
      channels: Row[];
      countries: Row[];
      devices: Row[];
      fetchedAt: string;
    }
  | { ok: false; reason: "NOT_CONFIGURED" | "NO_ACCESS" | "FAILED"; detail?: string; serviceAccount?: string | null };

type ApiRow = { dimensionValues?: { value: string }[]; metricValues?: { value: string }[] };
type ApiReport = { rows?: ApiRow[] };

async function runReport(propertyId: string, token: string, body: unknown): Promise<ApiReport> {
  const response = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await response.json().catch(() => null)) as (ApiReport & { error?: { message?: string } }) | null;
  if (!response.ok) throw new Error(`${response.status}: ${json?.error?.message ?? "no detail"}`);
  return json ?? {};
}

const num = (value: string | undefined) => Number(value ?? 0) || 0;

/**
 * With two date ranges GA4 adds a "dateRange" dimension last
 * ("date_range_0" / "date_range_1"); fold them into value / previous.
 */
export function foldRows(report: ApiReport, compare: boolean, limit = 10): Row[] {
  const byKey = new Map<string, Row>();
  for (const row of report.rows ?? []) {
    const dims = row.dimensionValues ?? [];
    const key = dims[0]?.value ?? "(not set)";
    const isPrevious = compare && dims[dims.length - 1]?.value === "date_range_1";
    const entry = byKey.get(key) ?? { key, value: 0, ...(compare && { previous: 0 }) };
    if (isPrevious) entry.previous = num(row.metricValues?.[0]?.value);
    else entry.value = num(row.metricValues?.[0]?.value);
    byKey.set(key, entry);
  }
  return [...byKey.values()].sort((a, b) => b.value - a.value).slice(0, limit);
}

function totalsFrom(report: ApiReport, rangeIndex: number, compare: boolean): Totals | null {
  const row = (report.rows ?? []).find((r) =>
    compare ? r.dimensionValues?.[0]?.value === `date_range_${rangeIndex}` : rangeIndex === 0,
  );
  if (!row) return compare && rangeIndex === 1 ? null : { users: 0, sessions: 0, views: 0, engagementRate: 0, avgSessionSec: 0 };
  const m = row.metricValues ?? [];
  return {
    users: num(m[0]?.value),
    sessions: num(m[1]?.value),
    views: num(m[2]?.value),
    engagementRate: num(m[3]?.value),
    avgSessionSec: num(m[4]?.value),
  };
}

const TTL_MS = 10 * 60_000;
const cache = new Map<string, { at: number; value: Ga4Report }>();

export async function loadGa4Report(range: GaRange, compare: boolean): Promise<Ga4Report> {
  const config = await getGoogleConfig();
  const propertyId = config.ga4PropertyId?.trim();
  if (!propertyId || !config.credentials) return { ok: false, reason: "NOT_CONFIGURED" };

  const cacheKey = `${propertyId}:${range}:${compare}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  const token = await getAccessToken(SCOPES.analytics);
  if (!token.ok) return { ok: false, reason: "FAILED", detail: token.error };

  const dateRanges = dateRangesFor(range, compare);
  const breakdown = (dimension: string, metric: string, limit: number) =>
    runReport(propertyId, token.token, {
      dateRanges,
      dimensions: [{ name: dimension }],
      metrics: [{ name: metric }],
      orderBys: [{ metric: { metricName: metric }, desc: true }],
      limit: limit * (compare ? 2 : 1),
    });

  try {
    const [totals, daily, pages, channels, countries, devices] = await Promise.all([
      runReport(propertyId, token.token, {
        dateRanges,
        metrics: ["activeUsers", "sessions", "screenPageViews", "engagementRate", "averageSessionDuration"].map((name) => ({ name })),
      }),
      runReport(propertyId, token.token, {
        dateRanges: [dateRanges[0]],
        dimensions: [{ name: range === "1" ? "dateHour" : "date" }],
        metrics: [{ name: "activeUsers" }],
        orderBys: [{ dimension: { dimensionName: range === "1" ? "dateHour" : "date" } }],
      }),
      breakdown("pagePath", "screenPageViews", 10),
      breakdown("sessionDefaultChannelGroup", "sessions", 8),
      breakdown("country", "activeUsers", 8),
      breakdown("deviceCategory", "activeUsers", 3),
    ]);

    const value: Ga4Report = {
      ok: true,
      propertyId,
      totals: totalsFrom(totals, 0, compare)!,
      previous: compare ? totalsFrom(totals, 1, compare) : null,
      daily: (daily.rows ?? []).map((row) => ({
        date: row.dimensionValues?.[0]?.value ?? "",
        users: num(row.metricValues?.[0]?.value),
      })),
      pages: foldRows(pages, compare, 10),
      channels: foldRows(channels, compare, 8),
      countries: foldRows(countries, compare, 8),
      devices: foldRows(devices, compare, 3),
      fetchedAt: new Date().toISOString(),
    };
    cache.set(cacheKey, { at: Date.now(), value });
    return value;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (detail.startsWith("403")) {
      return { ok: false, reason: "NO_ACCESS", detail, serviceAccount: config.credentials.email };
    }
    console.error("[ga4-report]", detail);
    return { ok: false, reason: "FAILED", detail };
  }
}
