/**
 * app/api/admin/projects/[id]/units/export/route.ts
 * ─────────────────────────────────────────────────────────────────────────
 * GET — download one project's unit list as CSV.
 *
 * The first ten columns are exactly importUnitsCsv's own CSV_COLUMNS, in
 * the same order — see ../../actions.ts. Export, edit in a spreadsheet,
 * re-import is the point: the importer matches columns by name, not
 * position, so the two extra reference columns at the end (updated_at,
 * reserved_by_rep) ride along harmlessly on the way back in.
 *
 * EDITOR, not a PDPA capability — same reasoning as the projects export
 * next door: no lead name, email or phone leaves this file, only the rep
 * (internal staff) currently holding a reservation, if any.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdminAction } from "@/lib/admin/guard";
import { rateLimit } from "@/lib/rate-limit";
import { toCsv, csvFilename } from "@/lib/csv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ROWS = 5_000;
const RATE_LIMIT = { limit: 3, windowMs: 60_000 };

const querySchema = z.object({ phase: z.string().optional() });

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, props: Params) {
  let actor;
  try {
    actor = await requireAdminAction(Role.EDITOR);
  } catch {
    return NextResponse.json({ ok: false, error: "UNAUTHORISED" }, { status: 403 });
  }

  const limit = rateLimit(`unit-export:${actor.id}`, RATE_LIMIT);
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  const { id: projectId } = await props.params;
  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "VALIDATION_FAILED" }, { status: 422 });
  }

  // Matches the page's own ?phase= semantics exactly: "none" is the
  // untitled group (phase IS NULL), a bare integer is that phase, and
  // anything else — including absent — is every plot in the project.
  const { phase } = parsed.data;
  const phaseFilter =
    phase === "none"
      ? { phase: null }
      : phase !== undefined && Number.isInteger(Number(phase))
        ? { phase: Number(phase) }
        : {};

  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { slug: true },
    });

    if (!project) {
      return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
    }

    const units = await prisma.projectUnit.findMany({
      where: { projectId, ...phaseFilter },
      orderBy: [{ phase: "asc" }, { sortOrder: "asc" }, { unitNumber: "asc" }],
      take: MAX_ROWS,
      select: {
        unitNumber: true,
        status: true,
        landAreaSqm: true,
        facing: true,
        viewLabel: true,
        phase: true,
        releasedForSale: true,
        priceTHB: true,
        adminNotes: true,
        updatedAt: true,
        unitType: { select: { name: true } },
        reservedBy: { select: { name: true } },
      },
    });

    const headers = [
      "unit_number",
      "unit_type",
      "status",
      "land_area_sqm",
      "facing",
      "view",
      "phase",
      "released_for_sale",
      "price_thb",
      "admin_notes",
      "updated_at",
      "reserved_by_rep",
    ];

    const rows = units.map((unit) => [
      unit.unitNumber,
      unit.unitType?.name ?? "",
      unit.status,
      unit.landAreaSqm?.toString() ?? "",
      unit.facing ?? "",
      unit.viewLabel ?? "",
      unit.phase ?? "",
      unit.releasedForSale ? "true" : "false",
      unit.priceTHB?.toString() ?? "",
      unit.adminNotes ?? "",
      unit.updatedAt.toISOString(),
      unit.reservedBy?.name ?? "",
    ]);

    const csv = toCsv(headers, rows);
    const name = csvFilename(`units-${project.slug}`);

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store, must-revalidate",
        "X-Robots-Tag": "noindex, nofollow",
        ...(units.length === MAX_ROWS ? { "X-Export-Truncated": "true" } : {}),
      },
    });
  } catch (error) {
    console.error("[units/export] failed", error);
    return NextResponse.json({ ok: false, error: "SERVER_ERROR" }, { status: 500 });
  }
}
