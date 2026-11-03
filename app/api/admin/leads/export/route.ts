/**
 * app/api/admin/leads/export/route.ts
 * ─────────────────────────────────────────────────────────────────────────
 * GET /api/admin/leads/export — download LeadInquiry rows as CSV.
 *
 * ADMIN and above, not EDITOR. This is the one endpoint that hands the
 * company's entire enquiry list — names, emails, phone numbers — to a
 * browser in a single request. Under PDPA that is a data export, and it
 * belongs at a higher privilege than editing a page.
 *
 * Filters mirror the admin table's query params so "export what I am
 * looking at" is the same URL with a different path.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { NextResponse } from "next/server";
import { leadScopeWhere } from "@/lib/leads-board";
import { LeadStatus, Prisma } from "@prisma/client";
import { Role } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdminAction } from "@/lib/admin/guard";
import { rateLimit } from "@/lib/rate-limit";
import { toCsv, csvFilename } from "@/lib/csv";
import { countryByIso2 } from "@/lib/countries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Hard cap.
 *
 * The whole result set is built in memory before it is sent, so an
 * unbounded export is a way to run the server out of heap. At this size the
 * answer is a database dump run by an operator, not an HTTP download.
 */
const MAX_ROWS = 20_000;

/** Exports are heavy and rare; three a minute is generous for a human. */
const RATE_LIMIT = { limit: 3, windowMs: 60_000 };

const querySchema = z.object({
  status: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  /** Comma-separated lead ids — the table's bulk bar exporting exactly the
   *  rows ticked. The same cap as the bar's own selection. */
  ids: z
    .string()
    .optional()
    .transform((value) => (value ? value.split(",").filter(Boolean) : []))
    .pipe(z.array(z.string().regex(/^[a-z0-9]{10,40}$/)).max(100)),
});

/**
 * "2026-08-01" → the start (or end) of that day in Bangkok, or null.
 * Invalid input is ignored, not rejected. `new Date("2026-08-01")` is UTC
 * midnight, i.e. 07:00 in Bangkok, which used to drop the first seven
 * hours of the start day.
 */
function parseDate(value: string | undefined, endOfDay = false): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}+07:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function GET(request: Request) {
  let actor;
  try {
    actor = await requireAdminAction(Role.ADMIN);
  } catch {
    return NextResponse.json({ ok: false, error: "UNAUTHORISED" }, { status: 403 });
  }

  const limit = rateLimit(`lead-export:${actor.id}`, RATE_LIMIT);
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));

  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "VALIDATION_FAILED" }, { status: 422 });
  }

  const { status, from, to, ids } = parsed.data;

  const statusFilter =
    status && status !== "ALL" && (Object.values(LeadStatus) as string[]).includes(status)
      ? (status as LeadStatus)
      : null;

  const fromDate = parseDate(from);
  const toDate = parseDate(to, true);

  // Held to the same rows the leads board shows this account.
  const scope = await leadScopeWhere(actor);
  const filters: Prisma.LeadInquiryWhereInput = {
    ...(ids.length > 0 ? { id: { in: ids } } : {}),
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(fromDate || toDate
      ? {
          createdAt: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lte: toDate } : {}),
          },
        }
      : {}),
  };
  const where: Prisma.LeadInquiryWhereInput = scope ? { AND: [scope, filters] } : filters;

  try {
    const leads = await prisma.leadInquiry.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: MAX_ROWS,
      select: {
        id: true,
        createdAt: true,
        name: true,
        email: true,
        phone: true,
        phoneCountry: true,
        nationality: true,
        message: true,
        source: true,
        status: true,
        consentGiven: true,
        consentedAt: true,
        consentVersion: true,
        utmSource: true,
        utmMedium: true,
        utmCampaign: true,
        project: { select: { slug: true, nameEn: true } },
      },
    });

    const headers = [
      "id",
      "created_at",
      "name",
      "email",
      "phone",
      "phone_country",
      // Two columns, not one: "nationality" is the English name a human
      // reads, "nationality_code" is the raw stored value (an ISO2 for any
      // lead captured through CountrySelect.tsx, or old free text for one
      // from before it shipped — see LeadInquiry.nationality in
      // schema.prisma). Losing the raw code would make an export unable to
      // tell "GB" from a lead who genuinely typed the string "GB".
      "nationality",
      "nationality_code",
      "project",
      "source",
      "status",
      "message",
      // The PDPA trail travels with the data. An export without it is a
      // contact list with no record of permission to hold it.
      "consent_given",
      "consented_at",
      "consent_version",
      "utm_source",
      "utm_medium",
      "utm_campaign",
    ];

    const rows = leads.map((lead) => {
      const country = countryByIso2(lead.nationality);
      return [
        lead.id,
        lead.createdAt.toISOString(),
        lead.name,
        lead.email,
        lead.phone,
        lead.phoneCountry ?? "",
        country ? country.name.en : (lead.nationality ?? ""),
        lead.nationality ?? "",
        lead.project?.nameEn ?? "",
        lead.source,
        lead.status,
        lead.message ?? "",
        lead.consentGiven ? "yes" : "no",
        lead.consentedAt?.toISOString() ?? "",
        lead.consentVersion ?? "",
        lead.utmSource ?? "",
        lead.utmMedium ?? "",
        lead.utmCampaign ?? "",
      ];
    });

    // Logged deliberately: a bulk export of personal data should leave a
    // trace naming who took it and how much.
    console.info(
      `[leads/export] ${leads.length} rows by user=${actor.id} status=${
        statusFilter ?? "ALL"
      } from=${from ?? "-"} to=${to ?? "-"} ids=${ids.length > 0 ? ids.length : "-"}`,
    );

    const csv = toCsv(headers, rows);
    const name = csvFilename(`leads-${statusFilter ?? "all"}`);

    return new NextResponse(csv, {
      status: 200,
      headers: {
        // charset in the type, BOM in the body — Excel wants both.
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store, must-revalidate",
        "X-Robots-Tag": "noindex, nofollow",
        ...(leads.length === MAX_ROWS ? { "X-Export-Truncated": "true" } : {}),
      },
    });
  } catch (error) {
    console.error("[leads/export] failed", error);
    return NextResponse.json({ ok: false, error: "SERVER_ERROR" }, { status: 500 });
  }
}
