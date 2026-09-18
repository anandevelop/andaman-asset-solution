"use server";

/**
 * app/[locale]/admin/e-brochures/actions.ts
 * ─────────────────────────────────────────────────────────────────────────
 * EBrochure CRUD, same shape as the news actions.
 *
 * Simpler than those in one respect: EBrochure was created after the
 * four-locale migration, so there is no deprecated En/Th column pair to
 * mirror alongside the Translation row. Everything translatable lives in
 * EBrochureTranslation and nowhere else.
 *
 * Deleted for real, not soft-deleted. Project and NewsArticle carry
 * deletedAt because a published URL that vanishes is an SEO problem worth
 * being able to undo; a brochure is a file and a title, it is re-creatable
 * in a minute, and a deletedAt column nothing filters on is a trap for
 * whoever writes the next query.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { locales } from "@/i18n";
import { requireAdminAction } from "@/lib/admin/guard";
import { resolveIsPublished } from "@/lib/publishing-gate";
import { eBrochureSchema, fieldErrors } from "@/lib/validations";

export type EBrochureFormState = {
  ok: boolean;
  message?: string;
  fields?: Record<string, string>;
};

function readForm(formData: FormData) {
  const text = (key: string) => (formData.get(key) as string | null) ?? "";

  return {
    locale: text("locale") || "en",
    slug: text("slug"),
    title: text("title"),
    description: text("description"),
    fileUrl: text("fileUrl"),
    coverImageUrl: text("coverImageUrl"),
    projectId: text("projectId"),
    isPublished: formData.get("isPublished") === "on",
    sortOrder: text("sortOrder") || "0",
  };
}

/**
 * Refresh the two routes a brochure can appear on.
 *
 * Deliberately narrower than revalidateAwards' whole-layout purge: an
 * award is rendered on the home page, /about and /achievements, so it has
 * to invalidate a subtree. A brochure appears on its own detail page and
 * the index, and nowhere else. Purging every locale's layout to publish
 * one PDF would throw away the whole site's render cache for nothing.
 */
function revalidateBrochure(locale: string, slug: string) {
  revalidatePath(`/${locale}/admin/e-brochures`);

  for (const target of locales) {
    revalidatePath(`/${target}/e-brochure`);
    revalidatePath(`/${target}/e-brochure/${slug}`);
  }
}

// ── Create ──────────────────────────────────────────────────────────────

export async function createBrochure(
  locale: string,
  _previous: EBrochureFormState,
  formData: FormData,
): Promise<EBrochureFormState> {
  await requireAdminAction(Role.EDITOR);

  const parsed = eBrochureSchema.safeParse(readForm(formData));
  if (!parsed.success) return { ok: false, fields: fieldErrors(parsed.error) };

  const { locale: editingLocale, title, description, ...rest } = parsed.data;

  let created;
  try {
    created = await prisma.eBrochure.create({
      data: {
        ...rest,
        translations: { create: { locale: editingLocale, title, description } },
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, fields: { slug: "SLUG_TAKEN" } };
    }
    console.error("[createBrochure]", error);
    return { ok: false, message: "SAVE_FAILED" };
  }

  revalidateBrochure(locale, created.slug);
  // Outside the try: a Next redirect throws, and catching it here would
  // report a successful save as SAVE_FAILED.
  redirect(`/${locale}/admin/e-brochures/${created.id}/edit?created=1`);
}

// ── Update ──────────────────────────────────────────────────────────────

export async function updateBrochure(
  locale: string,
  id: string,
  _previous: EBrochureFormState,
  formData: FormData,
): Promise<EBrochureFormState> {
  await requireAdminAction(Role.EDITOR);

  const parsed = eBrochureSchema.safeParse(readForm(formData));
  if (!parsed.success) return { ok: false, fields: fieldErrors(parsed.error) };

  const { locale: editingLocale, title, description, ...rest } = parsed.data;

  try {
    // The original slug still needs revalidating when it changes, or the
    // old URL keeps serving a stale page until its window expires. Also
    // carries what the publish gate needs — see lib/publishing-gate.ts.
    const before = await prisma.eBrochure.findUnique({
      where: { id },
      select: { slug: true, contentStatus: true, isPublished: true },
    });
    if (!before) return { ok: false, message: "SAVE_FAILED" };
    const resolvedIsPublished = resolveIsPublished({
      contentStatus: before.contentStatus,
      requestedIsPublished: rest.isPublished,
      currentIsPublished: before.isPublished,
    });

    const updated = await prisma.eBrochure.update({
      where: { id },
      data: {
        ...rest,
        isPublished: resolvedIsPublished,
        translations: {
          upsert: {
            where: { brochureId_locale: { brochureId: id, locale: editingLocale } },
            update: { title, description },
            create: { locale: editingLocale, title, description },
          },
        },
      },
    });

    if (before && before.slug !== updated.slug) revalidateBrochure(locale, before.slug);
    revalidateBrochure(locale, updated.slug);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, fields: { slug: "SLUG_TAKEN" } };
    }
    console.error("[updateBrochure]", error);
    return { ok: false, message: "SAVE_FAILED" };
  }

  return { ok: true, message: "SAVED" };
}

// ── Delete ──────────────────────────────────────────────────────────────

export async function deleteBrochure(locale: string, id: string): Promise<void> {
  // ADMIN, not EDITOR — the same split every other delete in the admin
  // uses. Note this removes the record, not the PDF: the object stays in
  // the bucket, as it does everywhere else in this app (see the lifecycle
  // rule in docs/LAUNCH_CHECKLIST.md).
  await requireAdminAction(Role.ADMIN);

  const brochure = await prisma.eBrochure.delete({
    where: { id },
    select: { slug: true },
  });

  revalidateBrochure(locale, brochure.slug);
  redirect(`/${locale}/admin/e-brochures`);
}
