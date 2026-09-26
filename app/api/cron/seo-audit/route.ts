/**
 * app/api/cron/seo-audit/route.ts
 * ─────────────────────────────────────────────────────────────────────────
 * POST /api/cron/seo-audit — run the on-page audit over every public URL.
 *
 * The first of the scheduled jobs, and the one that establishes the shape
 * the rest follow: guardCron first and before anything else, POST only, and
 * a JSON summary back so whatever triggered it can log something useful
 * rather than "200".
 *
 * WHY POST
 *
 * It writes a few hundred rows and makes a few hundred requests. A GET that
 * does that is a URL anything can trigger by prefetching it — a link
 * checker, a browser's address bar, a chat client generating a preview.
 *
 * NOT WRAPPED IN safeQuery
 *
 * safeQuery exists so a public read degrades to an empty state instead of a
 * 500. This is a write, and a scheduled one: if the database is unreachable
 * the correct outcome is a loud failure the scheduler can retry, not a
 * cheerful 200 reporting that nothing was audited.
 *
 * `maxDuration` because the job's whole cost is waiting on HTTP — a few
 * hundred of our own pages, six at a time.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { NextResponse } from "next/server";
import { guardCron } from "@/lib/seo/cron-auth";
import { runSeoAudit } from "@/lib/seo/run-audit";
import { recordCronFailure, runAlertChecks } from "@/lib/seo/alerts";

/** Seconds. Node's default would cut a full-site audit short. */
export const maxDuration = 300;

/** Never cached, never prerendered: it is a job, not a page. */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const denied = guardCron(request);
  if (denied) return denied;

  try {
    /*
      Audit this deployment, not the canonical marketing URL. They are not
      the same address on staging, and on this project they are not the
      same *site*: andamanassetsolution.com still serves the client's
      previous WordPress installation. The origin of the request that
      triggered the run is the only thing that reliably knows where "here"
      is.
    */
    const result = await runSeoAudit({ baseUrl: new URL(request.url).origin });

    // The alert rules read what the jobs just wrote — see runAlertChecks.
    const alerts = await runAlertChecks();

    return NextResponse.json({ ok: true, ...result, alerts });
  } catch (error) {
    console.error("[cron/seo-audit] failed", error);

    // A failed run is itself an alert: until this existed, "the audit
    // errored" and "nobody has triggered the audit yet" looked identical
    // on every screen.
    await recordCronFailure("SEO audit", error).catch(() => {});

    // 500 on purpose — see the header. A scheduler that sees 200 will not
    // retry, and nobody finds out the audit stopped running until the
    // numbers on the screen are a month old.
    return NextResponse.json({ ok: false, error: "AUDIT_FAILED" }, { status: 500 });
  }
}
