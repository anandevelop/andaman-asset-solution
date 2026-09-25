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
import { resolveIsPublished } from "@/lib/publishing-gate";
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
    virtualTourUrl: text("virtualTourUrl"),
    metaTitle: text("metaTitle"),
    metaDescription: text("metaDescription"),
    // An unchecked checkbox sends nothing at all.
    noIndex: formData.get("noIndex") === "on",
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
    /*
      [] → SQL NULL: matches the nullable Json? column and how prisma/seed.ts
      stores "no special features" — see the field comment in schema.prisma.

      Prisma.DbNull rather than a bare null. For a Json? column the two
      possible nulls are different values — SQL NULL and the JSON literal
      `null` — so Prisma refuses to guess and asks which one is meant. It
      accepts a bare null at runtime and stores SQL NULL, which is why this
      never misbehaved; the `prisma as any` on this call was simply hiding
      the question. DbNull is the same result, stated rather than inferred.
    */
    specialFeatures:
      input.specialFeatures.length > 0 ? input.specialFeatures : Prisma.DbNull,
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
    virtualTourUrl: input.virtualTourUrl,
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
    noIndex: input.noIndex,
  };
}

/** Refresh every surface that can show a project. */
function revalidateProject(locale: string, slug: string) {
  revalidatePath(`/${locale}/admin/projects`);
  revalidatePath(`/${locale}/admin`);
  for (const target of locales) {
    // The home page's featured grid and its hero fallback image both come
    // from getPublishedProjects, so unpublishing a project has to reach it
    // — otherwise the one thing a visitor can no longer open is the one
    // still being advertised on the front page.
    revalidatePath(`/${target}`);
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
  const { name, tagline, description, conceptDesign, aboutThisProject, metaTitle, metaDescription, noIndex } =
    translatedFields(parsed.data);

  let created;
  try {
    created = await prisma.project.create({
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
            noIndex,
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
  const { name, tagline, description, conceptDesign, aboutThisProject, metaTitle, metaDescription, noIndex } =
    translatedFields(parsed.data);

  /*
    Whether this submission is from a form that owns the SEO fields.

    The Overview form does not: meta title, meta description and noIndex
    are the SEO tab's, and ProjectForm used to carry them as hidden inputs
    holding whatever they were when the page rendered. Saving Overview then
    wrote that snapshot back, so an Overview save made from a page opened
    before an SEO edit silently reverted it.

    `formData.has`, not "is the value empty": a form that does own these
    fields must still be able to clear one, and an empty box on the SEO tab
    is a real edit. Absent and empty are different answers.
  */
  const seoSubmitted =
    formData.has("metaTitle") || formData.has("metaDescription") || formData.has("noIndex");

  // See lib/publishing-gate.ts: isPublished can only become true while
  // contentStatus is PUBLISHED — every other edited field still saves
  // either way.
  const gateRow = await prisma.project.findUnique({
    where: { id },
    select: { contentStatus: true, isPublished: true },
  });
  if (!gateRow) return { ok: false, message: "SAVE_FAILED" };
  const resolvedIsPublished = resolveIsPublished({
    contentStatus: gateRow.contentStatus,
    requestedIsPublished: parsed.data.isPublished,
    currentIsPublished: gateRow.isPublished,
  });

  try {
    const updated = await prisma.project.update({
      where: { id },
      data: {
        ...toPrismaData(parsed.data),
        isPublished: resolvedIsPublished,
        // Only touch the deprecated column matching the locale being
        // saved — editing zh/ru must never blank out or overwrite en/th.
        ...(editingLocale === "en"
          ? {
              nameEn: name,
              taglineEn: tagline,
              descriptionEn: description,
              conceptDesignEn: conceptDesign,
              aboutThisProjectEn: aboutThisProject,
              ...(seoSubmitted
                ? { metaTitleEn: metaTitle, metaDescriptionEn: metaDescription }
                : {}),
            }
          : {}),
        ...(editingLocale === "th"
          ? {
              nameTh: name,
              taglineTh: tagline,
              descriptionTh: description,
              conceptDesignTh: conceptDesign,
              aboutThisProjectTh: aboutThisProject,
              ...(seoSubmitted
                ? { metaTitleTh: metaTitle, metaDescriptionTh: metaDescription }
                : {}),
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
              ...(seoSubmitted ? { metaTitle, metaDescription, noIndex } : {}),
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
              noIndex,
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
      where: {
        id: { in: ids },
        deletedAt: null,
        // See lib/publishing-gate.ts — publishing (not unpublishing) only
        // takes on rows already through review. `result.count` below then
        // honestly reports how many of the selection actually changed,
        // rather than the size of the selection itself.
        ...(isPublished ? { contentStatus: "PUBLISHED" as const } : {}),
      },
      data: { isPublished },
    });

    for (const { slug } of slugs) revalidateProject(locale, slug);

    return { ok: true, updated: result.count };
  } catch (error) {
    console.error("[bulkSetPublished] failed", error);
    return { ok: false, error: "SAVE_FAILED" };
  }
}

// ── Display order ───────────────────────────────────────────────────────

/**
 * Rewrite `sortOrder` for a run of projects the admin has just dragged
 * into a new order (Projects.dc.html's "จัดลำดับการแสดงผล").
 *
 * `ids` is the full, contiguous list in its new order and `startIndex` is
 * where that run begins in the overall list, so page 2 of a 25-row page
 * writes 25…49 rather than starting over at 0 and colliding with page 1.
 * The caller is responsible for only offering this on an unfiltered list
 * in custom order — see ProjectsTable's own guard for why a reordering of
 * a *filtered* view cannot be written back coherently: the rows on screen
 * are not adjacent in the real order, so the positions between them belong
 * to projects the admin cannot see.
 *
 * One transaction: a half-applied reorder would leave duplicate sortOrder
 * values, and the list's own tie-break (updatedAt) would then silently
 * decide the order instead of the person who just dragged the rows.
 */
export async function reorderProjects(
  locale: string,
  ids: string[],
  startIndex: number,
): Promise<BulkResult> {
  await requireAdminAction(Role.ADMIN);

  if (ids.length === 0) return { ok: false, error: "NOTHING_SELECTED" };
  if (ids.length > 100) return { ok: false, error: "TOO_MANY" };
  if (!Number.isInteger(startIndex) || startIndex < 0) return { ok: false, error: "INVALID_INPUT" };
  // A repeated id would write two positions to one row and leave a gap.
  if (new Set(ids).size !== ids.length) return { ok: false, error: "INVALID_INPUT" };

  try {
    const projects = await prisma.project.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true, slug: true },
    });

    // Every id must name a live project: a stale page whose rows have since
    // been deleted would otherwise write an order derived from rows that
    // no longer exist.
    if (projects.length !== ids.length) return { ok: false, error: "STALE" };

    await prisma.$transaction(
      ids.map((id, index) =>
        prisma.project.update({ where: { id }, data: { sortOrder: startIndex + index } }),
      ),
    );

    for (const { slug } of projects) revalidateProject(locale, slug);

    return { ok: true, updated: ids.length };
  } catch (error) {
    console.error("[reorderProjects] failed", error);
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
