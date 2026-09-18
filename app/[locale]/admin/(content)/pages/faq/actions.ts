"use server";

/**
 * app/[locale]/admin/faqs/actions.ts
 * ─────────────────────────────────────────────────────────────────────────
 * FAQ CRUD.
 *
 * Revalidation is broad: an FAQ can appear on the home page and on every
 * project page at once, and there is no cheap way to know which projects
 * showed a given entry. Refreshing all of them is a handful of cache
 * invalidations on a site with a few projects — far better than a stale
 * answer about ownership structures sitting on a page for an hour.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { locales } from "@/i18n";
import { requireAdminAction } from "@/lib/admin/guard";
import { faqSchema, fieldErrors } from "@/lib/validations";

export type FaqFormState = {
  ok: boolean;
  message?: string;
  fields?: Record<string, string>;
};

function readForm(formData: FormData) {
  const text = (key: string) => (formData.get(key) as string | null) ?? "";

  return {
    locale: text("locale") || "en",
    question: text("question"),
    answer: text("answer"),
    category: text("category"),
    isPublished: formData.get("isPublished") === "on",
    sortOrder: text("sortOrder") || "0",
  };
}

async function revalidateFaqs() {
  const projects = await prisma.project
    .findMany({
      where: { isPublished: true, deletedAt: null },
      select: { slug: true },
    })
    .catch(() => []);

  for (const locale of locales) {
    revalidatePath(`/${locale}`);
    revalidatePath(`/${locale}/admin/faqs`);

    for (const { slug } of projects) {
      revalidatePath(`/${locale}/projects/${slug}`);
    }
  }
}

export async function createFaq(
  _previous: FaqFormState,
  formData: FormData,
): Promise<FaqFormState> {
  await requireAdminAction(Role.EDITOR);

  const parsed = faqSchema.safeParse(readForm(formData));
  if (!parsed.success) return { ok: false, fields: fieldErrors(parsed.error) };

  const { locale: editingLocale, question, answer, ...rest } = parsed.data;

  try {
    await prisma.faq.create({
      data: {
        ...rest,
        // questionEn/questionTh/answerEn/answerTh are @deprecated but
        // still NOT NULL — mirrored here only for the locale actually
        // being created, same reasoning as AwardForm's titleEn/titleTh.
        questionEn: editingLocale === "en" ? question : "",
        questionTh: editingLocale === "th" ? question : "",
        answerEn: editingLocale === "en" ? answer : "",
        answerTh: editingLocale === "th" ? answer : "",
        translations: { create: { locale: editingLocale, question, answer } },
      },
    });
  } catch (error) {
    console.error("[createFaq]", error);
    return { ok: false, message: "SAVE_FAILED" };
  }

  await revalidateFaqs();
  return { ok: true, message: "SAVED" };
}

export async function updateFaq(
  id: string,
  _previous: FaqFormState,
  formData: FormData,
): Promise<FaqFormState> {
  await requireAdminAction(Role.EDITOR);

  const parsed = faqSchema.safeParse(readForm(formData));
  if (!parsed.success) return { ok: false, fields: fieldErrors(parsed.error) };

  const { locale: editingLocale, question, answer, ...rest } = parsed.data;

  try {
    await prisma.faq.update({
      where: { id },
      data: {
        ...rest,
        // Only touch the deprecated column matching the locale being
        // saved — editing zh/ru must never blank out or overwrite en/th.
        ...(editingLocale === "en" ? { questionEn: question, answerEn: answer } : {}),
        ...(editingLocale === "th" ? { questionTh: question, answerTh: answer } : {}),
        translations: {
          upsert: {
            where: { faqId_locale: { faqId: id, locale: editingLocale } },
            update: { question, answer },
            create: { locale: editingLocale, question, answer },
          },
        },
      },
    });
  } catch (error) {
    console.error("[updateFaq]", error);
    return { ok: false, message: "SAVE_FAILED" };
  }

  await revalidateFaqs();
  return { ok: true, message: "SAVED" };
}

export async function deleteFaq(id: string): Promise<void> {
  await requireAdminAction(Role.ADMIN);

  await prisma.faq.delete({ where: { id } });
  await revalidateFaqs();
}
