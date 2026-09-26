/**
 * lib/analytics/vitals-rollup.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Turn yesterday's raw measurements into one p75 per metric, path and
 * device, then throw the raw rows away once they are a month old.
 *
 * THIS IS THE ONLY PLACE A PERCENTILE IS COMPUTED
 *
 * web_vitals grows by thousands of rows a day. A p75 over it at page load
 * would work perfectly in week one and make the dashboard slower every
 * week after, in a way nobody attributes to this until it is far too late.
 * Everything the tab reads comes from vital_daily_rollups.
 *
 * WHY IT RE-ROLLS TODAY AS WELL AS YESTERDAY
 *
 * Run nightly, "yesterday" is complete and "today" is not. Rolling today
 * anyway means the dashboard shows something for the current day rather
 * than a gap, and the row is simply rewritten by the next run with the
 * full day's data — which is why the write is an upsert keyed on
 * (day, metric, path, device) rather than an insert.
 *
 * RETENTION IS THE REASON THE ROLLUP EXISTS
 *
 * Thirty days of raw rows is enough to re-derive a month if the rollup
 * logic ever changes, and short enough that the table stays small. The
 * rollups themselves are tiny and are kept.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { p75, type VitalKey } from "@/lib/analytics/vitals";

/** Raw measurements older than this are deleted once rolled up. */
export const RAW_RETENTION_DAYS = 30;

export type RollupResult = {
  daysProcessed: number;
  rowsWritten: number;
  rawDeleted: number;
  durationMs: number;
};

export async function runVitalsRollup(now: Date = new Date()): Promise<RollupResult> {
  const startedAt = Date.now();

  // Today and yesterday — see the header on why today is included.
  const days = [startOfUtcDay(now), startOfUtcDay(addDays(now, -1))];
  let rowsWritten = 0;

  for (const day of days) {
    rowsWritten += await rollupDay(day);
  }

  const cutoff = addDays(now, -RAW_RETENTION_DAYS);
  const deleted = await prisma.webVital.deleteMany({ where: { createdAt: { lt: cutoff } } });

  return {
    daysProcessed: days.length,
    rowsWritten,
    rawDeleted: deleted.count,
    durationMs: Date.now() - startedAt,
  };
}

async function rollupDay(day: Date): Promise<number> {
  const next = addDays(day, 1);

  const rows = await prisma.webVital.findMany({
    where: { createdAt: { gte: day, lt: next } },
    select: { metric: true, path: true, device: true, value: true },
  });

  if (rows.length === 0) return 0;

  // Grouped in memory rather than by SQL because the percentile is not
  // something Postgres's own percentile_cont would give us in the same
  // nearest-rank form, and a day's rows for one site are a few thousand
  // at most — well inside what one pass can hold.
  const buckets = new Map<string, number[]>();

  for (const row of rows) {
    const key = `${row.metric}\u0000${row.path}\u0000${row.device}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(row.value);
    else buckets.set(key, [row.value]);
  }

  let written = 0;

  for (const [key, values] of buckets) {
    const [metric, path, device] = key.split("\u0000");

    await prisma.vitalDailyRollup.upsert({
      where: {
        day_metric_path_device: {
          day,
          metric: metric as VitalKey,
          path,
          device,
        },
      },
      create: {
        day,
        metric: metric as VitalKey,
        path,
        device,
        p75: p75(values),
        sampleCount: values.length,
      },
      // Rewritten rather than added to: today's row is provisional until
      // the day is over.
      update: { p75: p75(values), sampleCount: values.length },
    });

    written += 1;
  }

  return written;
}

/** UTC, matching the @db.Date column — a local-midnight boundary would
 *  put a measurement in a different bucket depending on where the server
 *  is, which is the sort of thing nobody finds for months. */
function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}
