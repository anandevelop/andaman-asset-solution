/**
 * app/api/cron/seo-search/route.ts
 * ─────────────────────────────────────────────────────────────────────────
 * POST /api/cron/seo-search — pull Search Console into this database.
 *
 * Same shape as the other jobs: guardCron first, POST only, JSON back so
 * whatever triggered it can log something more useful than "200".
 *
 * The first run asks for sixteen months, which is everything Search
 * Console keeps and everything this site will ever be able to know about
 * its own past. It takes minutes rather than seconds, which is why
 * maxDuration is what it is. Every run after it asks for a few days.
 *
 * Not wrapped in safeQuery: a scheduled write against an unreachable
 * database should be a loud failure the scheduler retries, not a cheerful
 * 200 reporting that nothing was synced.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { NextResponse } from "next/server";
import { guardCron } from "@/lib/seo/cron-auth";
import { syncSearchConsole } from "@/lib/seo/search-sync";
import { recordCronFailure, runAlertChecks } from "@/lib/seo/alerts";

/** Seconds. Sixteen months of a busy property is a lot of pages of 25,000
 *  rows, and the first run is the one that must not be cut off. */
export const maxDuration = 600;

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const denied = guardCron(request);
  if (denied) return denied;

  const siteUrl = process.env.GSC_SITE_URL?.trim();

  if (!siteUrl) {
    /*
      Not an error, and deliberately not a 500. A deployment with no
      Search Console property configured is one that has not finished
      being set up; the screens already say "not connected to Google yet"
      and a scheduler should not retry its way through that.
    */
    return NextResponse.json({ ok: true, skipped: "GSC_SITE_URL not set" });
  }

  try {
    const outcome = await syncSearchConsole({ siteUrl });

    if (!outcome.ok) {
      await recordCronFailure("Search Console sync", new Error(outcome.error)).catch(() => {});
      return NextResponse.json({ ok: false, error: outcome.error }, { status: 500 });
    }

    const alerts = await runAlertChecks();

    return NextResponse.json({ ok: true, ...outcome.result, alerts });
  } catch (error) {
    console.error("[cron/seo-search] failed", error);
    await recordCronFailure("Search Console sync", error).catch(() => {});

    return NextResponse.json({ ok: false, error: "SYNC_FAILED" }, { status: 500 });
  }
}
