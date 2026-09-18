"use server";

/**
 * app/[locale]/admin/(content)/news/keyword-lsi-actions.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The news editor's Keywords tab reads and writes a tracked Keyword's
 * lsiTerms through these two actions — the one place the editor talks
 * directly to the Keyword table (see NewsSeoPanel.tsx's own note on this
 * being its one exception to being a pure-derived-display component).
 *
 * Keyword.phrase is globally unique, not unique per locale — a blind
 * upsert({where:{phrase}}) could silently attach an English editor's LSI
 * term to a same-spelled Thai-locale keyword's row. Both actions here
 * check across all locales first and refuse a cross-locale collision
 * rather than guess, the same rule lib/keywords/rank-updates.ts applies
 * to CSV imports.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { Role } from "@prisma/client";
import { requireAdminAction } from "@/lib/admin/guard";
import { prisma } from "@/lib/prisma";

export async function getKeywordForPhrase(
  phrase: string,
  locale: string,
): Promise<{ id: string; lsiTerms: string[] } | null> {
  await requireAdminAction(Role.VIEWER);

  const trimmed = phrase.trim();
  if (!trimmed) return null;

  const row = await prisma.keyword.findFirst({
    where: { locale, phrase: { equals: trimmed, mode: "insensitive" } },
    select: { id: true, lsiTerms: true },
  });

  return row;
}

export async function upsertLsiTerms(
  phrase: string,
  locale: string,
  lsiTerms: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdminAction(Role.EDITOR);

  const trimmedPhrase = phrase.trim();
  if (!trimmedPhrase) return { ok: false, error: "EMPTY_PHRASE" };

  const cleanTerms = Array.from(new Set(lsiTerms.map((term) => term.trim()).filter(Boolean)));

  // Across every locale, not just this one — see the file header.
  const existing = await prisma.keyword.findFirst({
    where: { phrase: { equals: trimmedPhrase, mode: "insensitive" } },
    select: { id: true, locale: true },
  });

  if (existing && existing.locale !== locale) {
    return { ok: false, error: "PHRASE_TRACKED_IN_ANOTHER_LOCALE" };
  }

  if (existing) {
    await prisma.keyword.update({ where: { id: existing.id }, data: { lsiTerms: cleanTerms } });
  } else {
    // A brand-new focus keyword nobody has tracked before — saving LSI
    // terms for it is what starts tracking it, per this phase's own
    // decision (mirrors the CSV importer's unmatched-query rule).
    await prisma.keyword.create({ data: { phrase: trimmedPhrase, locale, lsiTerms: cleanTerms } });
  }

  return { ok: true };
}
