/**
 * lib/site-copy.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Reads the SiteCopy overrides for i18n.ts and the /admin/pages/copy editor.
 * The rules — which keys, what an override may contain — are in
 * lib/site-copy-core.ts; this file only fetches.
 *
 * Every page render, the admin's included, loads messages through i18n.ts,
 * so the read is cached under the "site-copy" tag (one query per locale per
 * save, not per request) and degrades to "no overrides" on *any* error, as
 * lib/settings.ts does. safeQuery's narrower net would let a missing table
 * — P2021, between a deploy and its migration — take down every page on the
 * site, including the admin screen that could fix it.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  applyCopyOverrides,
  flattenMessages,
  isEditableKey,
  type ContentNamespace,
} from "@/lib/site-copy-core";
import { contentCopyDefaults } from "@/lib/site-copy-content";

export const SITE_COPY_TAG = "site-copy";

async function readOverrides(locale: string): Promise<Record<string, string>> {
  try {
    const rows = await prisma.siteCopy.findMany({
      where: { locale },
      select: { key: true, value: true },
    });
    const out: Record<string, string> = {};
    for (const row of rows) {
      if (isEditableKey(row.key) && row.value.trim().length > 0) out[row.key] = row.value;
    }
    return out;
  } catch (error) {
    console.error("[site-copy] falling back to messages/ defaults", error);
    return {};
  }
}

/** The overrides for one locale, as `{ "home.corporate.title": "…" }`. */
export const getCopyOverrides = unstable_cache(readOverrides, ["site-copy"], {
  tags: [SITE_COPY_TAG],
  // Backstop only. updateTag() in the save action is the mechanism.
  revalidate: 3600,
});

/** Uncached, for the editor: it must show what was just saved. */
export async function getCopyOverridesForEditing(
  locale: string,
): Promise<Record<string, { value: string; updatedAt: Date }>> {
  const rows = await prisma.siteCopy.findMany({
    where: { locale },
    select: { key: true, value: true, updatedAt: true },
  });
  return Object.fromEntries(rows.map((r) => [r.key, { value: r.value, updatedAt: r.updatedAt }]));
}

/**
 * When each key was last confirmed as still right in this language
 * (SiteCopyReview), for the admin grid's "review" flag. Uncached, like the
 * overrides above: the grid must show the mark the moment it is made.
 */
export async function getCopyReviews(locale: string): Promise<Record<string, Date>> {
  const rows = await prisma.siteCopyReview.findMany({
    where: { locale },
    select: { key: true, reviewedAt: true },
  });
  return Object.fromEntries(rows.map((r) => [r.key, r.reviewedAt]));
}

/**
 * A code-owned content tree (content/*.ts) with this locale's overrides
 * laid over it — for the pages that render those trees directly.
 *
 *   const policy = await withCopyOverrides("privacyPolicy", getPrivacyPolicy(locale), locale);
 *
 * Only keys in the editable tree (lib/site-copy-content.ts) apply. The save
 * action already refuses the rest, but a row written some other way must
 * still not reach a policy's version or effective date — the version is
 * what a lead's PDPA consent is recorded against.
 */
export async function withCopyOverrides<T extends object>(
  namespace: ContentNamespace,
  tree: T,
  locale: string,
): Promise<T> {
  const allowed = flattenMessages({ [namespace]: contentCopyDefaults(locale)[namespace] });
  const overrides = Object.fromEntries(
    Object.entries(await getCopyOverrides(locale)).filter(([key]) => key in allowed),
  );
  const applied = applyCopyOverrides({ [namespace]: tree }, overrides);
  return applied[namespace] as T;
}
