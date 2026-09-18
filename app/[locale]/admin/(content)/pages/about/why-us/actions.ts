"use server";

/**
 * app/[locale]/admin/pages/about/why-us/actions.ts
 * ─────────────────────────────────────────────────────────────────────────
 * WhyUsPoint CRUD, same shape as ../awards/actions.ts — `title`/`body` are
 * translated per locale, `icon`/`isActive`/`sortOrder` are not.
 *
 * Delete is hard rather than soft, same reasoning as Award: no public URL,
 * nothing references the row, and removal is a genuine request to erase,
 * not to hide.
 */

import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { locales } from "@/i18n";
import { requireAdminAction } from "@/lib/admin/guard";
import { whyUsPointSchema, fieldErrors } from "@/lib/validations";

export type WhyUsPointFormState = {
  ok: boolean;
  message?: string;
  fields?: Record<string, string>;
};

function readForm(formData: FormData) {
  const text = (key: string) => (formData.get(key) as string | null) ?? "";

  return {
    locale: text("locale") || "en",
    icon: text("icon"),
    title: text("title"),
    body: text("body"),
    isActive: formData.get("isActive") === "on",
    sortOrder: text("sortOrder") || "0",
  };
}

// Shown only on the home page — purged as a locale subtree so a new point
// or reorder shows up immediately.
function revalidateWhyUs(locale: string) {
  revalidatePath(`/${locale}/admin/pages/about/why-us`);
  for (const target of locales) {
    revalidatePath(`/${target}`, "layout");
  }
}

export async function createWhyUsPoint(
  locale: string,
  _previous: WhyUsPointFormState,
  formData: FormData,
): Promise<WhyUsPointFormState> {
  await requireAdminAction(Role.EDITOR);

  const parsed = whyUsPointSchema.safeParse(readForm(formData));
  if (!parsed.success) return { ok: false, fields: fieldErrors(parsed.error) };

  const { locale: editingLocale, title, body, ...rest } = parsed.data;

  try {
    await prisma.whyUsPoint.create({
      data: {
        ...rest,
        translations: { create: { locale: editingLocale, title, body } },
      },
    });
  } catch (error) {
    console.error("[createWhyUsPoint]", error);
    return { ok: false, message: "SAVE_FAILED" };
  }

  revalidateWhyUs(locale);
  return { ok: true, message: "SAVED" };
}

export async function updateWhyUsPoint(
  locale: string,
  id: string,
  _previous: WhyUsPointFormState,
  formData: FormData,
): Promise<WhyUsPointFormState> {
  await requireAdminAction(Role.EDITOR);

  const parsed = whyUsPointSchema.safeParse(readForm(formData));
  if (!parsed.success) return { ok: false, fields: fieldErrors(parsed.error) };

  const { locale: editingLocale, title, body, ...rest } = parsed.data;

  try {
    await prisma.whyUsPoint.update({
      where: { id },
      data: {
        ...rest,
        translations: {
          upsert: {
            where: { pointId_locale: { pointId: id, locale: editingLocale } },
            update: { title, body },
            create: { locale: editingLocale, title, body },
          },
        },
      },
    });
  } catch (error) {
    console.error("[updateWhyUsPoint]", error);
    return { ok: false, message: "SAVE_FAILED" };
  }

  revalidateWhyUs(locale);
  return { ok: true, message: "SAVED" };
}

export async function deleteWhyUsPoint(locale: string, id: string): Promise<void> {
  await requireAdminAction(Role.ADMIN);

  await prisma.whyUsPoint.delete({ where: { id } });

  revalidateWhyUs(locale);
}
