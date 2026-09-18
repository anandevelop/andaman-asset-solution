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
import { ContentStatus, Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { locales } from "@/i18n";
import { requireAdminAction } from "@/lib/admin/guard";
import { hasRole } from "@/lib/role-rank";
import { resolveIsPublished } from "@/lib/publishing-gate";
import { translationCompleteness } from "@/lib/admin/translated-form";
import { newsArticleSchema, newsArticleStudioFieldsSchema, fieldErrors } from "@/lib/validations";
import { sanitizeArticleHtml } from "@/lib/markdown";
import { auditArticle } from "@/lib/article-seo";
import { recordSeoOverride } from "@/lib/audit/events";
import { submitForReview, approveAndPublish } from "@/app/[locale]/admin/(content)/publishing/actions";

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
    // Defensive default, matching `locale` just above — every real
    // NewsForm submission carries this via a hidden input, but a value
    // that fails to arrive should read as the pre-rich-text-editor
    // default, not as an invalid enum value.
    contentFormat: text("contentFormat") || "MARKDOWN",
    coverImageUrl: text("coverImageUrl"),
    ogImageUrl: text("ogImageUrl"),
    category: text("category"),
    tags: text("tags"),
    metaTitle: text("metaTitle"),
    metaDescription: text("metaDescription"),
    focusKeyword: text("focusKeyword"),
    noIndex: formData.get("noIndex") === "on",
    isPublished: formData.get("isPublished") === "on",
    publishedAt: text("publishedAt"),
    schemaType: text("schemaType"),
    canonicalUrl: text("canonicalUrl"),
    secondaryKeywords: text("secondaryKeywords"),
    // Only an ADMIN's submission is ever honored — see applySeoPublishGate()
    // below. A non-admin ticking this (impossible through the real UI, but
    // never impossible through a raw request) changes nothing.
    overridePublishGate: formData.get("overridePublishGate") === "on",
  };
}

/**
 * Whether a save may set isPublished to true, given lib/article-seo.ts's
 * verdict on the content being saved.
 *
 * Only gates a genuinely NEW publish (wasPublished: false → true) — an
 * article already live stays live even if a newly-added check now fails
 * it, the same "never take away what's already there" rule
 * resolveIsPublished() applies to the review-status gate above it. An
 * ADMIN ticking the override checkbox is the one way past a block;
 * recordSeoOverride() is the caller's job once this returns overridden.
 */
