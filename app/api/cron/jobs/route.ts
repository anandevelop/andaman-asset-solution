/**
 * POST /api/cron/jobs — runs queued background work (lib/mcp/jobs.ts).
 * Every minute from scripts/cron.mjs. The route that queued a job normally
 * starts it at once; this is what retries, and what recovers a job whose
 * process went away mid-run.
 */

import { NextResponse } from "next/server";
import { guardCron } from "@/lib/seo/cron-auth";
import { recordCronFailure } from "@/lib/seo/alerts";
import { runDueJobs } from "@/lib/mcp/jobs";
import "@/lib/mcp/tools";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const denied = guardCron(request);
  if (denied) return denied;

  try {
    const summary = await runDueJobs();
    if (summary.done || summary.failed || summary.requeued) {
      console.log(`[cron/jobs] done ${summary.done}, failed ${summary.failed}, requeued ${summary.requeued}`);
    }
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    console.error("[cron/jobs] failed", error);
    await recordCronFailure("jobs", error).catch(() => {});
    return NextResponse.json({ ok: false, error: "JOBS_FAILED" }, { status: 500 });
  }
}
