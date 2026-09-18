"use server";

/**
 * app/[locale]/admin/(growth)/seo/keywords/actions.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The two write paths behind /admin/seo/keywords: re-running the
 * ContentLink scan, and importing a rank CSV. Both ADMIN-only, matching
 * this zone's default floor (see the layout's own header on why this
 * screen isn't in ROUTE_EXCEPTIONS).
 * ─────────────────────────────────────────────────────────────────────────
 */

import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { requireAdminAction } from "@/lib/admin/guard";
import { scanAndPersistLinkGraph, type ContentLinkScanResult } from "@/lib/admin/link-graph";
import { csvRankSource } from "@/lib/keywords/source";
import { applyRankUpdates } from "@/lib/keywords/rank-updates";

/** Large — a Search Console export commonly runs into the thousands of
 *  rows for a site with any real query volume. */
const MAX_KEYWORD_CSV_ROWS = 5_000;

export async function rescanContentLinks(
  locale: string,
): Promise<({ ok: true } & ContentLinkScanResult) | { ok: false; error: string }> {
  await requireAdminAction(Role.ADMIN);

  try {
    const result = await scanAndPersistLinkGraph();
    revalidatePath(`/${locale}/admin/seo/keywords`);
    return { ok: true, ...result };
  } catch (error) {
    console.error("[rescanContentLinks]", error);
    return { ok: false, error: "SCAN_FAILED" };
  }
}

export type KeywordCsvImportResult =
  | { ok: true; created: number; updated: number; errors: { line?: number; query: string; reason: string }[] }
  | { ok: false; error: string };

/**
 * `uiLocale` is which admin-UI page to revalidate (wherever the admin is
 * currently browsing); `keywordLocale` is which language the CSV's
 * queries are written in (the locale picked in the import panel — see
 * binding decision 2 in the phase plan). The two are independent: an
 * English-UI admin importing a Thai Search Console report is the normal
 * case, not an edge case.
 */
export async function importKeywordRanksCsv(
  uiLocale: string,
  keywordLocale: string,
  csvText: string,
): Promise<KeywordCsvImportResult> {
  await requireAdminAction(Role.ADMIN);

  if (!csvText.trim()) return { ok: false, error: "EMPTY_FILE" };

  const lineCount = csvText.split(/\r\n|\r|\n/).length;
  if (lineCount > MAX_KEYWORD_CSV_ROWS + 1) return { ok: false, error: "TOO_MANY_ROWS" };

  try {
    const parsed = await csvRankSource(csvText).fetchRankUpdates();
    const applied = await applyRankUpdates(parsed, keywordLocale);
    revalidatePath(`/${uiLocale}/admin/seo/keywords`);
    return { ok: true, ...applied };
  } catch (error) {
    console.error("[importKeywordRanksCsv]", error);
    return { ok: false, error: "SAVE_FAILED" };
  }
}
