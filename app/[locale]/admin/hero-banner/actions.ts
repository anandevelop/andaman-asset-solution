"use server";

/**
 * app/[locale]/admin/hero-banner/actions.ts
 * ─────────────────────────────────────────────────────────────────────────
 * HeroStorySlide CRUD, same shape as ../awards/actions.ts — except there is
 * no deprecated EN/TH column pair to keep in sync, since this model was
 * created after the 4-locale Translation-table pattern was already in
 * place (see the model comment in schema.prisma). Every translated field
 * (caption, ctaLabel) lives in HeroStorySlideTranslation from day one.
 *
 * Delete is hard rather than soft: no public URL points at a slide id, and
 * removal from the admin is a genuine request to take it off the homepage
 * for good, not to hide it.
 */

import { revalidatePath } from "next/cache";
import { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { locales } from "@/i18n";
import { requireAdminAction } from "@/lib/admin/guard";
import { heroStorySlideSchema, fieldErrors } from "@/lib/validations";

export type HeroStorySlideFormState = {
  ok: boolean;
  message?: string;
  fields?: Record<string, string>;
};

function readForm(formData: FormData) {
  const text = (key: string) => (formData.get(key) as string | null) ?? "";

  return {
    locale: text("locale") || "en",
    mediaType: text("mediaType") || "IMAGE",
    mediaUrl: text("mediaUrl"),
    posterImageUrl: text("posterImageUrl"),
    durationSeconds: text("durationSeconds") || "5",
    ctaUrl: text("ctaUrl"),
    caption: text("caption"),
    tagline: text("tagline"),
    ctaLabel: text("ctaLabel"),
    isActive: formData.get("isActive") === "on",
    sortOrder: text("sortOrder") || "0",
  };
}

/** Shown only on the home page. */
function revalidateHeroBanner(locale: string) {
  revalidatePath(`/${locale}/admin/hero-banner`);
  for (const target of locales) {
    revalidatePath(`/${target}`);
  }
}

export async function createHeroStorySlide(
  locale: string,
  _previous: HeroStorySlideFormState,
  formData: FormData,
): Promise<HeroStorySlideFormState> {
  await requireAdminAction(Role.EDITOR);

  const parsed = heroStorySlideSchema.safeParse(readForm(formData));
  if (!parsed.success) return { ok: false, fields: fieldErrors(parsed.error) };

  const { locale: editingLocale, caption, tagline, ctaLabel, ...rest } = parsed.data;

  try {
    await prisma.heroStorySlide.create({
      data: {
        ...rest,
        translations: { create: { locale: editingLocale, caption, tagline, ctaLabel } },
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { ok: false, message: "DUPLICATE" };
    }
    console.error("[createHeroStorySlide]", error);
    return { ok: false, message: "SAVE_FAILED" };
  }

  revalidateHeroBanner(locale);
  return { ok: true, message: "SAVED" };
}

export async function updateHeroStorySlide(
  locale: string,
  id: string,
  _previous: HeroStorySlideFormState,
  formData: FormData,
): Promise<HeroStorySlideFormState> {
  await requireAdminAction(Role.EDITOR);

  const parsed = heroStorySlideSchema.safeParse(readForm(formData));
  if (!parsed.success) return { ok: false, fields: fieldErrors(parsed.error) };

  const { locale: editingLocale, caption, tagline, ctaLabel, ...rest } = parsed.data;

  try {
    await prisma.heroStorySlide.update({
      where: { id },
      data: {
        ...rest,
        translations: {
          upsert: {
            where: { slideId_locale: { slideId: id, locale: editingLocale } },
            update: { caption, tagline, ctaLabel },
            create: { locale: editingLocale, caption, tagline, ctaLabel },
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
    console.error("[updateHeroStorySlide]", error);
    return { ok: false, message: "SAVE_FAILED" };
  }

  revalidateHeroBanner(locale);
  return { ok: true, message: "SAVED" };
}

export async function deleteHeroStorySlide(locale: string, id: string): Promise<void> {
  await requireAdminAction(Role.ADMIN);

  await prisma.heroStorySlide.delete({ where: { id } });

  revalidateHeroBanner(locale);
}
