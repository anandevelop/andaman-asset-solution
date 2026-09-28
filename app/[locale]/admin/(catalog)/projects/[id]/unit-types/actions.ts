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
import { unitTypeFloorsSchema, type UnitTypeFloorsInput } from "@/lib/validations";
import { deriveBlueprint } from "@/lib/floor-plan-images";

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

  /*
    The unit-types workspace owns this type's floors wherever it is on the
    page, and says so with a hidden field. Without that signal this form
    submits no floor rows and the reconcile below reads an empty list as
    "delete every floor" — so saving a spec change would drop the floors the
    workspace had just saved.
  */
  const managesFloorPlans = formData.get("floorPlansManaged") !== "no";

  const { rows: floorPlanRows, fields: floorPlanErrors } = managesFloorPlans
    ? readFloorPlanRows(formData)
    : { rows: [], fields: undefined };
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
        // Skipped entirely when another editor owns the floors — see
        // managesFloorPlans above.
        const existing = managesFloorPlans
          ? await tx.floorPlan.findMany({
              where: { unitTypeId },
              select: { id: true },
            })
          : [];
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

/**
 * Replace one unit type's floors, pins and room names with the workspace's
 * draft.
 *
 * DIFFED BY ID, NEVER WIPED AND RECREATED
 *
 * The obvious implementation — delete every floor, insert the draft — is
 * wrong here for the same reason saveUnitType's own floor-plan diff above
 * says it is: new rows mint new ids. A room's id is what the public page
 * keys its labels on and what a photo is attached to, so a re-save that
 * changed every id would invalidate anything holding one, and the audit
 * trail would show the whole type deleted and recreated on every edit of a
 * single room name. Rows with an id are updated in place, rows without one
 * are created, and whatever is no longer in the draft is deleted.
 *
 * (prisma/seed.ts does replace wholesale, and says why in its own comment:
 * it is loading a corrected drawing from scratch, not editing one.)
 *
 * Blueprints are derived before the transaction opens, and only for a floor
 * whose drawing actually changed. It is a download, a decode and an upload
 * — not something to hold a database transaction open across, and not
 * something to repeat for a floor whose label was corrected.
 */
