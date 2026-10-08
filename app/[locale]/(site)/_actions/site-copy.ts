"use server";

/**
 * app/[locale]/(site)/_actions/site-copy.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The two calls behind "edit text" on the public site
 * (components/edit/CopyPicker.tsx): which message key printed the words an
 * editor clicked, and save that key's four languages.
 *
 * The page HTML is cached and shared, so nothing about keys is in it; the
 * picker sends the clicked element's text (and its parents', for text
 * split across tags) and this matches it against the copy as the site
 * currently renders it in that language — the default with any saved
 * override laid over it. Guarded like any admin write: EDITOR, 2FA done.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { Role } from "@prisma/client";
import { requireAdminAction } from "@/lib/admin/guard";
import { locales } from "@/i18n";
import { copyMatches, isContentNamespace, placeholdersOf, type CopyProblem } from "@/lib/site-copy-core";
import { allCopyDefaults } from "@/lib/site-copy-content";
import { getCopyOverridesForEditing } from "@/lib/site-copy";
import { saveCopyEntries, type CopyEntry } from "@/lib/site-copy-save";

export type PickedCopy = {
  key: string;
  icu: boolean;
  args: string[];
  tags: string[];
  cells: { locale: string; fallback: string; saved: string | null }[];
};

const MAX_MATCHES = 6;
const MAX_CANDIDATE_LENGTH = 600;

export async function findCopyForText(locale: string, candidates: string[]): Promise<PickedCopy[]> {
  await requireAdminAction(Role.EDITOR);
  if (!(locales as readonly string[]).includes(locale)) return [];

  const texts = candidates
    .filter((text) => typeof text === "string")
    .map((text) => text.trim())
    .filter((text) => text.length > 0 && text.length <= MAX_CANDIDATE_LENGTH)
    .slice(0, 5);
  if (texts.length === 0) return [];

  const [defaults, overrides] = await Promise.all([allCopyDefaults(locale), getCopyOverridesForEditing(locale)]);

  // The innermost text that matches anything wins: clicking a heading
  // must not answer with the whole card it sits in.
  let keys: string[] = [];
  for (const text of texts) {
    for (const [key, fallback] of Object.entries(defaults)) {
      const icu = !isContentNamespace(key.split(".", 1)[0]);
      const shown = overrides[key]?.value ?? fallback;
      if (copyMatches(shown, text, icu)) keys.push(key);
      if (keys.length >= MAX_MATCHES) break;
    }
    if (keys.length > 0) break;
  }
  keys = keys.slice(0, MAX_MATCHES);
  if (keys.length === 0) return [];

  const perLocale = await Promise.all(
    locales.map(async (l) => ({
      locale: l,
      defaults: l === locale ? defaults : await allCopyDefaults(l),
      overrides: l === locale ? overrides : await getCopyOverridesForEditing(l),
    })),
  );
  const order = ["th", "en", "zh", "ru"];
  perLocale.sort((a, b) => order.indexOf(a.locale) - order.indexOf(b.locale));

  return keys.map((key) => {
    const icu = !isContentNamespace(key.split(".", 1)[0]);
    return {
      key,
      icu,
      ...(icu ? placeholdersOf(defaults[key]) : { args: [], tags: [] }),
      cells: perLocale.map((p) => ({
        locale: p.locale,
        fallback: p.defaults[key] ?? "",
        saved: p.overrides[key]?.value ?? null,
      })),
    };
  });
}

export type SaveFromSiteResult = { ok: boolean; errors: Record<string, CopyProblem>; failed?: boolean };

export async function saveCopyFromSite(entries: CopyEntry[]): Promise<SaveFromSiteResult> {
  const actor = await requireAdminAction(Role.EDITOR);
  const clean = (Array.isArray(entries) ? entries : [])
    .filter((e) => e && typeof e.locale === "string" && typeof e.key === "string" && typeof e.value === "string")
    .slice(0, 8);
  const result = await saveCopyEntries(actor.id, clean);
  return { ok: result.ok, errors: result.errors, failed: result.failed };
}
