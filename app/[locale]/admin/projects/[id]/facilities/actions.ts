"use server";

/**
 * app/[locale]/admin/projects/[id]/facilities/actions.ts
 * ─────────────────────────────────────────────────────────────────────────
 * ProjectFacility CRUD, same shape as ../../../awards/actions.ts — the one
 * difference is every mutation is scoped to `projectId` (via `where` on
 * update/delete, and as a required field on create), since facilities are
 * per-project rather than global.
 *
 * Delete is hard rather than soft, same reasoning as Award/SalesPerson: no
 * public URL, nothing references the row, and removal is a genuine
 * request to erase, not to hide.
 *
 * sandbox: `prisma as any` — ProjectFacility was added to schema.prisma in
 * this phase; see the cast note above getProjectBySlug in lib/projects.ts
 * for why the locally generated client doesn't type it yet.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { revalidatePath } from "next/cache";
import { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { locales } from "@/i18n";
import { requireAdminAction } from "@/lib/admin/guard";
import { projectFacilitySchema, fieldErrors } from "@/lib/validations";

export type ProjectFacilityFormState = {
  ok: boolean;
  message?: string;
  fields?: Record<string, string>;
};

function readForm(formData: FormData) {
  const text = (key: string) => (formData.get(key) as string | null) ?? "";

  return {
    locale: text("locale") || "en",
    name: text("name"),
    imageUrl: text("imageUrl"),
    isActive: formData.get("isActive") === "on",
    sortOrder: text("sortOrder") || "0",
  };
}

function revalidateFacilities(locale: string, projectId: string, projectSlug: string) {
  revalidatePath(`/${locale}/admin/projects/${projectId}/facilities`);
  for (const target of locales) {
    revalidatePath(`/${target}/projects/${projectSlug}`);
  }
}

export async function createProjectFacility(
  locale: string,
  projectId: string,
  projectSlug: string,
  _previous: ProjectFacilityFormState,
  formData: FormData,
): Promise<ProjectFacilityFormState> {
  await requireAdminAction(Role.EDITOR);

  const parsed = projectFacilitySchema.safeParse(readForm(formData));
  if (!parsed.success) return { ok: false, fields: fieldErrors(parsed.error) };

  const { locale: editingLocale, name, ...rest } = parsed.data;

  try {
    await (prisma as any).projectFacility.create({
      data: {
        ...rest,
        projectId,
        // nameEn/nameTh are @deprecated but still NOT NULL — mirrored here
        // only for the locale actually being created, same reasoning as
        // AwardForm's titleEn/titleTh (see ../../../awards/actions.ts).
        nameEn: editingLocale === "en" ? name : "",
        nameTh: editingLocale === "th" ? name : "",
        translations: { create: { locale: editingLocale, name } },
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { ok: false, message: "DUPLICATE" };
    }
    console.error("[createProjectFacility]", error);
    return { ok: false, message: "SAVE_FAILED" };
  }

  revalidateFacilities(locale, projectId, projectSlug);
  return { ok: true, message: "SAVED" };
}

export async function updateProjectFacility(
  locale: string,
  projectId: string,
  projectSlug: string,
  id: string,
  _previous: ProjectFacilityFormState,
  formData: FormData,
): Promise<ProjectFacilityFormState> {
  await requireAdminAction(Role.EDITOR);

  const parsed = projectFacilitySchema.safeParse(readForm(formData));
  if (!parsed.success) return { ok: false, fields: fieldErrors(parsed.error) };

  const { locale: editingLocale, name, ...rest } = parsed.data;

  try {
    // Ownership check first, same reasoning as updateMany's {id, projectId}
    // where used to carry: a facility id from a different project (a stale
    // bound form action, say) must never cross-write. Nested `translations`
    // upsert needs plain `update`, which only takes a unique-field where —
    // updateMany can't do nested relation writes, so the check moves here.
    const owned = await (prisma as any).projectFacility.findFirst({
      where: { id, projectId },
      select: { id: true },
    });
    if (!owned) return { ok: false, message: "SAVE_FAILED" };

    await (prisma as any).projectFacility.update({
      where: { id },
      data: {
        ...rest,
        // Only touch the deprecated column matching the locale being
        // saved — editing zh/ru must never blank out or overwrite en/th.
        ...(editingLocale === "en" ? { nameEn: name } : {}),
        ...(editingLocale === "th" ? { nameTh: name } : {}),
        translations: {
          upsert: {
            where: { facilityId_locale: { facilityId: id, locale: editingLocale } },
            update: { name },
            create: { locale: editingLocale, name },
          },
        },
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { ok: false, message: "DUPLICATE" };
    }
    console.error("[updateProjectFacility]", error);
    return { ok: false, message: "SAVE_FAILED" };
  }

  revalidateFacilities(locale, projectId, projectSlug);
  return { ok: true, message: "SAVED" };
}

export async function deleteProjectFacility(
  locale: string,
  projectId: string,
  projectSlug: string,
  id: string,
): Promise<void> {
  await requireAdminAction(Role.ADMIN);

  await (prisma as any).projectFacility.deleteMany({ where: { id, projectId } });

  revalidateFacilities(locale, projectId, projectSlug);
}
