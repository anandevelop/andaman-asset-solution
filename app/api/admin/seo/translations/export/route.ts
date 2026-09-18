/**
 * app/api/admin/seo/translations/export/route.ts
 * ─────────────────────────────────────────────────────────────────────────
 * GET /api/admin/seo/translations/export — every translation gap as CSV,
 * one row per (item, missing locale) pair.
 *
 * Route handlers sit outside the App Router's layout tree, so the
 * (growth) zone's ADMIN floor and its seo/translations exception never run
 * here — this route carries its own complete guard, same as every other
 * export endpoint in app/api/admin/*.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { requireAdminAction } from "@/lib/admin/guard";
import { rateLimit } from "@/lib/rate-limit";
import { toCsv, csvFilename } from "@/lib/csv";
import { getTranslationStatusReport } from "@/lib/locale-completeness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Same generosity as the other admin exports — this is rare, human-
 *  triggered traffic, not a loop. */
const RATE_LIMIT = { limit: 3, windowMs: 60_000 };

export async function GET() {
  let actor;
  try {
    actor = await requireAdminAction(Role.EDITOR);
  } catch {
    return NextResponse.json({ ok: false, error: "UNAUTHORISED" }, { status: 403 });
  }

  const limit = rateLimit(`translations-export:${actor.id}`, RATE_LIMIT);
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  try {
    const report = await getTranslationStatusReport();

    const headers = ["content_type", "item", "missing_locale", "edit_path"];

    const rows = report.groups.flatMap((group) =>
      group.items.flatMap((item) =>
        item.missingLocales.map((missingLocale) => [
          group.group,
          item.label,
          missingLocale,
          item.editHref,
        ]),
      ),
    );

    const csv = toCsv(headers, rows);
    const name = csvFilename("translation-gaps");

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store, must-revalidate",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  } catch (error) {
    console.error("[seo/translations/export] failed", error);
    return NextResponse.json({ ok: false, error: "SERVER_ERROR" }, { status: 500 });
  }
}
