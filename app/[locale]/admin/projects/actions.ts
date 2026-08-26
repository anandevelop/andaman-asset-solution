"use server";

/**
 * app/[locale]/admin/projects/actions.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Project CRUD as server actions writing through Prisma. No REST layer:
 * a separate /api/projects endpoint would need its own auth check, its own
 * validation and its own error contract, all duplicating what the action
 * already does — and it would be a second, publicly reachable door onto
 * the same tables.
 *
 * Delete is soft (deletedAt) because published URLs and lead records point
 * at these rows; a hard delete would orphan both.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { locales } from "@/i18n";
import { requireAdminAction } from "@/lib/admin/guard";
import {
  projectSchema,
  projectUnitSchema,
  unitStatusPatchSchema,
  fieldErrors,
} from "@/lib/validations";

export type ProjectFormState = {
  ok: boolean;
  message?: string;
  fields?: Record<string, string>;
};

/** FormData → the plain object shape projectSchema expects. */
function readForm(formData: FormData) {
  const text = (key: string) => (formData.get(key) as string | null) ?? "";

  return {
    locale: text("locale") || "en",
    slug: text("slug"),
    name: text("name"),
    tagline: text("tagline"),
    description: text("description"),
    conceptDesign: text("conceptDesign"),
    conceptDesignImageUrl: text("conceptDesignImageUrl"),
    aboutThisProject: text("aboutThisProject"),
    aboutThisProjectImageUrl: text("aboutThisProjectImageUrl"),
    // JSON string produced by SpecialFeaturesEditor's hidden input.
    specialFeatures: text("specialFeatures"),
    location: text("location"),
    propertyType: text("propertyType"),
    status: text("status"),
    landAreaSqm: text("landAreaSqm"),
    projectArea: text("projectArea"),
    totalUnits: text("totalUnits"),
    facilities: text("facilities"),
    heroImageUrl: text("heroImageUrl"),
    heroMediaType: text("heroMediaType") || "IMAGE",
    heroVideoUrl: text("heroVideoUrl"),
    gallery: text("gallery"),
    brochureUrl: text("brochureUrl"),
    masterPlanImageUrl: text("masterPlanImageUrl"),
    latitude: text("latitude"),
    longitude: text("longitude"),
    googleMapsUrl: text("googleMapsUrl"),
    metaTitle: text("metaTitle"),
    metaDescription: text("metaDescription"),
    // An unchecked checkbox sends nothing at all.
    isPublished: formData.get("isPublished") === "on",
    sortOrder: text("sortOrder") || "0",
  };
}

/** Validated input → Prisma data for every field that is NOT translated.
 *  Decimals are passed as strings to keep full precision through
 *  Prisma.Decimal. Translated fields (name, tagline, description,
 *  conceptDesign, aboutThisProject, metaTitle, metaDescription) are
 *  handled separately in createProject/updateProject — see the locale-
 *  conditional deprecated-column writes and the translations upsert
 *  there, same pattern as AwardForm's titleEn/titleTh. */
function toPrismaData(input: ReturnType<typeof projectSchema.parse>) {
  return {
    slug: input.slug,
    conceptDesignImageUrl: input.conceptDesignImageUrl,
    aboutThisProjectImageUrl: input.aboutThisProjectImageUrl,
    // [] → null: matches the nullable Json? column and how prisma/seed.ts
    // stores "no special features" — see the field comment in schema.prisma.
    specialFeatures: input.specialFeatures.length > 0 ? input.specialFeatures : null,
    location: input.location,
    propertyType: input.propertyType,
    status: input.status,
    landAreaSqm: input.landAreaSqm === null ? null : new Prisma.Decimal(input.landAreaSqm),
    projectArea: input.projectArea,
    totalUnits: input.totalUnits === null ? null : Math.round(input.totalUnits),
    facilities: input.facilities,
    heroImageUrl: input.heroImageUrl,
    heroMediaType: input.heroMediaType,
    heroVideoUrl: input.heroVideoUrl,
    gallery: input.gallery,
    brochureUrl: input.brochureUrl,
    masterPlanImageUrl: input.masterPlanImageUrl,
    latitude: input.latitude === null ? null : new Prisma.Decimal(input.latitude),
    longitude: input.longitude === null ? null : new Prisma.Decimal(input.longitude),
    googleMapsUrl: input.googleMapsUrl,
    isPublished: input.isPublished,
    sortOrder: input.sortOrder,
  };
}

