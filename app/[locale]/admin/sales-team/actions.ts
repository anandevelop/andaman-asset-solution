"use server";

/**
 * app/[locale]/admin/sales-team/actions.ts
 * ─────────────────────────────────────────────────────────────────────────
 * SalesPerson CRUD, following the same shape as faqs/actions.ts.
 *
 * Delete is hard rather than soft: no public URL, nothing references the
 * row, and removal (someone leaving the sales team) is a genuine request
 * to erase, not to hide.
 */

import { revalidatePath } from "next/cache";
import { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { locales } from "@/i18n";
import { requireAdminAction } from "@/lib/admin/guard";
import { salesPersonSchema, fieldErrors } from "@/lib/validations";

export type SalesPersonFormState = {
  ok: boolean;
  message?: string;
  fields?: Record<string, string>;
};

function readForm(formData: FormData) {
  const text = (key: string) => (formData.get(key) as string | null) ?? "";

  return {
    locale: text("locale") || "en",
    name: text("name"),
    position: text("position"),
    whatsappNumber: text("whatsappNumber"),
    phoneNumber: text("phoneNumber"),
    email: text("email"),
    photoUrl: text("photoUrl"),
    isActive: formData.get("isActive") === "on",
    sortOrder: text("sortOrder") || "0",
  };
}

/*
  The team block lives in the site layout, so it is on every public page.

  It used to be on /about and /contact only, and this function still purged
  exactly those two long after app/[locale]/(site)/layout.tsx moved
  <SalesTeamSection /> into the shared layout. Everything else — the home
  page, /projects, /news, /events, /achievements, every project detail page
  — kept the old roster until its own revalidate window expired, up to an
  hour later. An editor removing someone who has left the company would
  have watched them stay on the site.

  Purging the locale subtree with type "layout" rather than listing pages
  is deliberate: the list is what went stale last time. A component in a
  layout has no page list to enumerate, and edits here happen a few times a
  year, so the cost of the wider purge is nothing next to being wrong again
  the next time a section moves.
*/
function revalidateSalesTeam(locale: string) {
  revalidatePath(`/${locale}/admin/sales-team`);
  for (const target of locales) {
    revalidatePath(`/${target}`, "layout");
  }
}

export async function createSalesPerson(
  locale: string,
  _previous: SalesPersonFormState,
  formData: FormData,
): Promise<SalesPersonFormState> {
  await requireAdminAction(Role.EDITOR);

  const parsed = salesPersonSchema.safeParse(readForm(formData));
  if (!parsed.success) return { ok: false, fields: fieldErrors(parsed.error) };

  const { locale: editingLocale, name, position, ...rest } = parsed.data;

  try {
    await prisma.salesPerson.create({
      data: {
        ...rest,
        // nameEn/nameTh/positionEn/positionTh are @deprecated but still
        // NOT NULL — mirrored here only for the locale actually being
        // created, same reasoning as AwardForm's titleEn/titleTh.
        nameEn: editingLocale === "en" ? name : "",
        nameTh: editingLocale === "th" ? name : "",
        positionEn: editingLocale === "en" ? position : "",
        positionTh: editingLocale === "th" ? position : "",
        translations: { create: { locale: editingLocale, name, position } },
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { ok: false, message: "NUMBER_TAKEN" };
    }
    console.error("[createSalesPerson]", error);
    return { ok: false, message: "SAVE_FAILED" };
  }

  revalidateSalesTeam(locale);
  return { ok: true, message: "SAVED" };
}

export async function updateSalesPerson(
  locale: string,
  id: string,
  _previous: SalesPersonFormState,
  formData: FormData,
): Promise<SalesPersonFormState> {
  await requireAdminAction(Role.EDITOR);

  const parsed = salesPersonSchema.safeParse(readForm(formData));
  if (!parsed.success) return { ok: false, fields: fieldErrors(parsed.error) };

  const { locale: editingLocale, name, position, ...rest } = parsed.data;

  try {
    await prisma.salesPerson.update({
      where: { id },
      data: {
        ...rest,
        ...(editingLocale === "en" ? { nameEn: name, positionEn: position } : {}),
        ...(editingLocale === "th" ? { nameTh: name, positionTh: position } : {}),
        translations: {
          upsert: {
            where: { salesPersonId_locale: { salesPersonId: id, locale: editingLocale } },
            update: { name, position },
            create: { locale: editingLocale, name, position },
          },
        },
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { ok: false, message: "NUMBER_TAKEN" };
    }
    console.error("[updateSalesPerson]", error);
    return { ok: false, message: "SAVE_FAILED" };
  }

  revalidateSalesTeam(locale);
  return { ok: true, message: "SAVED" };
}

export async function deleteSalesPerson(locale: string, id: string): Promise<void> {
  await requireAdminAction(Role.ADMIN);

  await prisma.salesPerson.delete({ where: { id } });

  revalidateSalesTeam(locale);
}
