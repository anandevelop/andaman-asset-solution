"use server";

/**
 * app/[locale]/admin/(content)/pages/home/sections/actions.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Homepage section order/visibility — see HomeSection in schema.prisma
 * and lib/home-sections.ts for the 9 manageable keys and why the hero
 * carousel and closing CTA are not among them.
 *
 * Reordering is the whole list at once, from the drag list on the Home tab
 * (components/admin/HomeSectionList.tsx); the swap-with-neighbour action
 * behind the old up/down arrows went with them.
 */

import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { locales } from "@/i18n";
import { requireAdminAction } from "@/lib/admin/guard";
import { getAllSectionRows } from "@/lib/home-sections";
import { isCompleteOrder } from "@/lib/admin/complete-order";

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

/**
 * The whole order at once, for the drag list. `orderedIds` must name every
 * HomeSection row exactly once — a list from a stale screen (a section
 * added or removed since it loaded) is refused rather than half-applied.
 * The existing sortOrder values are reused in the new order, so nothing
 * outside the nine rows can be pushed out of place.
 */
export async function reorderSections(
  locale: string,
  orderedIds: string[],
): Promise<{ ok: boolean }> {
  await requireAdminAction(Role.EDITOR);

  const rows = await getAllSectionRows();
  if (!isCompleteOrder(orderedIds, rows.map((row) => row.id))) return { ok: false };

  const slots = rows.map((row) => row.sortOrder).sort((a, b) => a - b);
  await prisma.$transaction(
    orderedIds.map((id, index) => prisma.homeSection.update({ where: { id }, data: { sortOrder: slots[index] } })),
  );

  revalidateHome(locale);
  return { ok: true };
}
