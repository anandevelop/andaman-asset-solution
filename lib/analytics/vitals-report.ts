/**
 * lib/analytics/vitals-report.ts
 * ─────────────────────────────────────────────────────────────────────────
 * What the Core Web Vitals tab reads. Entirely from vital_daily_rollups —
 * no percentile is computed here, for the reason lib/analytics/vitals.ts
 * spells out at length.
 *
 * SUMMING A p75 IS NOT A p75
 *
 * Combining several days into one figure is the trap in this file. The
 * arithmetic mean of seven daily p75s is not the week's p75, and nothing
 * in the rollups can produce the real one — the raw values are what a
 * percentile needs and they are deliberately not read here.
 *
 * So a range is weighted by sample count, which is the closest honest
 * approximation, and `sampleCount` travels with every figure so the screen
 * can refuse to show one below the threshold. An "8.2s LCP" from nine
 * visits is not a finding; it is a rounding error with a colour.
 *
 * Every read goes through safeQuery: an admin panel should empty rather
 * than 500 when Postgres blinks.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { safeQuery } from "@/lib/db";
import { MIN_SAMPLES, rateVital, type VitalKey, type VitalRating } from "@/lib/analytics/vitals";

export type VitalFigure = {
  metric: VitalKey;
  /** Stored units — CLS is x1000. */
  value: number;
  sampleCount: number;
  rating: VitalRating;
  /** False when sampleCount is below MIN_SAMPLES: the screen shows "not
   *  enough data" rather than a number that will have moved by tomorrow. */
  enoughSamples: boolean;
};

export type RouteVitals = {
  path: string;
  device: string;
  figures: VitalFigure[];
};

export type VitalsTrendPoint = {
  day: string;
  metric: VitalKey;
  value: number;
  sampleCount: number;
};

export type VitalsOverview = {
  /** Site-wide, per device — the headline figures. */
  overall: { device: string; figures: VitalFigure[] }[];
  /** Worst first, so the list starts where the work is. */
  routes: RouteVitals[];
  trend: VitalsTrendPoint[];
  /** Deploys seen in the window, for the graph's markers. */
  deploys: { day: string; commitSha: string }[];
  /** True when nothing has ever been rolled up — a different state from
   *  "rolled up and found nothing". */
  empty: boolean;
};

const EMPTY: VitalsOverview = { overall: [], routes: [], trend: [], deploys: [], empty: true };

export async function getVitalsOverview(rangeDays: number): Promise<VitalsOverview> {
  return safeQuery(
    "analytics:vitals",
    async () => {
      const since = new Date();
      since.setUTCDate(since.getUTCDate() - rangeDays);
      since.setUTCHours(0, 0, 0, 0);

      const [rollups, deployRows] = await Promise.all([
        prisma.vitalDailyRollup.findMany({
          where: { day: { gte: since } },
          select: { day: true, metric: true, path: true, device: true, p75: true, sampleCount: true },
        }),
        // Which builds were serving during the window. Read from the raw
        // table because the rollups deliberately do not carry a sha — a
        // day can span two deploys, and averaging across them is the thing
        // the marker exists to make visible.
        prisma.webVital.findMany({
          where: { createdAt: { gte: since }, commitSha: { not: null } },
          select: { commitSha: true, createdAt: true },
          distinct: ["commitSha"],
          orderBy: { createdAt: "asc" },
          take: 20,
        }),
      ]);

      if (rollups.length === 0) return EMPTY;

      return {
        overall: overallByDevice(rollups),
        routes: worstRoutes(rollups),
        trend: trendByDay(rollups),
        deploys: deployRows.map((row) => ({
          day: row.createdAt.toISOString().slice(0, 10),
          commitSha: (row.commitSha ?? "").slice(0, 7),
        })),
        empty: false,
      };
    },
    EMPTY,
  );
}

type Rollup = {
  day: Date;
  metric: string;
  path: string;
  device: string;
  p75: number;
  sampleCount: number;
};

/**
 * Sample-weighted, which is an approximation and is labelled as one.
 *
 * The true p75 over a week needs the raw values, which are deleted after
 * thirty days and are not read here by design. Weighting by sample count
 * at least stops a quiet Tuesday counting as much as a busy Saturday.
 */
