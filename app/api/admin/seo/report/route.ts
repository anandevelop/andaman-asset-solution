/**
 * GET /api/admin/seo/report — the SEO hub header's "รายงาน": every failing
 * check from the latest audit as CSV (URL, language, score, rule, where to
 * fix it), the same rows the audit tab exports. ADMIN and above.
 */

import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { requireAdminAction } from "@/lib/admin/guard";
import { auditCsvRows, getAuditUrls } from "@/lib/seo/audit-report";
import { csvFilename, toCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireAdminAction(Role.ADMIN);
  } catch {
    return NextResponse.json({ ok: false, error: "UNAUTHORISED" }, { status: 403 });
  }
  const locale = new URL(request.url).searchParams.get("locale") === "en" ? "en" : "th";
  const rows = await getAuditUrls({ locale, limit: 5000 });
  const csv = toCsv(["URL", "Locale", "Score", "Rule", "Edit"], auditCsvRows(rows));
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${csvFilename("seo-audit")}"`,
      "Cache-Control": "no-store",
    },
  });
}
