"use server";

/**
 * app/[locale]/admin/(content)/pages/home/sections/actions.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Homepage section order/visibility — see HomeSection in schema.prisma
 * and lib/home-sections.ts for the 9 manageable keys and why the hero
 * carousel and closing CTA are not among them.
 *
 * Reordering is a swap-with-neighbour move, not drag-and-drop — matching
 * every other reorderable list in this admin (hero slides, awards,
 * milestones, home-gallery photos all use a plain sortOrder field).
 */

import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { locales } from "@/i18n";
import { requireAdminAction } from "@/lib/admin/guard";
import { getAllSectionRows } from "@/lib/home-sections";

function revalidateHome(locale: string) {
  // The screen that renders the order list is /admin/pages/home itself now
  // — this path only redirects there, so purging it purged nothing the
  // operator was looking at.
  revalidatePath(`/${locale}/admin/pages/home`);
  for (const target of locales) {
    revalidatePath(`/${target}`);
  }
}

export async function setSectionVisible(
  locale: string,
  id: string,
  isVisible: boolean,
): Promise<void> {
  await requireAdminAction(Role.EDITOR);

  await prisma.homeSection.update({ where: { id }, data: { isVisible } });

  revalidateHome(locale);
}

export async function moveSection(
  locale: string,
  id: string,
  direction: "up" | "down",
): Promise<void> {
  await requireAdminAction(Role.EDITOR);

  const rows = await getAllSectionRows();
  const index = rows.findIndex((row) => row.id === id);
  if (index === -1) return;

  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (swapWith < 0 || swapWith >= rows.length) return;

  const a = rows[index];
  const b = rows[swapWith];

  await prisma.$transaction([
    prisma.homeSection.update({ where: { id: a.id }, data: { sortOrder: b.sortOrder } }),
    prisma.homeSection.update({ where: { id: b.id }, data: { sortOrder: a.sortOrder } }),
  ]);

  revalidateHome(locale);
}