export async function saveUnitTypeFloors(
  locale: string,
  projectId: string,
  projectSlug: string,
  unitTypeId: string,
  payload: UnitTypeFloorsInput,
): Promise<UnitTypeFormState> {
  await requireAdminAction(Role.EDITOR);

  const parsed = unitTypeFloorsSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, fields: fieldErrors(parsed.error) };

  // The type has to belong to the project in the URL. Re-read rather than
  // trusted from the client, which is the whole point of doing it here as
  // well as in the page's own guard.
  const owner = await prisma.projectUnitType.findFirst({
    where: { id: unitTypeId, projectId },
    select: { id: true },
  });
  if (!owner) return { ok: false, message: "NOT_FOUND" };

  const existing = await prisma.floorPlan.findMany({
    where: { unitTypeId },
    select: { id: true, imageUrl: true },
  });
  const previousImage = new Map(existing.map((row) => [row.id, row.imageUrl]));

  /*
    Derive a blueprint for every floor whose drawing is new to it — a fresh
    floor, or one whose imageUrl changed. deriveBlueprint never throws at
    us: a floor that could not be derived keeps its dimensions and falls
    back to the line drawing on the public page.
  */
  const derived = new Map<number, { blueprintUrl: string | null; width: number; height: number }>();

  await Promise.all(
    parsed.data.floors.map(async (floor, index) => {
      const unchanged = floor.id && previousImage.get(floor.id) === floor.imageUrl;
      if (unchanged) return;

      try {
        derived.set(index, await deriveBlueprint(floor.imageUrl));
      } catch (error) {
        console.error("[saveUnitTypeFloors] blueprint failed", floor.imageUrl, error);
      }
    }),
  );

  try {
    await prisma.$transaction(async (tx) => {
      const keptFloorIds: string[] = [];

      for (const [index, floor] of parsed.data.floors.entries()) {
        const blueprint = derived.get(index);

        const data = {
          floorName: floor.floorName,
          shortLabel: floor.shortLabel,
          areaSqm: floor.areaSqm === null ? null : floor.areaSqm.toFixed(2),
          imageUrl: floor.imageUrl,
          furnishedImageUrl: floor.furnishedImageUrl ?? null,
          portraitRotation: floor.portraitRotation,
          sortOrder: index,
          // Left alone when nothing was derived this time round, so a
          // floor whose label changed keeps the blueprint it already had.
          ...(blueprint
            ? {
                blueprintImageUrl: blueprint.blueprintUrl,
                imageWidth: blueprint.width,
                imageHeight: blueprint.height,
              }
            : {}),
        };

        const saved = floor.id
          ? await tx.floorPlan.update({ where: { id: floor.id }, data })
          : await tx.floorPlan.create({ data: { ...data, unitTypeId } });

        keptFloorIds.push(saved.id);

        const keptRoomIds: string[] = [];

        for (const [roomIndex, room] of floor.rooms.entries()) {
          const roomData = {
            xPercent: room.xPercent,
            yPercent: room.yPercent,
            areaSqm: room.areaSqm === null ? null : room.areaSqm.toFixed(2),
            photoUrl: room.photoUrl ?? null,
            sortOrder: roomIndex,
          };

          const savedRoom = room.id
            ? await tx.floorPlanRoom.update({ where: { id: room.id }, data: roomData })
            : await tx.floorPlanRoom.create({ data: { ...roomData, floorPlanId: saved.id } });

          keptRoomIds.push(savedRoom.id);

          for (const target of locales) {
            const name = (room.names[target] ?? "").trim();

            if (name === "") {
              // An emptied field removes that language's row rather than
              // storing "", so getTranslation falls through to a language
              // that has one instead of rendering a blank label.
              await tx.floorPlanRoomTranslation.deleteMany({
                where: { roomId: savedRoom.id, locale: target },
              });
              continue;
            }

            await tx.floorPlanRoomTranslation.upsert({
              where: { roomId_locale: { roomId: savedRoom.id, locale: target } },
              update: { name },
              create: { roomId: savedRoom.id, locale: target, name },
            });
          }
        }

        await tx.floorPlanRoom.deleteMany({
          where: { floorPlanId: saved.id, id: { notIn: keptRoomIds } },
        });
      }

      await tx.floorPlan.deleteMany({
        where: { unitTypeId, id: { notIn: keptFloorIds } },
      });
    });
  } catch (error) {
    console.error("[saveUnitTypeFloors] failed", error);
    return { ok: false, message: "SAVE_FAILED" };
  }

  revalidateUnitTypes(locale, projectId, projectSlug);
  return { ok: true, message: "SAVED" };
}

/**
 * Persist the order the admin dragged the type list into.
 *
 * Its own action rather than part of saveUnitTypeFloors: the order is a
 * property of the project's list, not of any one type's floors, and folding
 * it into that save would mean dragging two types and then saving one of
 * them wrote an order derived from a stale list.
 *
 * Ids are filtered against the project before anything is written, so a
 * tampered list cannot reorder — or touch — another project's types.
 */
export async function reorderUnitTypes(
  locale: string,
  projectId: string,
  projectSlug: string,
  orderedIds: string[],
): Promise<UnitTypeFormState> {
  await requireAdminAction(Role.EDITOR);

  const owned = await prisma.projectUnitType.findMany({
    where: { projectId, id: { in: orderedIds } },
    select: { id: true },
  });
  const ownedIds = new Set(owned.map((row) => row.id));
  const ordered = orderedIds.filter((id) => ownedIds.has(id));

  if (ordered.length === 0) return { ok: false, message: "NOT_FOUND" };

  try {
    await prisma.$transaction(
      ordered.map((id, index) =>
        prisma.projectUnitType.update({ where: { id }, data: { sortOrder: index } }),
      ),
    );
  } catch (error) {
    console.error("[reorderUnitTypes] failed", error);
    return { ok: false, message: "SAVE_FAILED" };
  }

  revalidateUnitTypes(locale, projectId, projectSlug);
  return { ok: true, message: "SAVED" };
}
