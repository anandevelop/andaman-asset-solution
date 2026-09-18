/**
 * lib/home-sections.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Homepage section order/visibility (see HomeSection in schema.prisma).
 *
 * Only the sections that are actually data-driven blocks in
 * app/[locale]/(site)/page.tsx are manageable here. The hero carousel is
 * governed separately by /admin/pages/home/hero (it's a banner, not a
 * reorderable content block), and the closing CTA is structural chrome —
 * a page always ends with a call to action — so neither is in this list.
 *
 * Every key an admin can reorder/hide is exactly one of these 9. Adding a
 * new homepage section later means: add its key here, add its case to
 * SECTION_RENDERERS in page.tsx, done.
 */

import { prisma } from "@/lib/prisma";
import { safeQuery } from "@/lib/db";

export const HOME_SECTION_KEYS = [
  "COMPANY_INTRO",
  "VISION_MISSION",
  "FEATURED_PROJECTS",
  "CORPORATE",
  "AWARDS",
  "WHY_US",
  "UPCOMING_EVENT",
  "LATEST_NEWS",
  "FAQ",
] as const;

export type HomeSectionKey = (typeof HOME_SECTION_KEYS)[number];

export type HomeSectionRow = {
  id: string;
  key: HomeSectionKey;
  sortOrder: number;
  isVisible: boolean;
};

function isHomeSectionKey(value: string): value is HomeSectionKey {
  return (HOME_SECTION_KEYS as readonly string[]).includes(value);
}

/**
 * The public homepage's read: which of the 9 keys to render, in what
 * order. Never writes — safe to call from a page that renders with
 * `revalidate`.
 *
 * A table with zero rows at all (nobody has ever opened
 * /admin/pages/home/sections, including on a fresh database) is treated as "not
 * yet configured" and falls back to the full default order — not as "the
 * admin hid every section". A table that HAS rows but none visible really
 * does mean every section is hidden, and this returns an empty list.
 */
export async function getOrderedVisibleSectionKeys(): Promise<HomeSectionKey[]> {
  const rows = await safeQuery(
    "homeSection.findMany(public)",
    () => prisma.homeSection.findMany({ orderBy: { sortOrder: "asc" } }),
    [] as { key: string; sortOrder: number; isVisible: boolean }[],
  );

  if (rows.length === 0) {
    return [...HOME_SECTION_KEYS];
  }

  return rows
    .filter((row) => row.isVisible && isHomeSectionKey(row.key))
    .map((row) => row.key as HomeSectionKey);
}

/**
 * Seeds any of the 9 keys the table is missing, appended to the end of
 * the current order, visible by default — so a first-ever visit to
 * /admin/pages/home/sections (or a newly added 10th section key, someday) always
 * has a complete row to show, without ever resetting an admin's existing
 * order.
 */
async function ensureSeeded(): Promise<void> {
  const existing = await prisma.homeSection.findMany({ select: { key: true } });
  const have = new Set(existing.map((row) => row.key));
  const missing = HOME_SECTION_KEYS.filter((key) => !have.has(key));

  if (missing.length === 0) return;

  const startAt = existing.length;

  await prisma.homeSection.createMany({
    data: missing.map((key, index) => ({
      key,
      sortOrder: startAt + index,
      isVisible: true,
    })),
    skipDuplicates: true,
  });
}

/** Admin-only: every row (visible or not), seeding first if needed. */
export async function getAllSectionRows(): Promise<HomeSectionRow[]> {
  await ensureSeeded();

  const rows = await prisma.homeSection.findMany({ orderBy: { sortOrder: "asc" } });

  return rows
    .filter((row) => isHomeSectionKey(row.key))
    .map((row) => ({
      id: row.id,
      key: row.key as HomeSectionKey,
      sortOrder: row.sortOrder,
      isVisible: row.isVisible,
    }));
}
