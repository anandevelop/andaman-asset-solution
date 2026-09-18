/**
 * app/api/admin/events/[id]/registrations/export/route.ts
 * ─────────────────────────────────────────────────────────────────────────
 * GET — download one event's registration list as CSV.
 *
 * Gated on exportCustomerData, not on a rank: this hands over a file of
 * names, emails and phone numbers, which under PDPA is a data export and
 * is the narrowest permission in lib/permissions.ts. Every download is
 * logged with who took it and how many rows, the same as the leads export.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { NextResponse } from "next/server";
import { EventStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireCapabilityAction } from "@/lib/admin/guard";
import { rateLimit } from "@/lib/rate-limit";
import { toCsv, csvFilename } from "@/lib/csv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ROWS = 5_000;
const RATE_LIMIT = { limit: 3, windowMs: 60_000 };

const querySchema = z.object({
  q: z.string().optional(),
  status: z.string().optional(),
  lang: z.string().optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, props: Params) {
  let actor;
  try {
    actor = await requireCapabilityAction("exportCustomerData");
  } catch {
    return NextResponse.json({ ok: false, error: "UNAUTHORISED" }, { status: 403 });
  }

  const limit = rateLimit(`registration-export:${actor.id}`, RATE_LIMIT);
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  const { id } = await props.params;
  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "VALIDATION_FAILED" }, { status: 422 });
  }

  const { q, status, lang } = parsed.data;
  const search = (q ?? "").trim();

  const where: Prisma.EventRegistrationWhereInput = {
    eventId: id,
    ...(status && status !== "ALL" && (Object.values(EventStatus) as string[]).includes(status)
      ? { status: status as EventStatus }
      : {}),
    ...(lang && lang !== "ALL" ? { locale: lang } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { email: { contains: search, mode: "insensitive" as const } },
            { phone: { contains: search } },
          ],
        }
      : {}),
  };

  try {
    const [event, rows] = await Promise.all([
      prisma.event.findUnique({ where: { id }, select: { titleEn: true } }),
      prisma.eventRegistration.findMany({
        where,
        orderBy: { createdAt: "asc" },
        take: MAX_ROWS,
        select: {
          name: true,
          agencyName: true,
          email: true,
          phone: true,
          partySize: true,
          locale: true,
          status: true,
          checkedInAt: true,
          leadId: true,
          notes: true,
          consentGiven: true,
          consentedAt: true,
          consentVersion: true,
          createdAt: true,
        },
      }),
    ]);

    if (!event) return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });

    const headers = [
      "name",
      "agency",
      "email",
      "phone",
      "party_size",
      "language",
      "status",
      "checked_in_at",
      "lead_created",
      "notes",
      // The consent trail travels with the data — an exported contact list
      // without it is a list with no record of permission to hold it.
      "consent_given",
      "consented_at",
      "consent_version",
      "registered_at",
    ];

    const csv = toCsv(
      headers,
      rows.map((row) => [
        row.name,
        row.agencyName ?? "",
        row.email,
        row.phone,
        row.partySize,
        row.locale ?? "",
        row.status,
        row.checkedInAt?.toISOString() ?? "",
        row.leadId ? "yes" : "no",
        row.notes ?? "",
        row.consentGiven ? "yes" : "no",
        row.consentedAt?.toISOString() ?? "",
        row.consentVersion ?? "",
        row.createdAt.toISOString(),
      ]),
    );

    console.info(
      `[events/registrations/export] ${rows.length} rows by user=${actor.id} event=${id}`,
    );

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${csvFilename(`registrations-${event.titleEn}`)}"`,
        "Cache-Control": "no-store, must-revalidate",
        "X-Robots-Tag": "noindex, nofollow",
        ...(rows.length === MAX_ROWS ? { "X-Export-Truncated": "true" } : {}),
      },
    });
  } catch (error) {
    console.error("[events/registrations/export] failed", error);
    return NextResponse.json({ ok: false, error: "SERVER_ERROR" }, { status: 500 });
  }
}
