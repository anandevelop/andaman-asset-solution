"use server";

/**
 * app/[locale]/admin/pages/about/milestones/actions.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Milestone CRUD, same shape as ../awards/actions.ts minus the translation
 * machinery — year, projectName and brand are proper nouns, not editorial
 * copy, so there is no per-locale title to upsert.
 *
 * Delete is hard rather than soft, same reasoning as Award: no public URL,
 * nothing references the row, and removal is a genuine request to erase,
 * not to hide (isActive is what hiding is for).
 */

import { revalidatePath } from "next/cache";
import { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { locales } from "@/i18n";
import { requireAdminAction } from "@/lib/admin/guard";
import { milestoneSchema, fieldErrors } from "@/lib/validations";

export type MilestoneFormState = {
  ok: boolean;
  message?: string;
  fields?: Record<string, string>;
};

function readForm(formData: FormData) {
  const text = (key: string) => (formData.get(key) as string | null) ?? "";

  return {
    year: text("year") || "0",
    projectName: text("projectName"),
    brand: text("brand"),
    imageUrl: text("imageUrl"),
    isActive: formData.get("isActive") === "on",
    sortOrder: text("sortOrder") || "0",
  };
}

/*
  One surface, one locale subtree each — the About page is the only public
  reader (lib/milestones.ts), same as the sales team list. Purged as a
  locale subtree rather than the single path, since a milestone photo or
  reorder should show up immediately regardless of which locale a visitor
  is on.
*/
function revalidateMilestones(locale: string) {
  revalidatePath(`/${locale}/admin/pages/about/milestones`);
  for (const target of locales) {
    revalidatePath(`/${target}/about`);
  }
}

export async function createMilestone(
  locale: string,
  _previous: MilestoneFormState,
  formData: FormData,
): Promise<MilestoneFormState> {
  await requireAdminAction(Role.EDITOR);

  const parsed = milestoneSchema.safeParse(readForm(formData));
  if (!parsed.success) return { ok: false, fields: fieldErrors(parsed.error) };

  try {
    await prisma.milestone.create({ data: parsed.data });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { ok: false, message: "DUPLICATE" };
    }
    console.error("[createMilestone]", error);
    return { ok: false, message: "SAVE_FAILED" };
  }

  revalidateMilestones(locale);
  return { ok: true, message: "SAVED" };
}

export async function updateMilestone(
  locale: string,
  id: string,
  _previous: MilestoneFormState,
  formData: FormData,
): Promise<MilestoneFormState> {
  await requireAdminAction(Role.EDITOR);

  const parsed = milestoneSchema.safeParse(readForm(formData));
  if (!parsed.success) return { ok: false, fields: fieldErrors(parsed.error) };

  try {
    await prisma.milestone.update({ where: { id }, data: parsed.data });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { ok: false, message: "DUPLICATE" };
    }
    console.error("[updateMilestone]", error);
    return { ok: false, message: "SAVE_FAILED" };
  }

  revalidateMilestones(locale);
  return { ok: true, message: "SAVED" };
}

export async function deleteMilestone(locale: string, id: string): Promise<void> {
  await requireAdminAction(Role.ADMIN);

  await prisma.milestone.delete({ where: { id } });

  revalidateMilestones(locale);
}
