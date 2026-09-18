"use server";

/**
 * app/[locale]/admin/pages/home/gallery/actions.ts
 * ─────────────────────────────────────────────────────────────────────────
 * HomeGalleryPhoto CRUD, same shape as ../milestones/actions.ts — `label`
 * is a proper noun, not editorial copy, so there is no per-locale text to
 * upsert.
 *
 * Delete is hard rather than soft, same reasoning as Milestone: no public
 * URL, nothing references the row, and removal is a genuine request to
 * erase, not to hide (isActive is what hiding is for).
 */

import { revalidatePath } from "next/cache";
import { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { locales } from "@/i18n";
import { requireAdminAction } from "@/lib/admin/guard";
import { homeGalleryPhotoSchema, fieldErrors } from "@/lib/validations";

export type HomeGalleryPhotoFormState = {
  ok: boolean;
  message?: string;
  fields?: Record<string, string>;
};

function readForm(formData: FormData) {
  const text = (key: string) => (formData.get(key) as string | null) ?? "";

  return {
    imageUrl: text("imageUrl"),
    label: text("label"),
    isActive: formData.get("isActive") === "on",
    sortOrder: text("sortOrder") || "0",
  };
}

/*
  The one public reader is CompanyIntro.tsx on the home page — purged as a
  locale subtree so a new photo or reorder shows up immediately rather than
  waiting out the page's own revalidate window.
*/
function revalidateHomeGallery(locale: string) {
  revalidatePath(`/${locale}/admin/pages/home/gallery`);
  for (const target of locales) {
    revalidatePath(`/${target}`, "layout");
  }
}

export async function createHomeGalleryPhoto(
  locale: string,
  _previous: HomeGalleryPhotoFormState,
  formData: FormData,
): Promise<HomeGalleryPhotoFormState> {
  await requireAdminAction(Role.EDITOR);

  const parsed = homeGalleryPhotoSchema.safeParse(readForm(formData));
  if (!parsed.success) return { ok: false, fields: fieldErrors(parsed.error) };

  try {
    await prisma.homeGalleryPhoto.create({ data: parsed.data });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { ok: false, message: "DUPLICATE" };
    }
    console.error("[createHomeGalleryPhoto]", error);
    return { ok: false, message: "SAVE_FAILED" };
  }

  revalidateHomeGallery(locale);
  return { ok: true, message: "SAVED" };
}

export async function updateHomeGalleryPhoto(
  locale: string,
  id: string,
  _previous: HomeGalleryPhotoFormState,
  formData: FormData,
): Promise<HomeGalleryPhotoFormState> {
  await requireAdminAction(Role.EDITOR);

  const parsed = homeGalleryPhotoSchema.safeParse(readForm(formData));
  if (!parsed.success) return { ok: false, fields: fieldErrors(parsed.error) };

  try {
    await prisma.homeGalleryPhoto.update({ where: { id }, data: parsed.data });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { ok: false, message: "DUPLICATE" };
    }
    console.error("[updateHomeGalleryPhoto]", error);
    return { ok: false, message: "SAVE_FAILED" };
  }

  revalidateHomeGallery(locale);
  return { ok: true, message: "SAVED" };
}

export async function deleteHomeGalleryPhoto(locale: string, id: string): Promise<void> {
  await requireAdminAction(Role.ADMIN);

  await prisma.homeGalleryPhoto.delete({ where: { id } });

  revalidateHomeGallery(locale);
}
