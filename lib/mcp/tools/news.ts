/**
 * lib/mcp/tools/news.ts
 * ─────────────────────────────────────────────────────────────────────────
 * News articles for an AI client: read, draft, edit one language at a time,
 * and ask to move to the trash.
 *
 * WRITING GOES THROUGH THE BACK OFFICE'S OWN ACTIONS (createArticle,
 * updateArticle), so an article an AI wrote is validated, sanitised, scored
 * for SEO and recorded in the activity log exactly like one a person wrote.
 * Those actions take the editor's form, so the tools build that form: the
 * article as it stands, with the fields the client sent laid over it.
 *
 * NOT OFFERED: publishing. A new article is always a draft and an edit
 * never changes whether an article is live; a person publishes from the
 * back office. An AI writing straight onto the public site, in the
 * company's name, is a decision nobody has made yet.
 *
 * "Deleting" an article moves it to the trash (deletedAt) and takes it off
 * the site. It is still asked for and confirmed like any deletion.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { locales } from "@/i18n";
import { defineTool } from "@/lib/mcp/registry";
import { registerDeletion, requestDeletion } from "@/lib/mcp/deletions";
import { describeFailure, redirectTarget, toForm } from "@/lib/mcp/tools/form";
import { createArticle, updateArticle } from "@/app/[locale]/admin/(content)/news/actions";

const localeInput = z.enum(locales).describe("Which language version: en, th, zh or ru");
const slugInput = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(2).max(140).describe("URL slug: lowercase letters, numbers and single hyphens");

const fields = {
  title: z.string().trim().min(2).max(200),
  excerpt: z.string().trim().max(600),
  content: z.string().trim().min(1).max(60_000).describe("Article body in Markdown (or HTML when the article's format is HTML). At most one H1."),
  metaTitle: z.string().trim().max(200),
  metaDescription: z.string().trim().max(400),
  focusKeyword: z.string().trim().max(200),
  coverImageUrl: z.string().trim().max(600).describe("An image url from the media library (media_list)"),
  category: z.string().trim().max(80),
  tags: z.array(z.string().trim().min(1).max(40)).max(20),
};

defineTool({
  name: "news_list",
  title: "List news articles",
  description:
    "News articles, newest first: id, slug, titles, whether each is published, its workflow status (DRAFT, IN_REVIEW, PUBLISHED), SEO score, which languages exist, category and tags. Filter by text in the title or slug, or by published state. Articles in the trash are not listed.",
  access: "read",
  capability: "viewContent",
  input: {
    query: z.string().trim().max(100).optional(),
    published: z.boolean().optional(),
    limit: z.number().int().min(1).max(50).optional(),
    offset: z.number().int().min(0).max(100_000).optional(),
  },
  handler: async ({ query, published, limit = 20, offset = 0 }) => {
    const where = {
      deletedAt: null,
      ...(published === undefined ? {} : { isPublished: published }),
      ...(query
        ? { OR: [{ slug: { contains: query.toLowerCase() } }, { translations: { some: { title: { contains: query, mode: "insensitive" as const } } } }] }
        : {}),
    };
    const [total, rows] = await Promise.all([
      prisma.newsArticle.count({ where }),
      prisma.newsArticle.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit,
        select: {
          id: true, slug: true, isPublished: true, contentStatus: true, publishedAt: true, seoScore: true, category: true, tags: true, coverImageUrl: true, updatedAt: true,
          translations: { select: { locale: true, title: true } },
        },
      }),
    ]);
    return {
      total,
      offset,
      items: rows.map(({ translations, ...row }) => ({
        ...row,
        titles: Object.fromEntries(translations.map((t) => [t.locale, t.title])),
        languages: translations.map((t) => t.locale),
        missingLanguages: locales.filter((code) => !translations.some((t) => t.locale === code)),
      })),
    };
  },
});

defineTool({
  name: "news_get",
  title: "Read one news article",
  description: "One article in full: shared fields (slug, cover image, category, tags, format, published state) and every language version with its title, excerpt, body, meta title, meta description and focus keyword. Look it up by id or by slug.",
  access: "read",
  capability: "viewContent",
  input: { id: z.string().max(64).optional(), slug: z.string().max(140).optional() },
  handler: async ({ id, slug }) => {
    if (!id && !slug) throw new Error("NOT_FOUND:give an id or a slug");
    const article = await prisma.newsArticle.findFirst({
      where: { deletedAt: null, ...(id ? { id } : { slug }) },
      select: {
        id: true, slug: true, contentFormat: true, coverImageUrl: true, ogImageUrl: true, category: true, tags: true, isPublished: true, contentStatus: true,
        publishedAt: true, seoScore: true, schemaType: true, canonicalUrl: true, secondaryKeywords: true, createdAt: true, updatedAt: true,
        translations: { select: { locale: true, title: true, excerpt: true, content: true, metaTitle: true, metaDescription: true, focusKeyword: true, noIndex: true, seoScore: true } },
      },
    });
    if (!article) throw new Error("NOT_FOUND");
    const { translations, ...shared } = article;
    return { ...shared, versions: Object.fromEntries(translations.map(({ locale, ...version }) => [locale, version])) };
  },
});

defineTool({
  name: "news_create_draft",
  title: "Create a draft article",
  description:
    "Creates a new news article as a DRAFT in one language (add the other languages afterwards with news_update). It is never published by this tool: a person reviews and publishes it in the back office. Returns the new article's id. The body is Markdown.",
  access: "write",
  capability: "editContent",
  input: {
    locale: localeInput,
    slug: slugInput,
    title: fields.title,
    content: fields.content,
    excerpt: fields.excerpt.optional(),
    metaTitle: fields.metaTitle.optional(),
    metaDescription: fields.metaDescription.optional(),
    focusKeyword: fields.focusKeyword.optional(),
    coverImageUrl: fields.coverImageUrl.optional(),
    category: fields.category.optional(),
    tags: fields.tags.optional(),
  },
  handler: async (input) => {
    const form = toForm({ ...input, tags: (input.tags ?? []).join(", "), contentFormat: "MARKDOWN" });
    try {
      const state = await createArticle("th", { ok: false }, form);
      throw new Error(describeFailure(state));
    } catch (error) {
      // Success is a redirect to the new article's edit page.
      const target = redirectTarget(error);
      if (!target) throw error;
      const id = /\/news\/([^/]+)\/edit/.exec(target)?.[1];
      return { status: "created", id, slug: input.slug, published: false, next: "Add other languages with news_update. A person publishes it from the back office." };
    }
  },
});

defineTool({
  name: "news_update",
  title: "Edit an article in one language",
  description:
    "Edits one language version of an article, or adds that language if it does not exist yet (title and content are then required). Only the fields you send change. Shared fields (slug, coverImageUrl, category, tags) apply to every language. Does not publish or unpublish: the article stays as live, or as hidden, as it was. Changing the slug of a published article changes its URL.",
  access: "write",
  capability: "editContent",
  input: {
    id: z.string().min(1).max(64),
    locale: localeInput,
    title: fields.title.optional(),
    content: fields.content.optional(),
    excerpt: fields.excerpt.optional(),
    metaTitle: fields.metaTitle.optional(),
    metaDescription: fields.metaDescription.optional(),
    focusKeyword: fields.focusKeyword.optional(),
    slug: slugInput.optional(),
    coverImageUrl: fields.coverImageUrl.optional(),
    category: fields.category.optional(),
    tags: fields.tags.optional(),
  },
  handler: async ({ id, locale, ...changes }) => {
    const article = await prisma.newsArticle.findFirst({
      where: { id, deletedAt: null },
      select: {
        slug: true, contentFormat: true, coverImageUrl: true, ogImageUrl: true, category: true, tags: true, isPublished: true, publishedAt: true,
        schemaType: true, canonicalUrl: true, secondaryKeywords: true,
        translations: { where: { locale }, select: { title: true, excerpt: true, content: true, metaTitle: true, metaDescription: true, focusKeyword: true, noIndex: true } },
      },
    });
    if (!article) throw new Error("NOT_FOUND");
    const version = article.translations[0];
    const title = changes.title ?? version?.title;
    const content = changes.content ?? version?.content ?? undefined;
    if (!title || !content) throw new Error(`VALIDATION_FAILED:the ${locale} version does not exist yet — send both title and content`);

    const form = toForm({
      locale,
      slug: changes.slug ?? article.slug,
      title,
      content,
      excerpt: changes.excerpt ?? version?.excerpt ?? "",
      metaTitle: changes.metaTitle ?? version?.metaTitle ?? "",
      metaDescription: changes.metaDescription ?? version?.metaDescription ?? "",
      focusKeyword: changes.focusKeyword ?? version?.focusKeyword ?? "",
      noIndex: version?.noIndex ?? false,
      contentFormat: article.contentFormat,
      coverImageUrl: changes.coverImageUrl ?? article.coverImageUrl ?? "",
      ogImageUrl: article.ogImageUrl ?? "",
      category: changes.category ?? article.category ?? "",
      tags: (changes.tags ?? article.tags).join(", "),
      // As it was: this tool neither publishes nor unpublishes.
      isPublished: article.isPublished,
      publishedAt: article.publishedAt ? article.publishedAt.toISOString() : "",
      schemaType: article.schemaType ?? "",
      canonicalUrl: article.canonicalUrl ?? "",
      secondaryKeywords: article.secondaryKeywords.join(", "),
    });
    const state = await updateArticle("th", id, { ok: false }, form);
    if (!state.ok) throw new Error(describeFailure(state));
    return { status: "saved", id, locale, created: !version, published: article.isPublished };
  },
});

const NEWS_DELETION = "news.trash";

registerDeletion(NEWS_DELETION, {
  tier: "chat",
  run: async (ids) => {
    const rows = await prisma.newsArticle.findMany({ where: { id: { in: ids }, deletedAt: null }, select: { id: true, slug: true } });
    for (const row of rows) {
      await prisma.newsArticle.update({ where: { id: row.id }, data: { deletedAt: new Date(), isPublished: false } });
      try {
        for (const locale of locales) {
          revalidatePath(`/${locale}/news`);
          revalidatePath(`/${locale}/news/${row.slug}`);
        }
      } catch {
        /* Nothing to revalidate outside a request. */
      }
    }
    return rows.length;
  },
});