function applySeoPublishGate(input: {
  requestedPublished: boolean;
  wasPublished: boolean;
  hasBlockingFailure: boolean;
  overridePublishGate: boolean;
  actorRole: Role;
}): { isPublished: boolean; overridden: boolean } {
  const isNewPublish = !input.wasPublished && input.requestedPublished;
  if (!isNewPublish || !input.hasBlockingFailure) {
    return { isPublished: input.requestedPublished, overridden: false };
  }
  if (input.overridePublishGate && hasRole(input.actorRole, Role.ADMIN)) {
    return { isPublished: true, overridden: true };
  }
  return { isPublished: input.wasPublished, overridden: false };
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

  const form = readForm(formData);
  const parsed = newsArticleSchema.safeParse(form);
  if (!parsed.success) return { ok: false, fields: fieldErrors(parsed.error) };

  const studio = newsArticleStudioFieldsSchema.safeParse(form);
  if (!studio.success) return { ok: false, fields: fieldErrors(studio.error) };

  const {
    locale: editingLocale,
    title,
    excerpt,
    content: rawContent,
    contentFormat,
    metaTitle,
    metaDescription,
    focusKeyword,
    noIndex,
    ...rest
  } = parsed.data;

  // Sanitized again here even though the editor already ran it through
  // sanitizeArticleHtml() client-side — see lib/markdown.ts's header on
  // why a client, including our own, is never trusted with what ends up
  // in dangerouslySetInnerHTML. Markdown content stores as typed; its
  // sanitize pass happens at render (renderMarkdown), same as before this
  // phase existed.
  const content = contentFormat === "HTML" ? sanitizeArticleHtml(rawContent) : rawContent;

  // Only this one locale's translation exists at creation time by
  // construction — languageComplete is trivially false, not guessed.
  const seoResult = auditArticle({
    title,
    metaTitle: metaTitle ?? "",
    metaDescription: metaDescription ?? "",
    slug: rest.slug,
    excerpt: excerpt ?? "",
    focusKeyword: focusKeyword ?? "",
    content,
    contentFormat,
    coverImageUrl: rest.coverImageUrl || null,
    ogImageUrl: rest.ogImageUrl || null,
    languageComplete: false,
  });

  // Every new article starts as a draft, the same entry point the
  // Publishing dashboard's own workflow assumes (see ContentStatus's
  // schema comment) — see resolveIsPublished below for why this is not
  // just a label, it is what stops "tick published" on a brand-new
  // article from skipping the submit → approve workflow entirely, which
  // it did before this phase (create never called resolveIsPublished at
  // all, unlike updateArticle).
  const resolvedIsPublished = resolveIsPublished({
    contentStatus: ContentStatus.DRAFT,
    requestedIsPublished: rest.isPublished,
    currentIsPublished: false,
  });

  const gate = applySeoPublishGate({
    requestedPublished: resolvedIsPublished,
    wasPublished: false,
    hasBlockingFailure: seoResult.hasBlockingFailure,
    overridePublishGate: form.overridePublishGate,
    actorRole: author.role,
  });

  let created;
  try {
    created = await prisma.newsArticle.create({
      data: {
        ...rest,
        contentStatus: ContentStatus.DRAFT,
        isPublished: gate.isPublished,
        contentFormat,
        publishedAt: resolvePublishedAt({ ...parsed.data, isPublished: gate.isPublished }),
        authorId: author.id,
        schemaType: studio.data.schemaType,
        canonicalUrl: studio.data.canonicalUrl,
        secondaryKeywords: studio.data.secondaryKeywords,
        seoScore: seoResult.score,
        seoScoreAt: new Date(),
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
          create: {
            locale: editingLocale,
            title,
            excerpt,
            content,
            metaTitle,
            metaDescription,
            focusKeyword,
            noIndex,
            seoScore: seoResult.score,
          },
        },
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, fields: { slug: "SLUG_TAKEN" } };
    }
    return { ok: false, message: "SAVE_FAILED" };
  }

  if (gate.overridden) {
    await recordSeoOverride({
      actor: author,
      articleId: created.id,
      articleSlug: created.slug,
      seoScore: seoResult.score,
      failingChecks: seoResult.checks.filter((c) => c.status === "fail").map((c) => ({ id: c.id, weight: c.weight })),
    });
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
  const author = await requireAdminAction(Role.EDITOR);

  const form = readForm(formData);
  const parsed = newsArticleSchema.safeParse(form);
  if (!parsed.success) return { ok: false, fields: fieldErrors(parsed.error) };

  const studio = newsArticleStudioFieldsSchema.safeParse(form);
  if (!studio.success) return { ok: false, fields: fieldErrors(studio.error) };

  const {
    locale: editingLocale,
    title,
    excerpt,
    content: rawContent,
    contentFormat,
    metaTitle,
    metaDescription,
    focusKeyword,
    noIndex,
    ...rest
  } = parsed.data;

  // See createArticle's comment: sanitized again server-side regardless
  // of what the editor already did client-side.
  const content = contentFormat === "HTML" ? sanitizeArticleHtml(rawContent) : rawContent;

  try {
    // The original slug still needs revalidating when it changes, or the
    // old URL keeps serving a stale page until its window expires. Also
    // carries what the publish gate needs — see lib/publishing-gate.ts —
    // and the other locales' rows the SEO "all languages complete" check
    // needs, folded in below with this save's own about-to-be-written one.
    const before = await prisma.newsArticle.findUnique({
      where: { id },
      select: {
        slug: true,
        contentStatus: true,
        isPublished: true,
        translations: { select: { locale: true, title: true, content: true } },
      },
    });
    if (!before) return { ok: false, message: "SAVE_FAILED" };
    const resolvedIsPublished = resolveIsPublished({
      contentStatus: before.contentStatus,
      requestedIsPublished: rest.isPublished,
      currentIsPublished: before.isPublished,
    });

    const mergedTranslations = [
      ...before.translations.filter((t) => t.locale !== editingLocale),
      { locale: editingLocale, title, content },
    ];
    const titleComplete = translationCompleteness(mergedTranslations, "title");
    const contentComplete = translationCompleteness(mergedTranslations, "content");
    const languageComplete = locales.every((code) => titleComplete[code] && contentComplete[code]);

    const seoResult = auditArticle({
      title,
      metaTitle: metaTitle ?? "",
      metaDescription: metaDescription ?? "",
      slug: rest.slug,
      excerpt: excerpt ?? "",
      focusKeyword: focusKeyword ?? "",
      content,
      contentFormat,
      coverImageUrl: rest.coverImageUrl || null,
      ogImageUrl: rest.ogImageUrl || null,
      languageComplete,
    });

    const gate = applySeoPublishGate({
      requestedPublished: resolvedIsPublished,
      wasPublished: before.isPublished,
      hasBlockingFailure: seoResult.hasBlockingFailure,
      overridePublishGate: form.overridePublishGate,
      actorRole: author.role,
    });

    const updated = await prisma.newsArticle.update({
      where: { id },
      data: {
        ...rest,
        contentFormat,
        isPublished: gate.isPublished,
        publishedAt: resolvePublishedAt({ ...parsed.data, isPublished: gate.isPublished }),
        schemaType: studio.data.schemaType,
        canonicalUrl: studio.data.canonicalUrl,
        secondaryKeywords: studio.data.secondaryKeywords,
        seoScore: seoResult.score,
        seoScoreAt: new Date(),
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
            update: { title, excerpt, content, metaTitle, metaDescription, focusKeyword, noIndex, seoScore: seoResult.score },
            create: {
              locale: editingLocale,
              title,
              excerpt,
              content,
              metaTitle,
              metaDescription,
              focusKeyword,
              noIndex,
              seoScore: seoResult.score,
            },
          },
        },
      },
    });

    if (gate.overridden) {
      await recordSeoOverride({
        actor: author,
        articleId: updated.id,
        articleSlug: updated.slug,
        seoScore: seoResult.score,
        failingChecks: seoResult.checks
          .filter((c) => c.status === "fail")
          .map((c) => ({ id: c.id, weight: c.weight })),
      });
    }

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

/**
 * The editor's own top-right workflow button — saves exactly like
 * updateArticle (this wraps it rather than forking its logic), then, if a
 * transition was asked for, attempts it through the *existing*
 * submitForReview/approveAndPublish actions in publishing/actions.ts.
 *
 * `transition` is bound server-side by the edit page from the article's
 * own contentStatus and the viewer's role at render time — never chosen
 * by the client — and submitForReview/approveAndPublish each independently
 * re-read the row and re-check the caller's role regardless of what this
 * function passes them, so a stale or forged `transition` value can still
 * only do what the viewer's real role and the row's real state allow.
 *
 * A successful save is never rolled back for a failed transition (most
 * likely a stale WRONG_STATE from a concurrent edit) — the edited fields
 * are real work an editor just did, and losing them because a workflow
 * step also failed would be worse than reporting both outcomes.
 */
/**
 * Folds a workflow-transition outcome onto a save result: no transition
 * was asked for, or the save itself failed → the save result is untouched;
 * the transition failed → the same successful save result, with its
 * message swapped to flag the transition failure instead of "SAVED"
 * (never rolled back — the edited fields are real work already
 * committed). Async only because "use server" modules may export nothing
 * but async functions, type or interface — the body is plain
 * synchronous logic, which is what makes it directly unit-testable
 * without touching Prisma. */
export async function mergeTransitionOutcome(
  saveResult: NewsFormState,
  outcome: { ok: true } | { ok: false; error: string } | null,
): Promise<NewsFormState> {
  if (!saveResult.ok || !outcome) return saveResult;
  if (!outcome.ok) return { ...saveResult, message: `TRANSITION_FAILED:${outcome.error}` };
  return saveResult;
}

export async function updateArticleAndTransition(
  locale: string,
  id: string,
  transition: "submitForReview" | "approveAndPublish" | null,
  previous: NewsFormState,
  formData: FormData,
): Promise<NewsFormState> {
  const result = await updateArticle(locale, id, previous, formData);
  if (!result.ok || !transition) return result;

  const outcome =
    transition === "submitForReview"
      ? await submitForReview(locale, "NEWS_ARTICLE", id)
      : await approveAndPublish(locale, "NEWS_ARTICLE", id);

  return mergeTransitionOutcome(result, outcome);
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

// ── Bulk actions ────────────────────────────────────────────────────────

export type BulkResult =
  | { ok: true; changed: number; blocked: number }
  | { ok: false; changed: 0; blocked: 0 };

/**
 * Publish or unpublish everything ticked on the list.
 *
 * Publishing respects the review workflow rather than going round it: only
 * an article whose contentStatus is already PUBLISHED can be put back on
 * the site from here, which is the same rule resolveIsPublished enforces
 * on the edit form and in lib/publishing-gate.ts. Ticking twenty articles
 * and having the two still in review quietly go live is exactly the
 * accident a review step exists to prevent.
 *
 * `blocked` is the count that could not be published for that reason, and
 * the caller says so out loud. Reporting only `changed` was the first
 * version of this, and it meant selecting a draft, pressing Publish and
 * watching nothing happen with no explanation — a button that lies by
 * omission is worse than no button.
 *
 * Unpublishing is never blocked. The workflow exists to slow down making
 * something newly visible, not to make it harder to take something down.
 */
export async function bulkSetPublished(
  locale: string,
  ids: string[],
  isPublished: boolean,
): Promise<BulkResult> {
  await requireAdminAction(Role.ADMIN);

  if (ids.length === 0 || ids.length > 200) return { ok: false, changed: 0, blocked: 0 };

  try {
    const articles = await prisma.newsArticle.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true, slug: true, contentStatus: true, isPublished: true, publishedAt: true },
    });

    let changed = 0;
    let blocked = 0;

    for (const article of articles) {
      const next = resolveIsPublished({
        contentStatus: article.contentStatus,
        requestedIsPublished: isPublished,
        currentIsPublished: article.isPublished,
      });

      if (next === article.isPublished) {
        // Asked to publish, still not published: the gate stopped it.
        if (isPublished && !next) blocked += 1;
        continue;
      }

      await prisma.newsArticle.update({
        where: { id: article.id },
        data: {
          isPublished: next,
          publishedAt: resolvePublishedAt({ isPublished: next, publishedAt: article.publishedAt }),
        },
      });

      changed += 1;
      revalidateArticle(locale, article.slug);
    }

    return { ok: true, changed, blocked };
  } catch (error) {
    console.error("[bulkSetPublished]", error);
    return { ok: false, changed: 0, blocked: 0 };
  }
}

/** Soft-delete, matching deleteArticle above — the rows stay, so a lead
 *  already attributed to one of these articles still has its story. */
export async function bulkDeleteArticles(locale: string, ids: string[]): Promise<BulkResult> {
  await requireAdminAction(Role.ADMIN);

  if (ids.length === 0 || ids.length > 200) return { ok: false, changed: 0, blocked: 0 };

  try {
    const articles = await prisma.newsArticle.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true, slug: true },
    });

    const result = await prisma.newsArticle.updateMany({
      where: { id: { in: articles.map((article) => article.id) } },
      data: { deletedAt: new Date(), isPublished: false },
    });

    for (const article of articles) revalidateArticle(locale, article.slug);

    return { ok: true, changed: result.count, blocked: 0 };
  } catch (error) {
    console.error("[bulkDeleteArticles]", error);
    return { ok: false, changed: 0, blocked: 0 };
  }
}
