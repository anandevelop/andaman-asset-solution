"use server";

/**
 * app/[locale]/admin/news/actions.ts
 * ─────────────────────────────────────────────────────────────────────────
 * NewsArticle CRUD, same shape as the project actions.
 *
 * publishedAt is derived rather than trusted blindly: ticking "published"
 * without a date stamps now, so an editor cannot accidentally create an
 * article that is published-but-invisible (lib/news filters on
 * publishedAt <= now). Setting a future date is still allowed — that is
 * scheduling, and it is deliberate.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { locales } from "@/i18n";
import { requireAdminAction } from "@/lib/admin/guard";
import { newsArticleSchema, fieldErrors } from "@/lib/validations";

export type NewsFormState = {
  ok: boolean;
  message?: string;
  fields?: Record<string, string>;
};

function readForm(formData: FormData) {
  const text = (key: string) => (formData.get(key) as string | null) ?? "";

  return {
    locale: text("locale") || "en",
    slug: text("slug"),
    title: text("title"),
    excerpt: text("excerpt"),
    content: text("content"),
    coverImageUrl: text("coverImageUrl"),
    category: text("category"),
    tags: text("tags"),
    metaTitle: text("metaTitle"),
    metaDescription: text("metaDescription"),
    isPublished: formData.get("isPublished") === "on",
    publishedAt: text("publishedAt"),
  };
}

/** Published with no date → stamp now. Unpublished → clear the date. */
function resolvePublishedAt(input: {
  isPublished: boolean;
  publishedAt: Date | null;
}): Date | null {
  if (!input.isPublished) return null;
  return input.publishedAt ?? new Date();
}

function revalidateArticle(locale: string, slug: string) {
  revalidatePath(`/${locale}/admin/news`);
  for (const target of locales) {
    // The home page carries the latest three articles, so publishing one
    // has to refresh it too — it was reaching visitors up to an hour late.
    revalidatePath(`/${target}`);
    revalidatePath(`/${target}/news`);
    revalidatePath(`/${target}/news/${slug}`);
  }
}

// ── Create ──────────────────────────────────────────────────────────────

export async function createArticle(
  locale: string,
  _previous: NewsFormState,
  formData: FormData,
): Promise<NewsFormState> {
  const author = await requireAdminAction(Role.EDITOR);

  const parsed = newsArticleSchema.safeParse(readForm(formData));
  if (!parsed.success) return { ok: false, fields: fieldErrors(parsed.error) };

  const { locale: editingLocale, title, excerpt, content, metaTitle, metaDescription, ...rest } =
    parsed.data;

  let created;
  try {
    created = await prisma.newsArticle.create({
      data: {
        ...rest,
        publishedAt: resolvePublishedAt(parsed.data),
        authorId: author.id,
        // titleEn/titleTh/contentEn/contentTh are @deprecated but still
        // NOT NULL — mirrored here only for the locale actually being
        // created, same reasoning as AwardForm's titleEn/titleTh.
        titleEn: editingLocale === "en" ? title : "",
        titleTh: editingLocale === "th" ? title : "",
        contentEn: editingLocale === "en" ? content : "",
        contentTh: editingLocale === "th" ? content : "",
        excerptEn: editingLocale === "en" ? excerpt : null,
        excerptTh: editingLocale === "th" ? excerpt : null,
        metaTitleEn: editingLocale === "en" ? metaTitle : null,
        metaTitleTh: editingLocale === "th" ? metaTitle : null,
        metaDescriptionEn: editingLocale === "en" ? metaDescription : null,
        metaDescriptionTh: editingLocale === "th" ? metaDescription : null,
        translations: {
          create: { locale: editingLocale, title, excerpt, content, metaTitle, metaDescription },
        },
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, fields: { slug: "SLUG_TAKEN" } };
    }
    return { ok: false, message: "SAVE_FAILED" };
  }

  revalidateArticle(locale, created.slug);
  redirect(`/${locale}/admin/news/${created.id}/edit?created=1`);
}

// ── Update ──────────────────────────────────────────────────────────────

export async function updateArticle(
  locale: string,
  id: string,
  _previous: NewsFormState,
  formData: FormData,
): Promise<NewsFormState> {
  await requireAdminAction(Role.EDITOR);

  const parsed = newsArticleSchema.safeParse(readForm(formData));
  if (!parsed.success) return { ok: false, fields: fieldErrors(parsed.error) };

  const { locale: editingLocale, title, excerpt, content, metaTitle, metaDescription, ...rest } =
    parsed.data;

  try {
    // The original slug still needs revalidating when it changes, or the
    // old URL keeps serving a stale page until its window expires.
    const before = await prisma.newsArticle.findUnique({
      where: { id },
      select: { slug: true },
    });

    const updated = await prisma.newsArticle.update({
      where: { id },
      data: {
        ...rest,
        publishedAt: resolvePublishedAt(parsed.data),
        // Only touch the deprecated column matching the locale being
        // saved — editing zh/ru must never blank out or overwrite en/th.
        ...(editingLocale === "en"
          ? { titleEn: title, contentEn: content, excerptEn: excerpt, metaTitleEn: metaTitle, metaDescriptionEn: metaDescription }
          : {}),
        ...(editingLocale === "th"
          ? { titleTh: title, contentTh: content, excerptTh: excerpt, metaTitleTh: metaTitle, metaDescriptionTh: metaDescription }
          : {}),
        translations: {
          upsert: {
            where: { articleId_locale: { articleId: id, locale: editingLocale } },
            update: { title, excerpt, content, metaTitle, metaDescription },
            create: { locale: editingLocale, title, excerpt, content, metaTitle, metaDescription },
          },
        },
      },
    });

    if (before && before.slug !== updated.slug) revalidateArticle(locale, before.slug);
    revalidateArticle(locale, updated.slug);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, fields: { slug: "SLUG_TAKEN" } };
    }
    return { ok: false, message: "SAVE_FAILED" };
  }

  return { ok: true, message: "SAVED" };
}

// ── Soft delete ─────────────────────────────────────────────────────────

export async function deleteArticle(locale: string, id: string): Promise<void> {
  await requireAdminAction(Role.ADMIN);

  const article = await prisma.newsArticle.update({
    where: { id },
    data: { deletedAt: new Date(), isPublished: false },
    select: { slug: true },
  });

  revalidateArticle(locale, article.slug);
  redirect(`/${locale}/admin/news`);
}
