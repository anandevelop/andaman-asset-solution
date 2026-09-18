"use server";

/**
 * app/[locale]/admin/pages/about/mission/actions.ts
 * ─────────────────────────────────────────────────────────────────────────
 * MissionPrinciple CRUD, same shape as ../why-us/actions.ts (the two
 * models are structurally identical — see MissionPrinciple's schema.prisma
 * comment for why they stay separate models) — `title`/`body` are
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
import { missionPrincipleSchema, fieldErrors } from "@/lib/validations";

export type MissionPrincipleFormState = {
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

// Shown only on the About page — purged as a locale subtree so a new
// principle or reorder shows up immediately.
function revalidateMission(locale: string) {
  revalidatePath(`/${locale}/admin/pages/about/mission`);
  for (const target of locales) {
    revalidatePath(`/${target}/about`);
  }
}

export async function createMissionPrinciple(
  locale: string,
  _previous: MissionPrincipleFormState,
  formData: FormData,
): Promise<MissionPrincipleFormState> {
  await requireAdminAction(Role.EDITOR);

  const parsed = missionPrincipleSchema.safeParse(readForm(formData));
  if (!parsed.success) return { ok: false, fields: fieldErrors(parsed.error) };

  const { locale: editingLocale, title, body, ...rest } = parsed.data;

  try {
    await prisma.missionPrinciple.create({
      data: {
        ...rest,
        translations: { create: { locale: editingLocale, title, body } },
      },
    });
  } catch (error) {
    console.error("[createMissionPrinciple]", error);
    return { ok: false, message: "SAVE_FAILED" };
  }

  revalidateMission(locale);
  return { ok: true, message: "SAVED" };
}

export async function updateMissionPrinciple(
  locale: string,
  id: string,
  _previous: MissionPrincipleFormState,
  formData: FormData,
): Promise<MissionPrincipleFormState> {
  await requireAdminAction(Role.EDITOR);

  const parsed = missionPrincipleSchema.safeParse(readForm(formData));
  if (!parsed.success) return { ok: false, fields: fieldErrors(parsed.error) };

  const { locale: editingLocale, title, body, ...rest } = parsed.data;

  try {
    await prisma.missionPrinciple.update({
      where: { id },
      data: {
        ...rest,
        translations: {
          upsert: {
            where: { principleId_locale: { principleId: id, locale: editingLocale } },
            update: { title, body },
            create: { locale: editingLocale, title, body },
          },
        },
      },
    });
  } catch (error) {
    console.error("[updateMissionPrinciple]", error);
    return { ok: false, message: "SAVE_FAILED" };
  }

  revalidateMission(locale);
  return { ok: true, message: "SAVED" };
}

export async function deleteMissionPrinciple(locale: string, id: string): Promise<void> {
  await requireAdminAction(Role.ADMIN);

  await prisma.missionPrinciple.delete({ where: { id } });

  revalidateMission(locale);
}
