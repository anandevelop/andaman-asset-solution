"use server";

/**
 * app/[locale]/admin/pages/about/corporate/actions.ts
 * ─────────────────────────────────────────────────────────────────────────
 * CorporateService CRUD, same shape as ../awards/actions.ts — `label` and
 * `imageAlt` are translated per locale, `imageUrl`/`isActive`/`sortOrder`
 * are not.
 *
 * Delete is hard rather than soft, same reasoning as Award: no public URL,
 * nothing references the row, and removal is a genuine request to erase,
 * not to hide.
 */

import { revalidatePath } from "next/cache";
import { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { locales } from "@/i18n";
import { requireAdminAction } from "@/lib/admin/guard";
import { corporateServiceSchema, fieldErrors } from "@/lib/validations";

export type CorporateServiceFormState = {
  ok: boolean;
  message?: string;
  fields?: Record<string, string>;
};

function readForm(formData: FormData) {
  const text = (key: string) => (formData.get(key) as string | null) ?? "";

  return {
    locale: text("locale") || "en",
    label: text("label"),
    imageAlt: text("imageAlt"),
    imageUrl: text("imageUrl"),
    isActive: formData.get("isActive") === "on",
    sortOrder: text("sortOrder") || "0",
  };
}

// Shown only on the home page — purged as a locale subtree so a new
// service or reorder shows up immediately.
function revalidateCorporate(locale: string) {
  revalidatePath(`/${locale}/admin/pages/about/corporate`);
  for (const target of locales) {
    revalidatePath(`/${target}`, "layout");
  }
}

export async function createCorporateService(
  locale: string,
  _previous: CorporateServiceFormState,
  formData: FormData,
): Promise<CorporateServiceFormState> {
  await requireAdminAction(Role.EDITOR);

  const parsed = corporateServiceSchema.safeParse(readForm(formData));
  if (!parsed.success) return { ok: false, fields: fieldErrors(parsed.error) };

  const { locale: editingLocale, label, imageAlt, ...rest } = parsed.data;

  try {
    await prisma.corporateService.create({
      data: {
        ...rest,
        translations: { create: { locale: editingLocale, label, imageAlt } },
      },
    });
  } catch (error) {
    console.error("[createCorporateService]", error);
    return { ok: false, message: "SAVE_FAILED" };
  }

  revalidateCorporate(locale);
  return { ok: true, message: "SAVED" };
}

export async function updateCorporateService(
  locale: string,
  id: string,
  _previous: CorporateServiceFormState,
  formData: FormData,
): Promise<CorporateServiceFormState> {
  await requireAdminAction(Role.EDITOR);

  const parsed = corporateServiceSchema.safeParse(readForm(formData));
  if (!parsed.success) return { ok: false, fields: fieldErrors(parsed.error) };

  const { locale: editingLocale, label, imageAlt, ...rest } = parsed.data;

  try {
    await prisma.corporateService.update({
      where: { id },
      data: {
        ...rest,
        translations: {
          upsert: {
            where: { serviceId_locale: { serviceId: id, locale: editingLocale } },
            update: { label, imageAlt },
            create: { locale: editingLocale, label, imageAlt },
          },
        },
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return { ok: false, message: "SAVE_FAILED" };
    }
    console.error("[updateCorporateService]", error);
    return { ok: false, message: "SAVE_FAILED" };
  }

  revalidateCorporate(locale);
  return { ok: true, message: "SAVED" };
}

export async function deleteCorporateService(locale: string, id: string): Promise<void> {
  await requireAdminAction(Role.ADMIN);

  await prisma.corporateService.delete({ where: { id } });

  revalidateCorporate(locale);
}
