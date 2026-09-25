"use server";

/**
 * app/[locale]/admin/(content)/pages/about/story/actions.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Save the CompanyProfile singleton — "About Andaman Asset Solution", read
 * by /about and reused anywhere a project page wants a company blurb. One
 * row (id: "default"), so this is an upsert against a fixed id rather than
 * a create/update pair keyed off a route param.
 *
 * Role.ADMIN, unchanged by the move out of /admin/settings/company. The
 * other tabs in this hub admit EDITOR; widening this one to match them
 * would be a decision about who may rewrite the company's own description,
 * not a consequence of the route it lives at.
 */

import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { locales } from "@/i18n";
import { requireAdminAction } from "@/lib/admin/guard";
import { companyProfileSchema, fieldErrors } from "@/lib/validations";

export type CompanyProfileFormState = {
  ok: boolean;
  message?: string;
  fields?: Record<string, string>;
};

export async function updateCompanyProfile(
  locale: string,
  _previous: CompanyProfileFormState,
  formData: FormData,
): Promise<CompanyProfileFormState> {
  await requireAdminAction(Role.ADMIN);

  const editingLocale = ((formData.get("locale") as string | null) || "en") as string;

  const parsed = companyProfileSchema.safeParse({
    locale: editingLocale,
    aboutUs: (formData.get("aboutUs") as string) ?? "",
    storyEyebrow: (formData.get("storyEyebrow") as string) ?? "",
    storyTitle: (formData.get("storyTitle") as string) ?? "",
    storyImageUrl: (formData.get("storyImageUrl") as string) ?? "",
    aboutHeroImageUrl: (formData.get("aboutHeroImageUrl") as string) ?? "",
    foundedYear: (formData.get("foundedYear") as string) ?? "",
  });

  if (!parsed.success) {
    return { ok: false, fields: fieldErrors(parsed.error) };
  }

  const {
    aboutUs,
    storyEyebrow,
    storyTitle,
    storyImageUrl,
    aboutHeroImageUrl,
    foundedYear,
  } = parsed.data;
  // storyImageUrl/aboutHeroImageUrl/foundedYear are not translated — a
  // photo and a year do not have a language — so they live on
  // CompanyProfile itself and are saved from whichever `lang` tab happens
  // to submit, same as every other untranslated field on a page a
  // LanguageTabs selector otherwise drives.
  const untranslated = { storyImageUrl, aboutHeroImageUrl, foundedYear };
  const db = prisma;

  try {
    await db.companyProfile.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        // aboutUsEn/aboutUsTh are @deprecated but aboutUsEn is still NOT
        // NULL — mirrored here only for the locale actually being
        // created, same reasoning as AwardForm's titleEn/titleTh.
        aboutUsEn: editingLocale === "en" ? aboutUs : "",
        aboutUsTh: editingLocale === "th" ? aboutUs : null,
        ...untranslated,
        translations: {
          create: { locale: editingLocale, aboutUs, storyEyebrow, storyTitle },
        },
      },
      update: {
        ...(editingLocale === "en" ? { aboutUsEn: aboutUs } : {}),
        ...(editingLocale === "th" ? { aboutUsTh: aboutUs } : {}),
        ...untranslated,
        translations: {
          upsert: {
            where: {
              companyProfileId_locale: { companyProfileId: "default", locale: editingLocale },
            },
            update: { aboutUs, storyEyebrow, storyTitle },
            create: { locale: editingLocale, aboutUs, storyEyebrow, storyTitle },
          },
        },
      },
    });
  } catch (error) {
    console.error("[updateCompanyProfile] failed", error);
    return { ok: false, message: "SAVE_FAILED" };
  }

  // The company blurb/story appear on /about and can appear on any project
  // page; the four stat figures appear on the home page's Vision & Mission
  // section — purged as a locale subtree so both surfaces pick up an edit
  // immediately rather than waiting out the page's own revalidate window.
  revalidatePath(`/${locale}/admin/pages/about/story`);
  for (const target of locales) {
    revalidatePath(`/${target}`, "layout");
  }

  return { ok: true, message: "SAVED" };
}
