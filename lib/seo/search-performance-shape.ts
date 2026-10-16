/**
 * lib/seo/search-performance-shape.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The pure half of the Google Search panel on /admin/analytics: what a
 * range means in Search Console's terms, and how rows are summed. No
 * network and no `server-only`, so the tests can reach every rule here.
 * The half that calls Google is lib/seo/search-performance.ts.
 *
 * AVERAGE POSITION IS WEIGHTED BY IMPRESSIONS
 *
 * Every time rows are added up here (the last 24 hours from hourly rows,
 * the same query across those hours), position is averaged weighted by
 * impressions. A plain mean of the rows' positions gives an hour with one
 * impression at position 40 the same say as an hour with two hundred at
 * position 3. Search Console's own figure is weighted, and a panel that
 * disagrees with Search Console on screen is taken to be wrong.
 *
 * THE LAST 24 HOURS ARE BUILT FROM HOURLY ROWS
 *
 * The API's date filter takes whole days, in Pacific time. "The last 24
 * hours" exists only as hourly rows (HOURLY_ALL), so its totals and its
 * table are sums over the hours in the window. A no-dimension query over
 * two days would count up to 47 hours.
 * ─────────────────────────────────────────────────────────────────────────
 */

export const RANGES = ["24h", "7d", "28d", "3m", "6m", "12m", "16m"] as const;
export type SearchRange = (typeof RANGES)[number];

export const SEARCH_TYPES = ["web", "image", "video", "news", "discover", "googleNews"] as const;
export type SearchType = (typeof SEARCH_TYPES)[number];

export const BREAKDOWNS = ["query", "page", "country", "device", "searchAppearance"] as const;
export type Breakdown = (typeof BREAKDOWNS)[number];

export const DEVICES = ["DESKTOP", "MOBILE", "TABLET"] as const;
export type Device = (typeof DEVICES)[number];

export type SearchFilters = {
  /** Query contains this text. */
  query?: string;
  /** Page URL contains this text. */
  page?: string;
  /** ISO 3166-1 alpha-3, lower case, as Search Console spells it. */
  country?: string;
  device?: Device;
};

export type Metrics = { clicks: number; impressions: number; ctr: number; position: number };

export type SeriesPoint = Metrics & { key: string; label: string };

export type BreakdownRow = Metrics & {
  key: string;
  /** What to show for the key: a country's name, a device's label. */
  label: string;
  /** ISO2, for a flag, on the country tab only. */
  flag?: string;
};

export type ResolvedRange = {
  startDate: string;
  endDate: string;
  hourly: boolean;
  /** The period before, of the same length, for the change figures. */
  previous: { startDate: string; endDate: string } | null;
};

const DAY = 86_400_000;

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY);
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

/**
 * The dates Search Console is asked for. Ranges end today and are read with
 * dataState ALL, as Search Console's own screen does: the last two or three
 * days are still being counted and will rise, which the panel says.
 */
export function resolveRange(range: SearchRange, now: Date = new Date()): ResolvedRange {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  if (range === "24h") {
    // Three days of hours: the window, the 24 before it for the change
    // figures, and slack for Pacific time running behind UTC.
    return { startDate: iso(addDays(end, -3)), endDate: iso(end), hourly: true, previous: null };
  }

  const start =
    range === "7d"
      ? addDays(end, -6)
      : range === "28d"
        ? addDays(end, -27)
        : addMonths(end, -Number.parseInt(range, 10));

  const days = Math.round((end.getTime() - start.getTime()) / DAY) + 1;
  // 16 months is all Search Console keeps, so there is no period before it.
  const previous =
    range === "16m"
      ? null
      : { startDate: iso(addDays(start, -days)), endDate: iso(addDays(start, -1)) };

  return { startDate: iso(start), endDate: iso(end), hourly: false, previous };
}

/** Rows of { clicks, impressions, position } summed as Search Console does. */
export function sumMetrics(rows: Array<{ clicks: number; impressions: number; position: number }>): Metrics {
  let clicks = 0;
  let impressions = 0;
  let weighted = 0;
  for (const row of rows) {
    clicks += row.clicks;
    impressions += row.impressions;
    weighted += row.position * row.impressions;
  }
  return {
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : 0,
    position: impressions > 0 ? weighted / impressions : 0,
  };
}

/**
 * The hours inside the last 24, by the newest hour Google has reported, and
 * the 24 before those. Hour keys are ISO timestamps with an offset
 * ("2026-10-15T10:00:00-07:00"), so they are compared as instants.
 */
export function splitHourWindows<T extends { keys: string[] }>(
  rows: T[],
  hourIndex = 0,
): { current: T[]; previous: T[]; newest: number | null } {
  const times = rows.map((row) => Date.parse(row.keys[hourIndex] ?? ""));
  const valid = times.filter((time) => Number.isFinite(time));
  if (valid.length === 0) return { current: [], previous: [], newest: null };

  const newest = Math.max(...valid);
  const from = newest - 23 * 3_600_000;
  const before = from - 24 * 3_600_000;

  const current: T[] = [];
  const previous: T[] = [];
  rows.forEach((row, index) => {
    const time = times[index];
    if (time >= from && time <= newest) current.push(row);
    else if (time >= before && time < from) previous.push(row);
  });
  return { current, previous, newest };
}

/** Rows keyed by one dimension, summed across the others. */
export function groupBy<T extends { keys: string[]; clicks: number; impressions: number; position: number }>(
  rows: T[],
  keyIndex: number,
): Array<Metrics & { key: string }> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = row.keys[keyIndex] ?? "";
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }
  return [...groups.entries()].map(([key, list]) => ({ key, ...sumMetrics(list) }));
}

/** Every hour in the window, including the ones with nothing, so the line
 *  drops to zero instead of jumping across a gap. */
export function fillHours(newest: number, rows: Array<Metrics & { key: string }>): Array<Metrics & { key: string }> {
  const byTime = new Map(rows.map((row) => [Date.parse(row.key), row]));
  const out: Array<Metrics & { key: string }> = [];
  for (let i = 23; i >= 0; i--) {
    const time = newest - i * 3_600_000;
    const row = byTime.get(time);
    out.push(row ?? { key: new Date(time).toISOString(), clicks: 0, impressions: 0, ctr: 0, position: 0 });
  }
  return out;
}

/** Every day from start to end, for the same reason. */
export function fillDays(startDate: string, endDate: string, rows: Array<Metrics & { key: string }>): Array<Metrics & { key: string }> {
  const byDay = new Map(rows.map((row) => [row.key, row]));
  const out: Array<Metrics & { key: string }> = [];
  for (let day = new Date(`${startDate}T00:00:00Z`); iso(day) <= endDate; day = addDays(day, 1)) {
    const key = iso(day);
    out.push(byDay.get(key) ?? { key, clicks: 0, impressions: 0, ctr: 0, position: 0 });
  }
  return out;
}

/** The filters as Search Console's dimensionFilterGroups expects them. */
export function toDimensionFilters(filters: SearchFilters) {
  const out: Array<{ dimension: "query" | "page" | "country" | "device"; operator: "contains" | "equals"; expression: string }> = [];
  if (filters.query?.trim()) out.push({ dimension: "query", operator: "contains", expression: filters.query.trim() });
  if (filters.page?.trim()) out.push({ dimension: "page", operator: "contains", expression: filters.page.trim() });
  if (filters.country?.trim()) out.push({ dimension: "country", operator: "equals", expression: filters.country.trim().toLowerCase() });
  if (filters.device?.trim()) out.push({ dimension: "device", operator: "equals", expression: filters.device.trim().toUpperCase() });
  return out;
}
