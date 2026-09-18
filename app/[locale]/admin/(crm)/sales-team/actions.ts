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
import { z } from "zod";
import { saveRoutingRules } from "@/lib/lead-routing";
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

const routingRulesSchema = z.object({
  enabled: z.boolean(),
  // partialRecord: a rule that names a person for Thai and nobody for
  // Russian is the normal case. See the note in lib/validations.ts — an
  // enum-keyed z.record became exhaustive in zod 4.
  byLanguage: z.partialRecord(z.enum(locales), z.string().max(40)),
  // A cap of zero would route nothing while looking switched on.
  perPersonCap: z.number().int().min(1).max(500),
  escalateAfterHours: z.number().min(0.5).max(72),
  teamLeadUserId: z.string().max(40),
});

// ── Automatic lead distribution ─────────────────────────────────────────

/**
 * Save the routing rules shown beside the team (SalesTeam.dc.html).
 *
 * ADMIN and above, not EDITOR: these rules decide who gets paid for which
 * enquiry, which is a different kind of decision from editing a bio.
 */
export async function updateLeadRouting(
  locale: string,
  input: {
    enabled: boolean;
    byLanguage: Record<string, string>;
    perPersonCap: number;
    escalateAfterHours: number;
    teamLeadUserId: string | null;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireAdminAction(Role.ADMIN);

  const parsed = routingRulesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID_INPUT" };

  try {
    await saveRoutingRules(
      {
        enabled: parsed.data.enabled,
        // Blank means "no preference for this language" rather than a rule
        // pointing at an empty id.
        byLanguage: Object.fromEntries(
          Object.entries(parsed.data.byLanguage).filter(([, userId]) => userId.length > 0),
        ),
        perPersonCap: parsed.data.perPersonCap,
        escalateAfterHours: parsed.data.escalateAfterHours,
        teamLeadUserId: parsed.data.teamLeadUserId || null,
      },
      session.id,
    );
  } catch (error) {
    console.error("[updateLeadRouting]", error);
    return { ok: false, error: "SAVE_FAILED" };
  }

  revalidatePath(`/${locale}/admin/sales-team`);
  revalidatePath(`/${locale}/admin/leads`);

  return { ok: true };
}

/**
 * The "show on the website" switch on each team card.
 *
 * Its own action rather than a trip through updateSalesPerson: that one
 * takes the whole profile as FormData and revalidates accordingly, which
 * is far more than a single boolean needs, and would make an accidental
 * half-filled form overwrite a bio.
 */
export async function setSalesPersonVisible(
  locale: string,
  id: string,
  isActive: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdminAction(Role.EDITOR);

  try {
    const result = await prisma.salesPerson.updateMany({ where: { id }, data: { isActive } });
    if (result.count === 0) return { ok: false, error: "NOT_FOUND" };
  } catch (error) {
    console.error("[setSalesPersonVisible]", error);
    return { ok: false, error: "SAVE_FAILED" };
  }

  revalidatePath(`/${locale}/admin/sales-team`);
  for (const target of locales) revalidatePath(`/${target}`);

  return { ok: true };
}
