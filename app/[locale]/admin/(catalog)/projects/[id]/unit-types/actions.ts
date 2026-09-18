"use server";

/**
 * app/[locale]/admin/projects/[id]/unit-types/actions.ts
 * ─────────────────────────────────────────────────────────────────────────
 * ProjectUnitType CRUD, plus its floor plans — one form saves a whole unit
 * type at once (specs + every floor-plan row), same shape as
 * ../../../attractions/actions.ts's saveAttractionCategory: a unit type
 * with no floor plans is still meaningful (unlike a category with no
 * items), but per-floor-plan server actions would still multiply round
 * trips for no benefit at this scale — a handful of floors per type, a
 * handful of types per project.
 *
 * Floor plan rows carry a client-only `key` (see FloorPlansEditor's file
 * comment) used only to find that row's own ImageUploader field in the
 * submitted FormData — see readFloorPlanRows() below. Rows with a
 * database `id` are diffed against what already exists (updated in place,
 * same reasoning as saveAttractionCategory's item diff — a wipe-and-
 * recreate would mint new ids and orphan anything that referenced the old
 * ones); rows without one are created; anything in the database but no
 * longer in the submitted list is deleted. All of it runs inside one
 * `$transaction` so a failure partway through never leaves floor plans and
 * their unit type out of sync.
 */

import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { locales } from "@/i18n";
import { requireAdminAction } from "@/lib/admin/guard";
import { unitTypeSchema, floorPlanRowSchema, fieldErrors } from "@/lib/validations";

export type UnitTypeFormState = {
  ok: boolean;
  message?: string;
  fields?: Record<string, string>;
};

type RawFloorPlanRow = { key?: unknown; id?: unknown; floorName?: unknown };

