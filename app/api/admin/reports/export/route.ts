/**
 * app/api/admin/reports/export/route.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The monthly report's table as a file — CSV, or Excel.
 *
 * WHY SPREADSHEETML AND NOT .XLSX
 *
 * A real .xlsx is a zip of XML parts and needs a library to write. This is
 * SpreadsheetML 2003: one XML document Excel, Numbers and LibreOffice all
 * open by double-click, written with a template string and no dependency
 * at all. For a five-column table that somebody wants to sort and total,
 * the difference is invisible; the difference in what has to be kept
 * patched forever is not.
 *
 * WHY THE FILE CANNOT DISAGREE WITH THE SCREEN
 *
 * It reads the same getReportData the page does, from the same query
 * parameters. Nothing is recomputed here — an export that derives its own
 * figures is an export that eventually reports a different number from the
 * page it was downloaded from, and the person holding the file has no way
 * to tell which is right.
 *
 * Session-gated through requireAdminAction, like every other export: this
 * is lead data, and a URL that returns it without a session is a URL that
 * ends up in somebody's browser history and then in a support ticket.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getTranslations } from "next-intl/server";
import { requireAdminAction } from "@/lib/admin/guard";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { toCsv, csvFilename } from "@/lib/csv";
import { locales } from "@/i18n";
import { getReportData } from "@/lib/reports/seo-report";
import { resolvePeriod } from "@/lib/reports/period";
import { isAudience } from "@/lib/reports/audience";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Exports are heavy and rare; three a minute is generous for a human. */
const RATE_LIMIT = { limit: 3, windowMs: 60_000 };

export async function GET(request: Request) {
  const session = await requireAdminAction(Role.ADMIN);

  if (
    !rateLimit(
      `reportExport:${session.id}:${clientIp(request.headers)}`,
      RATE_LIMIT,
    ).ok
  ) {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }

  const url = new URL(request.url);
  const audienceParam = url.searchParams.get("audience") ?? undefined;
  const audience = isAudience(audienceParam) ? audienceParam : "executive";

  const localeParam = url.searchParams.get("reportLocale") ?? "";
  const reportLocale = (locales as readonly string[]).includes(localeParam)
    ? localeParam
    : "en";

  const period = resolvePeriod({
    period: url.searchParams.get("period") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
  });

  const [data, t] = await Promise.all([
    getReportData({ period, locale: reportLocale, audience }),
    getTranslations({ locale: reportLocale, namespace: "admin" }),
  ]);

  const headers = [
    t("reports.view.columnProject"),
    t("reports.view.columnClicks"),
    t("reports.view.columnGoogleLeads"),
    t("reports.view.columnRate"),
    t("reports.view.columnAllLeads"),
  ];

  /*
    Clicks and the rate they are the denominator of arrive with phase 4.
    Written as the same "not connected" wording the screen shows rather
    than as an empty cell: a blank in a spreadsheet is read as zero by the
    next person to sum the column.
  */
  const notConnected = t("reports.view.notConnected");

  const rows = data.rows.map((row) => [
    row.key === "news" ? t("reports.view.newsRow") : row.name,
    notConnected,
    row.googleLeads,
    notConnected,
    row.allLeads,
  ]);

  const month = period.start.toISOString().slice(0, 7);
  const base = `seo-report-${month}-${audience}`;

  if (url.searchParams.get("format") === "excel") {
    return new NextResponse(
      spreadsheetML(headers, rows, t("reports.view.title")),
      {
        headers: {
          "Content-Type": "application/vnd.ms-excel; charset=utf-8",
          "Content-Disposition": `attachment; filename="${base}.xls"`,
          "Cache-Control": "no-store",
        },
      },
    );
  }

  return new NextResponse(toCsv(headers, rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${csvFilename(base)}"`,
      "Cache-Control": "no-store",
    },
  });
}

/**
 * SpreadsheetML 2003.
 *
 * Numbers are written with ss:Type="Number" so Excel totals them instead
 * of treating them as text — the first thing anybody does with this file
 * is sum a column, and a column of text sums to zero without complaining.
 */
function spreadsheetML(
  headers: readonly string[],
  rows: readonly (string | number)[][],
  sheetName: string,
): string {
  const cell = (value: string | number) =>
    typeof value === "number"
      ? `<Cell><Data ss:Type="Number">${value}</Data></Cell>`
      : `<Cell><Data ss:Type="String">${escapeXml(value)}</Data></Cell>`;

  const row = (values: readonly (string | number)[]) =>
    `<Row>${values.map(cell).join("")}</Row>`;

  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<?mso-application progid="Excel.Sheet"?>` +
    `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" ` +
    `xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">` +
    // Excel refuses a sheet name over 31 characters or containing :\/?*[]
    `<Worksheet ss:Name="${escapeXml(sheetName.replace(/[:\\/?*[\]]/g, " ").slice(0, 31))}">` +
    `<Table>` +
    row(headers) +
    rows.map(row).join("") +
    `</Table></Worksheet></Workbook>`
  );
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
