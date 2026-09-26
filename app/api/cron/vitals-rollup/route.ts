/**
 * app/api/cron/vitals-rollup/route.ts
 * ─────────────────────────────────────────────────────────────────────────
 * POST /api/cron/vitals-rollup — the daily p75, and the retention sweep.
 *
 * Same shape as /api/cron/seo-audit: guardCron first, POST only, JSON back
 * so whatever triggered it can log something more useful than "200".
 *
 * A GET that deletes thirty-day-old rows is a URL any link checker or chat
 * preview can fire, which is reason enough for POST on its own.
 *
 * Not wrapped in safeQuery: this is a scheduled write, and an unreachable
 * database should be a loud failure the scheduler retries rather than a
 * cheerful 200 reporting that nothing was rolled up.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { NextResponse } from "next/server";
import { guardCron } from "@/lib/seo/cron-auth";
import { runVitalsRollup } from "@/lib/analytics/vitals-rollup";
import { recordCronFailure, runAlertChecks } from "@/lib/seo/alerts";

/** Seconds. A day of measurements for one site is a few thousand rows, so
 *  this is generous rather than necessary — but a retention sweep that is
 *  cut off halfway leaves the table growing unnoticed. */
export const maxDuration = 120;

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const denied = guardCron(request);
  if (denied) return denied;

  try {
    const result = await runVitalsRollup();

    // Checked here rather than on a schedule of its own: the vitals rules
    // read exactly what this run just wrote, so any other moment either
    // repeats yesterday's answer or races the write.
    const alerts = await runAlertChecks();

    return NextResponse.json({ ok: true, ...result, alerts });
  } catch (error) {
    console.error("[cron/vitals-rollup] failed", error);

    // Recorded before the response, so a failure is visible on the SEO
    // overview even to somebody who never sees this status code — nothing
    // else can tell "the job errored" from "nobody has triggered it yet".
    await recordCronFailure("vitals rollup", error).catch(() => {});

    return NextResponse.json({ ok: false, error: "ROLLUP_FAILED" }, { status: 500 });
  }
}
