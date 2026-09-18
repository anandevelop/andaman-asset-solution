/**
 * app/api/admin/projects/export/route.ts
 * ─────────────────────────────────────────────────────────────────────────
 * GET /api/admin/projects/export — download the project list as CSV
 * (Projects.dc.html's "ส่งออก CSV").
 *
 * EDITOR, not ADMIN — unlike the leads export next door, which is gated
 * higher because it hands over names, emails and phone numbers under
 * PDPA. This is the catalogue: the same rows the requester is already
 * looking at on /admin/projects, and mostly the same facts the public
 * /projects page publishes. Raising the bar here would gate a spreadsheet
 * of villa names behind a permission the page itself does not need.
 *
 * Two mutually exclusive scopes, matching the two ways the button is
 * offered: `ids` exports exactly the selected rows, and its absence
 * exports whatever the current filters match, so "export what I am
 * looking at" is the same query string with a different path.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { NextResponse } from "next/server";
import { Prisma, ProjectStatus, PropertyType, Role } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdminAction } from "@/lib/admin/guard";
import { rateLimit } from "@/lib/rate-limit";
import { toCsv, csvFilename } from "@/lib/csv";
import { locales } from "@/i18n";
import { localeFill } from "@/lib/locale-completeness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Same reasoning as the leads export: the file is built in memory. */
const MAX_ROWS = 5_000;

/** Exports are heavy and rare; three a minute is generous for a human. */
const RATE_LIMIT = { limit: 3, windowMs: 60_000 };

const querySchema = z.object({
  ids: z.string().optional(),
  search: z.string().optional(),
  type: z.string().optional(),
  status: z.string().optional(),
  published: z.string().optional(),
});

export async function GET(request: Request) {
  let actor;
  try {
    actor = await requireAdminAction(Role.EDITOR);
  } catch {
    return NextResponse.json({ ok: false, error: "UNAUTHORISED" }, { status: 403 });
  }

  const limit = rateLimit(`project-export:${actor.id}`, RATE_LIMIT);
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

  const { ids, search, type, status, published } = parsed.data;

  // A selection wins over the filters: the bulk bar's button means "these
  // rows", and silently widening that to the whole filtered view would
  // hand back a different file than the one the button described.
  const selected = ids
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, MAX_ROWS);

  const trimmedSearch = (search ?? "").trim();

  const where: Prisma.ProjectWhereInput = selected?.length
    ? { deletedAt: null, id: { in: selected } }
    : {
        deletedAt: null,
        ...(type && type !== "ALL" && (Object.values(PropertyType) as string[]).includes(type)
          ? { propertyType: type as PropertyType }
          : {}),
        ...(status &&
        status !== "ALL" &&
        (Object.values(ProjectStatus) as string[]).includes(status)
          ? { status: status as ProjectStatus }
          : {}),
        ...(published === "PUBLISHED"
          ? { isPublished: true }
          : published === "DRAFT"
            ? { isPublished: false }
            : {}),
        ...(trimmedSearch
          ? {
              OR: [
                { slug: { contains: trimmedSearch, mode: "insensitive" as const } },
                { location: { contains: trimmedSearch, mode: "insensitive" as const } },
                { nameEn: { contains: trimmedSearch, mode: "insensitive" as const } },
                { nameTh: { contains: trimmedSearch, mode: "insensitive" as const } },
                {
                  translations: {
                    some: { name: { contains: trimmedSearch, mode: "insensitive" as const } },
                  },
                },
              ],
            }
          : {}),
      };

  try {
    const projects = await prisma.project.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }],
      take: MAX_ROWS,
      select: {
        id: true,
        slug: true,
        nameEn: true,
        nameTh: true,
        location: true,
        propertyType: true,
        status: true,
        isPublished: true,
        contentStatus: true,
        sortOrder: true,
        totalUnits: true,
        priceFromTHB: true,
        priceToTHB: true,
        updatedAt: true,
        translations: {
          select: { locale: true, name: true, tagline: true, description: true },
        },
        _count: { select: { units: true } },
      },
    });

    // Availability per project, one aggregate for the whole export.
    const unitRows = await prisma.projectUnit.groupBy({
      by: ["projectId", "status"],
      where: { projectId: { in: projects.map((project) => project.id) } },
      _count: { _all: true },
    });

    const availableByProject = new Map<string, number>();
    for (const row of unitRows) {
      if (row.status === "AVAILABLE") availableByProject.set(row.projectId, row._count._all);
    }

    const headers = [
      "id",
      "slug",
      "name_en",
      "name_th",
      "location",
      "property_type",
      "status",
      "published",
      "content_status",
      "sort_order",
      "units_total",
      "units_available",
      "price_from_thb",
      "price_to_thb",
      // One column per locale so a gap is visible in a spreadsheet filter,
      // which is the whole reason someone exports this list.
      ...(locales as readonly string[]).map((locale) => `content_${locale}`),
      "updated_at",
    ];

    const rows = projects.map((project) => {
      const unitsTotal = project._count.units || project.totalUnits || 0;

      return [
        project.id,
        project.slug,
        project.nameEn,
        project.nameTh,
        project.location,
        project.propertyType,
        project.status,
        project.isPublished ? "yes" : "no",
        project.contentStatus,
        project.sortOrder,
        unitsTotal,
        project._count.units > 0 ? (availableByProject.get(project.id) ?? 0) : "",
        project.priceFromTHB?.toString() ?? "",
        project.priceToTHB?.toString() ?? "",
        ...(locales as readonly string[]).map((locale) =>
          localeFill(project.translations.find((row) => row.locale === locale)),
        ),
        project.updatedAt.toISOString(),
      ];
    });

    const csv = toCsv(headers, rows);
    const name = csvFilename(selected?.length ? "projects-selected" : "projects");

    return new NextResponse(csv, {
      status: 200,
      headers: {
        // charset in the type, BOM in the body — Excel wants both.
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store, must-revalidate",
        "X-Robots-Tag": "noindex, nofollow",
        ...(projects.length === MAX_ROWS ? { "X-Export-Truncated": "true" } : {}),
      },
    });
  } catch (error) {
    console.error("[projects/export] failed", error);
    return NextResponse.json({ ok: false, error: "SERVER_ERROR" }, { status: 500 });
  }
}
