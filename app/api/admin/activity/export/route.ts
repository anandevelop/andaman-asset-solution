/**
 * app/api/admin/activity/export/route.ts
 * ─────────────────────────────────────────────────────────────────────────
 * GET /api/admin/activity/export — the activity log as a CSV, with the
 * filters the page is showing (lib/admin/activity-query.ts): tab, period,
 * person and search. SUPER_ADMIN only, like the page.
 *
 * It carries what the table carries and no more. In particular the values
 * of a change are exported only where the log holds them, which is never
 * for customer data — see AuditLog.changes.
 *
 * Capped at 20,000 rows, newest first; rate limited, because it is a full
 * table read.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getTranslations } from "next-intl/server";
import { requireAdminAction } from "@/lib/admin/guard";
import { prisma } from "@/lib/prisma";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { toCsv, csvFilename } from "@/lib/csv";
import { locales } from "@/i18n";
import { activityWhere, categoryOf, parseActivityFilters } from "@/lib/admin/activity-query";
import { auditModelLabel, type AuditModelLabels } from "@/lib/admin/audit-model-label";
import { deviceLabel } from "@/lib/audit/device";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ROWS = 20_000;
const RATE_LIMIT = { limit: 3, windowMs: 60_000 };

const printable = (value: unknown): string =>
  value === null || value === undefined ? "" : typeof value === "string" ? value : JSON.stringify(value);

export async function GET(request: Request) {
  let session;
  try {
    session = await requireAdminAction(Role.SUPER_ADMIN);
  } catch {
    return NextResponse.json({ error: "UNAUTHORISED" }, { status: 403 });
  }

  if (!rateLimit(`activityExport:${session.id}:${clientIp(request.headers)}`, RATE_LIMIT).ok) {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }

  const url = new URL(request.url);
  const localeParam = url.searchParams.get("locale") ?? "";
  const locale = (locales as readonly string[]).includes(localeParam) ? localeParam : "en";
  const filters = parseActivityFilters({
    tab: url.searchParams.get("tab"),
    range: url.searchParams.get("range"),
    actor: url.searchParams.get("actor"),
    q: url.searchParams.get("q"),
  });

  const [t, entries] = await Promise.all([
    getTranslations({ locale, namespace: "admin" }),
    prisma.auditLog.findMany({ where: activityWhere(filters), orderBy: { createdAt: "desc" }, take: MAX_ROWS }),
  ]);
  const modelLabels = t.raw("auditModels") as AuditModelLabels;

  const headers = ["time", "email", "role", "action", "category", "model", "record", "fields", "changes", "ip", "device"].map((key) =>
    t(`activity.csv.${key}` as never),
  );

  const rows = entries.map((entry) => {
    const changes = (entry.changes ?? null) as Record<string, { before: unknown; after: unknown }> | null;
    return [
      entry.createdAt.toISOString(),
      entry.actorEmail,
      entry.actorRole ?? "",
      entry.action,
      t(`activity.tab.${categoryOf(entry.model)}` as never),
      auditModelLabel(entry.model, modelLabels),
      entry.count !== null ? t("activity.bulk", { count: entry.count }) : (entry.recordLabel ?? ""),
      entry.changedFields.join(", "),
      Object.entries(changes ?? {})
        .map(([field, change]) => `${field}: ${printable(change.before)} → ${printable(change.after)}`)
        .join(" | "),
      entry.ipAddress ?? "",
      deviceLabel(entry.userAgent) ?? "",
    ];
  });

  // The BOM is what makes Excel read Thai as UTF-8.
  return new NextResponse(`﻿${toCsv(headers, rows)}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${csvFilename("activity")}"`,
      "Cache-Control": "no-store",
    },
  });
}
