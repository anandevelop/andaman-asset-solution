"use server";

/**
 * app/[locale]/admin/settings/company/actions.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Save the CompanyProfile singleton — "About Andaman Asset Solution", read
 * by /about and reused anywhere a project page wants a company blurb. One
 * row (id: "default"), so this is an upsert against a fixed id rather than
 * a create/update pair keyed off a route param.
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
  });

  if (!parsed.success) {
    return { ok: false, fields: fieldErrors(parsed.error) };
  }

  const { aboutUs } = parsed.data;
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
        translations: { create: { locale: editingLocale, aboutUs } },
      },
      update: {
        ...(editingLocale === "en" ? { aboutUsEn: aboutUs } : {}),
        ...(editingLocale === "th" ? { aboutUsTh: aboutUs } : {}),
        translations: {
          upsert: {
            where: {
              companyProfileId_locale: { companyProfileId: "default", locale: editingLocale },
            },
            update: { aboutUs },
            create: { locale: editingLocale, aboutUs },
          },
        },
      },
    });
  } catch (error) {
    console.error("[updateCompanyProfile] failed", error);
    return { ok: false, message: "SAVE_FAILED" };
  }

  // The company blurb appears on /about and can appear on any project page.
  revalidatePath(`/${locale}/admin/settings/company`);
  for (const target of locales) {
    revalidatePath(`/${target}/about`);
  }

  return { ok: true, message: "SAVED" };
}
