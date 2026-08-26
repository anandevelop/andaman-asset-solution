"use server";

/**
 * app/[locale]/admin/attractions/actions.ts
 * ─────────────────────────────────────────────────────────────────────────
 * CRUD for NearbyAttractionCategory + NearbyAttractionItem. One form saves
 * a whole category at once — name plus every item row — because a
 * category with no items is meaningless and per-item server actions would
 * multiply round trips for no benefit at this scale (a handful of items
 * per category, a handful of categories per project).
 *
 * Items now carry a stable `id` (see nearbyAttractionItemSchema) and are
 * diffed rather than wiped-and-recreated: a recreate would mint a new item
 * id on every save and cascade-delete that item's NearbyAttractionItemTranslation
 * rows, silently destroying whatever zh/ru work existed for it whenever an
 * admin edited only the en/th tab. Existing rows are updated in place
 * (preserving every locale's translation but the one being saved),
 * genuinely new rows (no id) are created, and rows removed from the
 * submitted list are deleted. All of it — the category write, the item
 * diff — runs inside one `$transaction` so a failure partway through never
 * leaves items and their category out of sync.
 *
 * sandbox: `prisma as any` throughout — NearbyAttractionCategory/Item were
 * added to schema.prisma in this phase; see the cast note above
 * getProjectBySlug in lib/projects.ts for why the locally generated client
 * doesn't type them yet.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { locales } from "@/i18n";
import { requireAdminAction } from "@/lib/admin/guard";
import {
  nearbyAttractionCategorySchema,
  nearbyAttractionItemSchema,
  fieldErrors,
} from "@/lib/validations";

export type AttractionFormState = {
  ok: boolean;
  message?: string;
  fields?: Record<string, string>;
};

type RawItemRow = { id?: unknown; name?: unknown; distanceKm?: unknown; durationMin?: unknown };

function parseItemRows(raw: string): RawItemRow[] {
  if (!raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function revalidateAttractions(locale: string, projectId: string | null) {
  revalidatePath(`/${locale}/admin/attractions`);

  const db = prisma as any;
  const projects = projectId
    ? await db.project.findMany({ where: { id: projectId }, select: { slug: true } })
    // A shared-default edit can affect any project with no categories of
    // its own — cheapest correct fix at this project count is to
    // revalidate every project page, not just the ones currently falling
    // back (that set can change on the next save too).
    : await db.project.findMany({ select: { slug: true } });

  for (const target of locales) {
    for (const { slug } of projects) revalidatePath(`/${target}/projects/${slug}`);
  }
}

/**
 * Create (categoryId null) or update (categoryId set) one category and
 * fully replace its items from the submitted rows.
 */