/** The seven translated fields, keyed the same way on every deprecated
 *  column pair, the ProjectTranslation row, and the form itself. */
function translatedFields(input: ReturnType<typeof projectSchema.parse>) {
  return {
    name: input.name,
    tagline: input.tagline,
    description: input.description,
    conceptDesign: input.conceptDesign,
    aboutThisProject: input.aboutThisProject,
    metaTitle: input.metaTitle,
    metaDescription: input.metaDescription,
  };
}

/** Refresh every surface that can show a project. */
function revalidateProject(locale: string, slug: string) {
  revalidatePath(`/${locale}/admin/projects`);
  revalidatePath(`/${locale}/admin`);
  for (const target of locales) {
    revalidatePath(`/${target}/projects`);
    revalidatePath(`/${target}/projects/${slug}`);
  }
}

// ── Create ──────────────────────────────────────────────────────────────

export async function createProject(
  locale: string,
  _previous: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  await requireAdminAction(Role.ADMIN);

  const parsed = projectSchema.safeParse(readForm(formData));
  if (!parsed.success) {
    return { ok: false, fields: fieldErrors(parsed.error) };
  }

  const editingLocale = parsed.data.locale;
  const { name, tagline, description, conceptDesign, aboutThisProject, metaTitle, metaDescription } =
    translatedFields(parsed.data);

  let created;
  try {
    // sandbox: as-any — conceptDesignEn/Th, aboutThisProjectEn/Th and
    // specialFeatures predate a runnable `prisma generate` here; see the
    // cast note above getProjectBySlug in lib/projects.ts.
    created = await (prisma as any).project.create({
      data: {
        ...toPrismaData(parsed.data),
        // nameEn/nameTh etc. are @deprecated but nameEn/nameTh are still
        // NOT NULL — mirrored here only for the locale actually being
        // created, same reasoning as AwardForm's titleEn/titleTh.
        nameEn: editingLocale === "en" ? name : "",
        nameTh: editingLocale === "th" ? name : "",
        taglineEn: editingLocale === "en" ? tagline : null,
        taglineTh: editingLocale === "th" ? tagline : null,
        descriptionEn: editingLocale === "en" ? description : null,
        descriptionTh: editingLocale === "th" ? description : null,
        conceptDesignEn: editingLocale === "en" ? conceptDesign : null,
        conceptDesignTh: editingLocale === "th" ? conceptDesign : null,
        aboutThisProjectEn: editingLocale === "en" ? aboutThisProject : null,
        aboutThisProjectTh: editingLocale === "th" ? aboutThisProject : null,
        metaTitleEn: editingLocale === "en" ? metaTitle : null,
        metaTitleTh: editingLocale === "th" ? metaTitle : null,
        metaDescriptionEn: editingLocale === "en" ? metaDescription : null,
        metaDescriptionTh: editingLocale === "th" ? metaDescription : null,
        translations: {
          create: {
            locale: editingLocale,
            name,
            tagline,
            description,
            conceptDesign,
            aboutThisProject,
            metaTitle,
            metaDescription,
          },
        },
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { ok: false, fields: { slug: "SLUG_TAKEN" } };
    }
    return { ok: false, message: "SAVE_FAILED" };
  }

  revalidateProject(locale, created.slug);
  redirect(`/${locale}/admin/projects/${created.id}/edit?created=1`);
}

// ── Update ──────────────────────────────────────────────────────────────

export async function updateProject(
  locale: string,
  id: string,
  _previous: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  await requireAdminAction(Role.EDITOR);

  const parsed = projectSchema.safeParse(readForm(formData));
  if (!parsed.success) {
    return { ok: false, fields: fieldErrors(parsed.error) };
  }

  const editingLocale = parsed.data.locale;
  const { name, tagline, description, conceptDesign, aboutThisProject, metaTitle, metaDescription } =
    translatedFields(parsed.data);

  try {
    // sandbox: as-any — see the create() branch above.
    const updated = await (prisma as any).project.update({
      where: { id },
      data: {
        ...toPrismaData(parsed.data),
        // Only touch the deprecated column matching the locale being
        // saved — editing zh/ru must never blank out or overwrite en/th.
        ...(editingLocale === "en"
          ? {
              nameEn: name,
              taglineEn: tagline,
              descriptionEn: description,
              conceptDesignEn: conceptDesign,
              aboutThisProjectEn: aboutThisProject,
              metaTitleEn: metaTitle,
              metaDescriptionEn: metaDescription,
            }
          : {}),
        ...(editingLocale === "th"
          ? {
              nameTh: name,
              taglineTh: tagline,
              descriptionTh: description,
              conceptDesignTh: conceptDesign,
              aboutThisProjectTh: aboutThisProject,
              metaTitleTh: metaTitle,
              metaDescriptionTh: metaDescription,
            }
          : {}),
        translations: {
          upsert: {
            where: { projectId_locale: { projectId: id, locale: editingLocale } },
            update: {
              name,
              tagline,
              description,
              conceptDesign,
              aboutThisProject,
              metaTitle,
              metaDescription,
            },
            create: {
              locale: editingLocale,
              name,
              tagline,
              description,
              conceptDesign,
              aboutThisProject,
              metaTitle,
              metaDescription,
            },
          },
        },
      },
    });
    revalidateProject(locale, updated.slug);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { ok: false, fields: { slug: "SLUG_TAKEN" } };
    }
    return { ok: false, message: "SAVE_FAILED" };
  }

  return { ok: true, message: "SAVED" };
}

// ── Bulk publish / unpublish ────────────────────────────────────────────

export type BulkResult =
  | { ok: true; updated: number }
  | { ok: false; error: string };

/**
 * Flip isPublished on several projects at once.
 *
 * Publishing is not destructive and is trivially reversible, which is why
 * this exists while bulk delete does not: a mis-click here is undone by
 * selecting the same rows and clicking the other button, whereas a bulk
 * soft-delete would need a restore UI that has not been built.
 *
 * updateMany rather than a loop: one statement, one transaction, so the
 * set either changes together or not at all.
 */
export async function bulkSetPublished(
  locale: string,
  ids: string[],
  isPublished: boolean,
): Promise<BulkResult> {
  await requireAdminAction(Role.ADMIN);

  // Cap the batch. The selection comes from the client, and an unbounded
  // id array is an easy way to hand us a very large statement.
  if (ids.length === 0) return { ok: false, error: "NOTHING_SELECTED" };
  if (ids.length > 100) return { ok: false, error: "TOO_MANY" };

  let slugs: { slug: string }[];

  try {
    // Read the slugs first: after the update we would still know them, but
    // fetching inside the same call keeps revalidation to one round trip.
    slugs = await prisma.project.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { slug: true },
    });

    const result = await prisma.project.updateMany({
      where: { id: { in: ids }, deletedAt: null },
      data: { isPublished },
    });

    for (const { slug } of slugs) revalidateProject(locale, slug);

    return { ok: true, updated: result.count };
  } catch (error) {
    console.error("[bulkSetPublished] failed", error);
    return { ok: false, error: "SAVE_FAILED" };
  }
}

// ── Soft delete ─────────────────────────────────────────────────────────

export async function deleteProject(locale: string, id: string): Promise<void> {
  await requireAdminAction(Role.ADMIN);

  const project = await prisma.project.update({
    where: { id },
    data: { deletedAt: new Date(), isPublished: false },
    select: { slug: true },
  });

  revalidateProject(locale, project.slug);
  redirect(`/${locale}/admin/projects`);
}