function weighted(rows: readonly Rollup[]): { value: number; sampleCount: number } {
  let total = 0;
  let samples = 0;

  for (const row of rows) {
    total += row.p75 * row.sampleCount;
    samples += row.sampleCount;
  }

  return { value: samples === 0 ? 0 : Math.round(total / samples), sampleCount: samples };
}

function figure(metric: VitalKey, rows: readonly Rollup[]): VitalFigure {
  const { value, sampleCount } = weighted(rows);

  return {
    metric,
    value,
    sampleCount,
    rating: rateVital(metric, value),
    enoughSamples: sampleCount >= MIN_SAMPLES,
  };
}

const METRICS: VitalKey[] = ["LCP", "INP", "CLS", "TTFB"];

function overallByDevice(rollups: readonly Rollup[]): { device: string; figures: VitalFigure[] }[] {
  const devices = [...new Set(rollups.map((row) => row.device))].sort();

  return devices.map((device) => ({
    device,
    figures: METRICS.map((metric) =>
      figure(
        metric,
        rollups.filter((row) => row.device === device && row.metric === metric),
      ),
    ),
  }));
}

/** Worst LCP first — the metric people act on, and the one a slow page
 *  shows up in first. */
function worstRoutes(rollups: readonly Rollup[]): RouteVitals[] {
  const keys = [...new Set(rollups.map((row) => `${row.path}\u0000${row.device}`))];

  const routes = keys.map((key) => {
    const [path, device] = key.split("\u0000");
    const rows = rollups.filter((row) => row.path === path && row.device === device);

    return {
      path,
      device,
      figures: METRICS.map((metric) =>
        figure(
          metric,
          rows.filter((row) => row.metric === metric),
        ),
      ),
    };
  });

  return routes.sort((a, b) => lcp(b) - lcp(a)).slice(0, 50);
}

function lcp(route: RouteVitals): number {
  const found = route.figures.find((entry) => entry.metric === "LCP");
  // A route with too few samples sorts to the bottom rather than the top:
  // it is not evidence of a problem, and it must not sit above routes that
  // are.
  return found?.enoughSamples ? found.value : -1;
}

function trendByDay(rollups: readonly Rollup[]): VitalsTrendPoint[] {
  const points: VitalsTrendPoint[] = [];
  const days = [...new Set(rollups.map((row) => row.day.toISOString().slice(0, 10)))].sort();

  for (const day of days) {
    for (const metric of METRICS) {
      const rows = rollups.filter(
        (row) => row.day.toISOString().slice(0, 10) === day && row.metric === metric,
      );
      if (rows.length === 0) continue;

      const { value, sampleCount } = weighted(rows);
      points.push({ day, metric, value, sampleCount });
    }
  }

  return points;
}

/**
 * What share of visits this sample covers.
 *
 * Vitals come only from visitors who accepted the analytics cookie, and
 * the tab has to say so with a number rather than a disclaimer nobody
 * reads. Compared against PathHitDay, which counts every visit regardless
 * of consent.
 */
export async function getConsentCoverage(rangeDays: number): Promise<number | null> {
  return safeQuery(
    "analytics:vitalsCoverage",
    async () => {
      const since = new Date();
      since.setUTCDate(since.getUTCDate() - rangeDays);
      since.setUTCHours(0, 0, 0, 0);

      const [measured, views] = await Promise.all([
        prisma.vitalDailyRollup.aggregate({
          where: { day: { gte: since }, metric: "LCP" },
          _sum: { sampleCount: true },
        }),
        prisma.pathHitDay.aggregate({
          where: { day: { gte: since }, kind: "PAGE_VIEW" },
          _sum: { hits: true },
        }),
      ]);

      const total = views._sum.hits ?? 0;
      if (total === 0) return null;

      // One LCP per page load, so the two are comparable. Capped at 100:
      // the two are counted by different mechanisms and a brief overshoot
      // is measurement noise, not 103% of visitors.
      return Math.min(100, Math.round(((measured._sum.sampleCount ?? 0) / total) * 100));
    },
    null,
  );
}
