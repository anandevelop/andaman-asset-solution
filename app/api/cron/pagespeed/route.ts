/**
 * app/api/cron/pagespeed/route.ts
 * ─────────────────────────────────────────────────────────────────────────
 * POST /api/cron/pagespeed — the scheduled PageSpeed scan.
 *
 * scripts/cron.mjs calls this every morning at 06:00 Bangkok; the schedule
 * chosen on the settings card decides whether it does anything: "daily"
 * runs every day, "weekly" only on Mondays, "off" never. Same shape as the
 * other cron routes: guardCron first, POST only, JSON back.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { NextResponse } from "next/server";
import { guardCron } from "@/lib/seo/cron-auth";
import { getPsiConfig } from "@/lib/pagespeed/config";
import { runScan } from "@/lib/pagespeed/run";
import { recordCronFailure } from "@/lib/seo/alerts";

/** Sixteen calls, two at a time, up to a minute each. */
export const maxDuration = 900;

export const dynamic = "force-dynamic";

function isMondayInBangkok(now = new Date()): boolean {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "Asia/Bangkok" }).format(now) === "Mon";
}

export async function POST(request: Request) {
  const denied = guardCron(request);
  if (denied) return denied;

  const config = await getPsiConfig();
  if (config.schedule === "off") return NextResponse.json({ ok: true, skipped: "SCHEDULE_OFF" });
  if (config.schedule === "weekly" && !isMondayInBangkok()) return NextResponse.json({ ok: true, skipped: "NOT_MONDAY" });
  if (!config.apiKey) return NextResponse.json({ ok: true, skipped: "NO_KEY" });

  try {
    const result = await runScan("scheduled");
    return NextResponse.json(result.ok ? result : { ok: true, skipped: result.error });
  } catch (error) {
    console.error("[cron/pagespeed] failed", error);
    await recordCronFailure("pagespeed", error).catch(() => {});
    return NextResponse.json({ ok: false, error: "SCAN_FAILED" }, { status: 500 });
  }
}
