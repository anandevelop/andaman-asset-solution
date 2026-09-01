"use server";

/**
 * app/[locale]/admin/awards/actions.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Award CRUD, same shape as ../sales-team/actions.ts.
 *
 * Delete is hard rather than soft, same reasoning as SalesPerson: no
 * public URL, nothing references the row, and removal is a genuine
 * request to erase, not to hide.
 *
 * sandbox: `prisma as any` — Award was added to schema.prisma in this
 * phase; see the cast note above getProjectBySlug in lib/projects.ts for
 * why the locally generated client doesn't type it yet.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { revalidatePath } from "next/cache";
import { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { locales } from "@/i18n";
import { requireAdminAction } from "@/lib/admin/guard";
import { awardSchema, fieldErrors } from "@/lib/validations";

export type AwardFormState = {
  ok: boolean;
  message?: string;
  fields?: Record<string, string>;
};

function readForm(formData: FormData) {
  const text = (key: string) => (formData.get(key) as string | null) ?? "";

  return {
    locale: text("locale") || "en",
    title: text("title"),
    organization: text("organization"),
    projectName: text("projectName"),
    year: text("year") || "0",
    trophyImageUrl: text("trophyImageUrl"),
    isActive: formData.get("isActive") === "on",
    sortOrder: text("sortOrder") || "0",
  };
}

/*
  Awards are on four public surfaces, not one.

  This said "Shown only on the home page" and purged the home page alone.
  In fact <AwardsSection /> fetches its own data and renders on both the
  home page and /achievements, and getAwards() is called directly by
  /achievements, /about and every project detail page (for the mini-stat
  count). Three of those four kept stale awards for up to an hour.

  Purged as a locale subtree for the same reason as the sales team: the
  enumerated list is precisely what fell out of date, project detail pages
  cannot be listed without walking every slug, and an award is added a few
  times a year.
*/
function revalidateAwards(locale: string) {
  revalidatePath(`/${locale}/admin/awards`);
  for (const target of locales) {
    revalidatePath(`/${target}`, "layout");
  }
}

export async function createAward(
  locale: string,
  _previous: AwardFormState,
  formData: FormData,
): Promise<AwardFormState> {
  await requireAdminAction(Role.EDITOR);

  const parsed = awardSchema.safeParse(readForm(formData));
  if (!parsed.success) return { ok: false, fields: fieldErrors(parsed.error) };

  const { locale: editingLocale, title, ...rest } = parsed.data;

  try {
    await (prisma as any).award.create({
      data: {
        ...rest,
        // titleEn/titleTh are @deprecated but still NOT NULL (see
        // schema.prisma) — mirrored here only when the locale being
        // created actually is en/th, so the fallback every public reader
        // still checks (lib/awards.ts's pickLocale() branch) shows real
        // copy rather than nothing. A brand-new award created directly in
        // zh/ru gets "" in both deprecated columns until an admin also
        // fills in the en or th tab — a known gap, not a silent bug: the
        // completeness badges make that gap visible on this same page.
        titleEn: editingLocale === "en" ? title : "",
        titleTh: editingLocale === "th" ? title : "",
        translations: { create: { locale: editingLocale, title } },
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { ok: false, message: "DUPLICATE" };
    }
    console.error("[createAward]", error);
    return { ok: false, message: "SAVE_FAILED" };
  }

  revalidateAwards(locale);
  return { ok: true, message: "SAVED" };
}

export async function updateAward(
  locale: string,
  id: string,
  _previous: AwardFormState,
  formData: FormData,
): Promise<AwardFormState> {
  await requireAdminAction(Role.EDITOR);

  const parsed = awardSchema.safeParse(readForm(formData));
  if (!parsed.success) return { ok: false, fields: fieldErrors(parsed.error) };

  const { locale: editingLocale, title, ...rest } = parsed.data;

  try {
    await (prisma as any).award.update({
      where: { id },
      data: {
        ...rest,
        // Only touch the deprecated column that matches the locale being
        // saved — editing zh/ru must never blank out (or overwrite with
        // the wrong language's text) whatever en/th already has.
        ...(editingLocale === "en" ? { titleEn: title } : {}),
        ...(editingLocale === "th" ? { titleTh: title } : {}),
        translations: {
          upsert: {
            where: { awardId_locale: { awardId: id, locale: editingLocale } },
            update: { title },
            create: { locale: editingLocale, title },
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
    console.error("[updateAward]", error);
    return { ok: false, message: "SAVE_FAILED" };
  }

  revalidateAwards(locale);
  return { ok: true, message: "SAVED" };
}

export async function deleteAward(locale: string, id: string): Promise<void> {
  await requireAdminAction(Role.ADMIN);

  await (prisma as any).award.delete({ where: { id } });

  revalidateAwards(locale);
}
