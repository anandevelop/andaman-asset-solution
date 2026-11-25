/**
 * app/api/cron/housekeeping/route.ts
 * ─────────────────────────────────────────────────────────────────────────
 * POST /api/cron/housekeeping — nightly, from scripts/cron.mjs.
 *
 * Removes audit entries that have aged out (lib/audit/retention.ts):
 * sign-ins after 90 days, edits after 30, customer-data events after three
 * years. Deleting by age is the whole job, so running it twice does
 * nothing the second time.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { NextResponse } from "next/server";
import { guardCron } from "@/lib/seo/cron-auth";
import { pruneAuditLog } from "@/lib/audit/retention";
import { pruneOAuth } from "@/lib/mcp/oauth";
import { recordCronFailure } from "@/lib/seo/alerts";
import { purgeExpiredApplications } from "@/lib/careers/applications";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const denied = guardCron(request);
  if (denied) return denied;

  try {
    const audit = await pruneAuditLog();
    console.log(`[cron/housekeeping] audit log: removed ${audit.signIns} sign-ins, ${audit.edits} edits, ${audit.customerData} customer-data events`);
    // Expired sign-in requests and the hourly tokens of OAuth connections.
    const oauth = await pruneOAuth();
    /* Job applications past the retention period the applicant was told,
       with their files. Its own try: a storage hiccup here must not report
       the whole run as failed and hide that the two above succeeded. */
    let careers: Awaited<ReturnType<typeof purgeExpiredApplications>> | { error: true };
    try {
      careers = await purgeExpiredApplications();
      console.log(`[cron/housekeeping] careers: removed ${careers.applications} expired applications, ${careers.orphans} orphan uploads`);
    } catch (error) {
      console.error("[cron/housekeeping] careers purge failed", error);
      await recordCronFailure("housekeeping", error).catch(() => {});
      careers = { error: true };
    }
    return NextResponse.json({ ok: true, audit, oauth, careers });
  } catch (error) {
    console.error("[cron/housekeeping] failed", error);
    await recordCronFailure("housekeeping", error).catch(() => {});
    return NextResponse.json({ ok: false, error: "HOUSEKEEPING_FAILED" }, { status: 500 });
  }
}
