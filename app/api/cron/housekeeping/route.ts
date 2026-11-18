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
import { recordCronFailure } from "@/lib/seo/alerts";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const denied = guardCron(request);
  if (denied) return denied;

  try {
    const audit = await pruneAuditLog();
    console.log(`[cron/housekeeping] audit log: removed ${audit.signIns} sign-ins, ${audit.edits} edits, ${audit.customerData} customer-data events`);
    return NextResponse.json({ ok: true, audit });
  } catch (error) {
    console.error("[cron/housekeeping] failed", error);
    await recordCronFailure("housekeeping", error).catch(() => {});
    return NextResponse.json({ ok: false, error: "HOUSEKEEPING_FAILED" }, { status: 500 });
  }
}
