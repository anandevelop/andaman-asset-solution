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
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[cron/vitals-rollup] failed", error);
    return NextResponse.json({ ok: false, error: "ROLLUP_FAILED" }, { status: 500 });
  }
}
