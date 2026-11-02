/**
 * app/api/cron/alerts/route.ts
 * ─────────────────────────────────────────────────────────────────────────
 * POST /api/cron/alerts — the timed staff notifications: unclaimed leads,
 * expiring unit reservations and the Monday summary. See
 * lib/scheduled-alerts.ts.
 *
 * Called every 15 minutes by the `cron` service (scripts/cron.mjs). Same
 * shape as the other jobs: guardCron first, POST only, a JSON summary back.
 * Cheap when there is nothing to say — three small queries — so the short
 * interval costs nothing worth measuring.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { NextResponse } from "next/server";
import { guardCron } from "@/lib/seo/cron-auth";
import { recordCronFailure } from "@/lib/seo/alerts";
import { runScheduledAlerts } from "@/lib/scheduled-alerts";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const denied = guardCron(request);
  if (denied) return denied;

  try {
    const result = await runScheduledAlerts();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[cron/alerts]", error);
    await recordCronFailure("scheduled alerts", error).catch(() => {});
    return NextResponse.json({ ok: false, error: "FAILED" }, { status: 500 });
  }
}
