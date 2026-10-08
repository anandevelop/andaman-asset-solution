/**
 * lib/site-copy-save.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Writes copy overrides, any mix of languages in one go — shared by the
 * /admin/pages/copy grid (all four languages side by side) and the
 * "edit text" picker on the public site (components/edit/CopyPicker.tsx).
 *
 * A value left blank, or set back to exactly the default, deletes its row
 * rather than storing a copy of the default: a stored copy would quietly
 * stop following the JSON when a developer later improves that string.
 *
 * Unchanged values are skipped, not re-upserted: the audit extension logs
 * each write, and re-saving untouched rows would bury the real change.
 *
 * Call it from a server action only, after the caller's own guard
 * (requireAdminAction): it expires the cache with updateTag, which Next
 * allows nowhere else.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { revalidatePath, updateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { locales, type Locale } from "@/i18n";
import { isContentNamespace, isEditableKey, validateCopy, type CopyProblem } from "@/lib/site-copy-core";
import { allCopyDefaults } from "@/lib/site-copy-content";
import { SITE_COPY_TAG } from "@/lib/site-copy";

export type CopyEntry = { locale: string; key: string; value: string };

export type SaveCopyResult = {
  ok: boolean;
  /** Keyed `${locale}:${key}`, so each cell can show its own error. */
  errors: Record<string, CopyProblem>;
  saved: number;
  failed?: boolean;
};

export const copyCellId = (locale: string, key: string) => `${locale}:${key}`;

export async function saveCopyEntries(actorId: string, entries: CopyEntry[]): Promise<SaveCopyResult> {
  const byLocale = new Map<Locale, CopyEntry[]>();
  for (const entry of entries) {
    if (!(locales as readonly string[]).includes(entry.locale)) continue;
    const list = byLocale.get(entry.locale as Locale) ?? [];
    list.push(entry);
    byLocale.set(entry.locale as Locale, list);
  }

  const errors: Record<string, CopyProblem> = {};
  const toWrite: { locale: Locale; key: string; value: string }[] = [];
  const toClear: { locale: Locale; key: string }[] = [];

  for (const [locale, list] of byLocale) {
    const [defaults, existingRows] = await Promise.all([
      allCopyDefaults(locale),
      prisma.siteCopy.findMany({
        where: { locale, key: { in: list.map((entry) => entry.key) } },
        select: { key: true, value: true },
      }),
    ]);
    const existing = Object.fromEntries(existingRows.map((row) => [row.key, row.value]));

    for (const entry of list) {
      // Only keys the JSON has: nothing can invent copy nothing renders.
      const fallback = defaults[entry.key];
      if (!isEditableKey(entry.key) || fallback === undefined) continue;

      // Trim the ends but keep line breaks inside — some paragraphs use them.
      const value = entry.value.replace(/\r\n/g, "\n").trim();

      if (value.length === 0 || value === fallback) {
        if (entry.key in existing) toClear.push({ locale, key: entry.key });
        continue;
      }
      if (existing[entry.key] === value) continue;

      // content/*.ts text is never formatted as ICU: a brace is a brace.
      const problem = isContentNamespace(entry.key.split(".", 1)[0]) ? null : validateCopy(fallback, value);
      if (problem) {
        errors[copyCellId(locale, entry.key)] = problem;
        continue;
      }
      toWrite.push({ locale, key: entry.key, value });
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors, saved: 0 };
  if (toWrite.length === 0 && toClear.length === 0) return { ok: true, errors, saved: 0 };

  try {
    await prisma.$transaction([
      ...toWrite.map(({ locale, key, value }) =>
        prisma.siteCopy.upsert({
          where: { locale_key: { locale, key } },
          create: { locale, key, value, updatedBy: actorId },
          update: { value, updatedBy: actorId },
        }),
      ),
      ...toClear.map(({ locale, key }) => prisma.siteCopy.deleteMany({ where: { locale, key } })),
    ]);
  } catch (error) {
    console.error("[saveCopyEntries] failed", error);
    return { ok: false, errors, saved: 0, failed: true };
  }

  /* updateTag, not revalidateTag — only updateTag expires the cache
     immediately, and the editor reads the page again next. Then every
     route, since messages reach every page through the root layout. */
  updateTag(SITE_COPY_TAG);
  revalidatePath("/", "layout");

  return { ok: true, errors, saved: toWrite.length + toClear.length };
}