function parseFloorPlanRowKeys(raw: string): RawFloorPlanRow[] {
  if (!raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * FloorPlansEditor serializes the row *list* (key/id/floorName) as one
 * JSON blob, but each row's photo is its own ImageUploader with a
 * `floorPlanImage__{key}`-named field — see that component's file comment
 * for why an image can't just ride along inside the JSON too. This
 * recombines both halves into one row per entry, validates each with
 * floorPlanRowSchema, and silently drops rows nothing was ever entered
 * for (an admin who clicked "Add floor plan" and then changed their mind
 * shouldn't get a validation error for leaving it empty).
 */
function readFloorPlanRows(
  formData: FormData,
): { rows: { id: string | null; floorName: string; imageUrl: string }[]; fields?: Record<string, string> } {
  const raw = (formData.get("floorPlans") as string | null) ?? "[]";
  const entries = parseFloorPlanRowKeys(raw);

  const rows: { id: string | null; floorName: string; imageUrl: string }[] = [];

  for (const entry of entries) {
    const key = typeof entry.key === "string" ? entry.key : "";
    if (!key) continue;

    const floorName = typeof entry.floorName === "string" ? entry.floorName.trim() : "";
    const imageUrl = ((formData.get(`floorPlanImage__${key}`) as string | null) ?? "").trim();

    // Never touched — not an error, just skip it.
    if (!floorName && !imageUrl) continue;

    const parsed = floorPlanRowSchema.safeParse({
      id: typeof entry.id === "string" ? entry.id : "",
      key,
      floorName,
      imageUrl,
    });
    if (!parsed.success) {
      return { rows: [], fields: fieldErrors(parsed.error) };
    }

    rows.push({ id: parsed.data.id || null, floorName: parsed.data.floorName, imageUrl: parsed.data.imageUrl });
  }

  return { rows };
}

function revalidateUnitTypes(locale: string, projectId: string, projectSlug: string) {
  revalidatePath(`/${locale}/admin/projects/${projectId}/unit-types`);
  for (const target of locales) {
    revalidatePath(`/${target}/projects/${projectSlug}`);
  }
}

/**
 * Create (unitTypeId null) or update (unitTypeId set) one unit type and
 * fully reconcile its floor plans against the submitted rows.
 */
export async function saveUnitType(
  locale: string,
  projectId: string,
  projectSlug: string,
  unitTypeId: string | null,
  _previous: UnitTypeFormState,
  formData: FormData,
): Promise<UnitTypeFormState> {
  await requireAdminAction(Role.EDITOR);

  const editingLocale = ((formData.get("locale") as string | null) || "en") as string;

  const parsed = unitTypeSchema.safeParse({
    locale: editingLocale,
    name: (formData.get("name") as string) ?? "",
    description: (formData.get("description") as string) ?? "",
    livingAreaSqm: (formData.get("livingAreaSqm") as string) ?? "",
    bedrooms: (formData.get("bedrooms") as string) ?? "",
    bathrooms: (formData.get("bathrooms") as string) ?? "",
    totalUnits: (formData.get("totalUnits") as string) ?? "",
    sortOrder: (formData.get("sortOrder") as string) || "0",
  });
  if (!parsed.success) return { ok: false, fields: fieldErrors(parsed.error) };

  const { name, description, livingAreaSqm, bedrooms, bathrooms, totalUnits, sortOrder } = parsed.data;

  const { rows: floorPlanRows, fields: floorPlanErrors } = readFloorPlanRows(formData);
  if (floorPlanErrors) return { ok: false, fields: floorPlanErrors };

  const db = prisma;

  try {
    await db.$transaction(async (tx: any) => {
      let resolvedId = unitTypeId;

      const specData = {
        livingAreaSqm,
        bedrooms,
        bathrooms,
        totalUnits,
        sortOrder,
      };

      if (unitTypeId) {
        await tx.projectUnitType.update({
          where: { id: unitTypeId },
          data: {
            name,
            ...specData,
            // descriptionEn/Th are @deprecated but descriptionEn-style
            // columns aren't NOT NULL here (unlike name pairs elsewhere) —
            // still only touched for the locale being saved, same
            // reasoning as every other translated admin form.
            ...(editingLocale === "en" ? { descriptionEn: description } : {}),
            ...(editingLocale === "th" ? { descriptionTh: description } : {}),
            translations: {
              upsert: {
                where: { unitTypeId_locale: { unitTypeId, locale: editingLocale } },
                update: { description },
                create: { locale: editingLocale, description },
              },
            },
          },
        });

        // Diff floor plans against what's already in the database — see
        // the file comment for why this replaced delete-then-recreate.
        const existing = await tx.floorPlan.findMany({
          where: { unitTypeId },
          select: { id: true },
        });
        const submittedIds = new Set(
          floorPlanRows.filter((row) => row.id).map((row) => row.id as string),
        );
        for (const row of existing) {
          if (!submittedIds.has(row.id as string)) {
            await tx.floorPlan.delete({ where: { id: row.id } });
          }
        }
      } else {
        const created = await tx.projectUnitType.create({
          data: {
            projectId,
            name,
            ...specData,
            descriptionEn: editingLocale === "en" ? description : null,
            descriptionTh: editingLocale === "th" ? description : null,
            translations: { create: { locale: editingLocale, description } },
          },
        });
        resolvedId = created.id;
      }

      let index = 0;
      for (const row of floorPlanRows) {
        if (row.id && unitTypeId) {
          await tx.floorPlan.update({
            where: { id: row.id },
            data: { floorName: row.floorName, imageUrl: row.imageUrl, sortOrder: index },
          });
        } else {
          await tx.floorPlan.create({
            data: {
              unitTypeId: resolvedId,
              floorName: row.floorName,
              imageUrl: row.imageUrl,
              sortOrder: index,
            },
          });
        }
        index += 1;
      }
    });
  } catch (error) {
    console.error("[saveUnitType] failed", error);
    return { ok: false, message: "SAVE_FAILED" };
  }

  revalidateUnitTypes(locale, projectId, projectSlug);
  return { ok: true, message: "SAVED" };
}

export async function deleteUnitType(
  locale: string,
  projectId: string,
  projectSlug: string,
  unitTypeId: string,
): Promise<void> {
  await requireAdminAction(Role.ADMIN);

  // Ownership-scoped delete — floor plans cascade via the FK's
  // onDelete: Cascade, same as ProjectFacility's hard delete.
  await prisma.projectUnitType.deleteMany({ where: { id: unitTypeId, projectId } });

  revalidateUnitTypes(locale, projectId, projectSlug);
}