export async function saveAttractionCategory(
  locale: string,
  projectId: string | null,
  categoryId: string | null,
  _previous: AttractionFormState,
  formData: FormData,
): Promise<AttractionFormState> {
  await requireAdminAction(Role.EDITOR);

  const editingLocale = ((formData.get("locale") as string | null) || "en") as string;

  const parsedCategory = nearbyAttractionCategorySchema.safeParse({
    locale: editingLocale,
    projectId: projectId ?? "",
    categoryName: (formData.get("categoryName") as string) ?? "",
    sortOrder: (formData.get("sortOrder") as string) || "0",
  });

  if (!parsedCategory.success) {
    return { ok: false, fields: fieldErrors(parsedCategory.error) };
  }
  const { categoryName, sortOrder } = parsedCategory.data;

  const itemRows = parseItemRows((formData.get("items") as string) ?? "[]");
  const items: { id: string | null; name: string; distanceKm: number; durationMin: number }[] = [];

  for (const row of itemRows) {
    const parsedItem = nearbyAttractionItemSchema.safeParse({
      id: typeof row.id === "string" ? row.id : "",
      categoryId: "pending", // real id assigned after the category exists
      name: row.name ?? "",
      distanceKm: String(row.distanceKm ?? ""),
      durationMin: String(row.durationMin ?? "0"),
      sortOrder: "0",
    });
    if (!parsedItem.success) {
      return { ok: false, fields: fieldErrors(parsedItem.error) };
    }
    items.push({
      id: parsedItem.data.id || null,
      name: parsedItem.data.name,
      distanceKm: parsedItem.data.distanceKm,
      durationMin: parsedItem.data.durationMin,
    });
  }

  const db = prisma as any;

  try {
    await db.$transaction(async (tx: any) => {
      let resolvedCategoryId = categoryId;

      if (categoryId) {
        await tx.nearbyAttractionCategory.update({
          where: { id: categoryId },
          data: {
            sortOrder,
            // categoryNameEn/categoryNameTh are @deprecated but
            // categoryNameEn is still NOT NULL — only touch the column
            // matching the locale being saved, same reasoning as
            // AwardForm's titleEn/titleTh.
            ...(editingLocale === "en" ? { categoryNameEn: categoryName } : {}),
            ...(editingLocale === "th" ? { categoryNameTh: categoryName } : {}),
            translations: {
              upsert: {
                where: { categoryId_locale: { categoryId, locale: editingLocale } },
                update: { categoryName },
                create: { locale: editingLocale, categoryName },
              },
            },
          },
        });

        // Diff against what's already in the database — see the file
        // comment for why this replaced delete-everything-then-recreate.
        const existing = await tx.nearbyAttractionItem.findMany({
          where: { categoryId },
          select: { id: true },
        });
        const submittedIds = new Set(items.filter((item) => item.id).map((item) => item.id as string));
        for (const row of existing) {
          if (!submittedIds.has(row.id as string)) {
            await tx.nearbyAttractionItem.delete({ where: { id: row.id } });
          }
        }
      } else {
        const created = await tx.nearbyAttractionCategory.create({
          data: {
            projectId,
            sortOrder,
            categoryNameEn: editingLocale === "en" ? categoryName : "",
            categoryNameTh: editingLocale === "th" ? categoryName : null,
            translations: { create: { locale: editingLocale, categoryName } },
          },
        });
        resolvedCategoryId = created.id;
      }

      let index = 0;
      for (const item of items) {
        if (item.id && categoryId) {
          await tx.nearbyAttractionItem.update({
            where: { id: item.id },
            data: {
              distanceKm: item.distanceKm,
              durationMin: item.durationMin,
              sortOrder: index,
              ...(editingLocale === "en" ? { nameEn: item.name } : {}),
              ...(editingLocale === "th" ? { nameTh: item.name } : {}),
              translations: {
                upsert: {
                  where: { itemId_locale: { itemId: item.id, locale: editingLocale } },
                  update: { name: item.name },
                  create: { locale: editingLocale, name: item.name },
                },
              },
            },
          });
        } else {
          await tx.nearbyAttractionItem.create({
            data: {
              categoryId: resolvedCategoryId,
              distanceKm: item.distanceKm,
              durationMin: item.durationMin,
              sortOrder: index,
              nameEn: editingLocale === "en" ? item.name : "",
              nameTh: editingLocale === "th" ? item.name : null,
              translations: { create: { locale: editingLocale, name: item.name } },
            },
          });
        }
        index += 1;
      }
    });
  } catch (error) {
    console.error("[saveAttractionCategory] failed", error);
    return { ok: false, message: "SAVE_FAILED" };
  }

  await revalidateAttractions(locale, projectId);
  return { ok: true, message: "SAVED" };
}

export async function deleteAttractionCategory(
  locale: string,
  projectId: string | null,
  categoryId: string,
): Promise<void> {
  await requireAdminAction(Role.EDITOR);

  const db = prisma as any;
  await db.nearbyAttractionCategory.delete({ where: { id: categoryId } });

  await revalidateAttractions(locale, projectId);
}