defineTool({
  name: "news_delete",
  title: "Ask to move articles to the trash",
  description:
    "Asks to move news articles to the trash, which also takes published ones off the website. NOTHING happens on this call: it returns a deletion request with a summary and a confirmationCode. Show the summary to the user, and only after they explicitly agree call confirm_deletion. Trashed articles can be restored by an administrator in the back office.",
  access: "write",
  capability: "editContent",
  destructive: true,
  input: { ids: z.array(z.string().min(1).max(64)).min(1).max(50) },
  handler: async ({ ids }) => {
    const rows = await prisma.newsArticle.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true, slug: true, isPublished: true, translations: { select: { title: true }, take: 1 } },
    });
    if (rows.length !== new Set(ids).size) throw new Error("NOT_FOUND:one or more ids do not exist");
    const live = rows.filter((row) => row.isPublished).length;
    const lines = rows.slice(0, 15).map((row) => `• ${row.translations[0]?.title ?? row.slug}${row.isPublished ? " (PUBLISHED — will be taken off the site)" : " (draft)"}`);
    return requestDeletion({
      kind: NEWS_DELETION,
      ids: rows.map((row) => row.id),
      summary: `Move ${rows.length} news article(s) to the trash${live ? `, ${live} of them currently live on the website` : ""}:\n${lines.join("\n")}${rows.length > 15 ? `\n…and ${rows.length - 15} more` : ""}`,
    });
  },
});
