/**
 * lib/analytics/vitals.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Core Web Vitals: the thresholds, the percentile, and the words that go
 * with a number.
 *
 * FIELD DATA, NOT LAB DATA
 *
 * PageSpeed Insights measures a datacentre on a simulated connection. This
 * is what happened on a customer's phone in Phuket, which is the version
 * Google ranks on and the only version worth acting on.
 *
 * ONE INTEGER COLUMN FOR EVERY METRIC
 *
 * LCP, INP and TTFB are milliseconds; CLS is a unitless score under 1. A
 * float column for three integers, or three columns, are both worse than
 * storing CLS multiplied by 1000 and dividing it back for display — which
 * is what CLS_SCALE is, and why every threshold below is in the same
 * stored units.
 *
 * P75, AND WHY IT IS NOT COMPUTED HERE AT PAGE LOAD
 *
 * The percentile function lives here so it can be tested, but the only
 * caller is the rollup job. web_vitals grows by thousands of rows a day; a
 * percentile over it on every dashboard render would make the admin slower
 * every week in a way nobody notices until it is far too late.
 *
 * 75th rather than the mean because that is what Google reports and what
 * "most people" means: a mean is dragged around by one visitor on a train.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** CLS is stored multiplied by this so one integer column serves all four
 *  metrics. 0.08 is stored as 80. */
export const CLS_SCALE = 1000;

export type VitalKey = "LCP" | "INP" | "CLS" | "TTFB";

export type VitalRating = "good" | "needsImprovement" | "poor";

/**
 * Google's own boundaries, in stored units.
 *
 * TTFB is not part of any Core Web Vitals score and has no official
 * threshold — 800/1800ms is Google's documented guidance for it, and it is
 * here so phase 5 has a line to compare its middleware against rather than
 * a bare number.
 */
export const VITAL_THRESHOLDS: Record<VitalKey, { good: number; poor: number }> = {
  LCP: { good: 2500, poor: 4000 },
  INP: { good: 200, poor: 500 },
  // 0.1 and 0.25, scaled.
  CLS: { good: 0.1 * CLS_SCALE, poor: 0.25 * CLS_SCALE },
  TTFB: { good: 800, poor: 1800 },
};

/**
 * Below this many samples the screen shows "not enough data" instead of a
 * number. A p75 over a few dozen visits moves every day and reads as a
 * regression when it is noise — and somebody acts on it.
 */
export const MIN_SAMPLES = 200;

/**
 * Where a value sits against the thresholds.
 *
 * At the boundary counts as the better rating, matching Google: a page at
 * exactly 2500ms is "good", not "needs improvement".
 */
export function rateVital(metric: VitalKey, value: number): VitalRating {
  const { good, poor } = VITAL_THRESHOLDS[metric];
  if (value <= good) return "good";
  if (value <= poor) return "needsImprovement";
  return "poor";
}

/**
 * The 75th percentile, nearest-rank.
 *
 * Nearest-rank rather than interpolated because the answer has to be a
 * value that actually happened to somebody: "three quarters of visits were
 * at least this fast" is a sentence about real visits, and an interpolated
 * figure between two samples is not.
 */
export function p75(values: readonly number[]): number {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  // ceil(0.75 * n) as a 1-based rank, then back to a 0-based index.
  const rank = Math.ceil(0.75 * sorted.length);
  return sorted[Math.max(0, rank - 1)];
}

/** "mobile" or "desktop", from a user agent. Deliberately crude: the two
 *  differ enough that any split is better than an average across them, and
 *  a device-detection library for one boolean is not worth a dependency. */
export function deviceOf(userAgent: string): "mobile" | "desktop" {
  return /android|iphone|ipad|ipod|mobile|silk|kindle|opera mini/i.test(userAgent)
    ? "mobile"
    : "desktop";
}

/** For display: CLS back to its real scale, everything else unchanged. */
export function displayValue(metric: VitalKey, stored: number): number {
  return metric === "CLS" ? stored / CLS_SCALE : stored;
}

/**
 * The value to store, from what web-vitals reported.
 *
 * Rounded to an integer, and clamped: a browser reporting a
 * twenty-four-hour LCP is reporting a bug or a tab left in the background,
 * and one absurd sample in a small bucket moves a p75 on its own.
 */
export function storedValue(metric: VitalKey, reported: number): number {
  const scaled = metric === "CLS" ? reported * CLS_SCALE : reported;
  return Math.max(0, Math.min(Math.round(scaled), MAX_STORED));
}

/** Sixty seconds in ms, or a CLS of 60 — far beyond any real measurement
 *  in either unit, so one bound serves both. */
export const MAX_STORED = 60_000;
