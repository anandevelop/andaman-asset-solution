/**
 * lib/admin/content-link-index.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The data behind the rich-text editor's "insert internal link" modal
 * (components/admin/InternalLinkModal.tsx) — search across every content
 * type an article can link to: Project, NewsArticle, Event, and the
 * fixed static pages.
 *
 * Templated off two existing files rather than reusing either directly:
 *
 *  - lib/admin/url-health.ts's buildPathIndex() has the right query shape
 *    (parallel Project/NewsArticle/Event queries, locale-relative path
 *    construction, STATIC_PATHS as the seed) but the wrong output — a
 *    Set/Map built for "does this path exist", not a titled, searchable
 *    list a picker UI can render rows from.
 *  - command-search-actions.ts's commandSearch() has the right
 *    search/cap/role-gate shape, but every href it returns points at an
 *    admin edit page — exactly backwards for a modal inserting a link a
 *    site visitor will click.
 *
 * Published content only: a link picker suggesting a still-draft page
 * would create a link visitors can't follow yet — precisely what
 * url-health.ts's own dead-link scan exists to catch after the fact.
 *
 * Titles resolve through the target locale with the same fallback chain
 * every public page already uses (lib/get-translation.ts's
 * getTranslation(), lib/locale.ts's pickLocale() for the two content
 * types that still carry the deprecated EN/TH column pair) — searching
 * broadly across every locale's title first and narrowing to the
 * resolved display title after, so a query never misses an item whose
 * *other* language happens to match while the requested locale falls
 * back to English.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { getTranslation } from "@/lib/get-translation";
import { pickLocale } from "@/lib/locale";
import { STATIC_PATHS } from "@/lib/public-paths";

export type ContentLinkType = "project" | "news" | "event" | "static";

export type ContentLinkHit = {
  id: string;
  type: ContentLinkType;
  title: string;
  /** Locale-relative — no `/${locale}` prefix. See lib/redirects.ts's
   *  fromPath convention; the caller prepends the locale at render. */
  path: string;
};

const CANDIDATE_LIMIT = 20;
export const RESULT_LIMIT = 8;

/** Case-insensitive substring match, same rule for every source. */
function matches(query: string, ...values: (string | null | undefined)[]): boolean {
  const needle = query.toLowerCase();
  return values.some((value) => (value ?? "").toLowerCase().includes(needle));
}

/** The getTranslation()-then-pickLocale()-fallback ternary every content
 *  type below needs, pulled out once rather than written a third time.
 *  Same `??` semantics as the original inline version — a translation
 *  row's title/name is a required, non-nullable column, so this only
 *  ever falls through when no matching row exists at all. `any`, matching
 *  this file's existing getTranslation<any>(...) calls: each content
 *  type's Translation row has a different field name for its title
 *  (name/title), so there is no single non-any shape to give this. */
export function resolveTitle(
  translations: any[],
  locale: string,
  field: string,
  legacyTh: string | null,
  legacyEn: string | null,
): string {
  return getTranslation<any>(translations, locale)?.[field] ?? pickLocale(locale, legacyTh, legacyEn);
}

/**
 * A KeywordAssignment/ContentLink tuple — the (contentType, contentId,
 * locale) shape both tables key content by. contentType matches
 * lib/content-revisions.ts's PublishableType (minus E_BROCHURE, which
 * keyword tracking doesn't cover in this phase), not the PascalCase
 * example in KeywordAssignment's own (stale) schema.prisma comment.
 */
export type ContentRef = { contentType: "PROJECT" | "NEWS_ARTICLE" | "EVENT"; contentId: string; locale: string };

export type ResolvedContentRef = ContentRef & {
  title: string;
  path: string;
  status: "published" | "draft";
};

function refKey(ref: ContentRef): string {
  return `${ref.contentType}:${ref.contentId}:${ref.locale}`;
}

/**
 * Batch-resolves KeywordAssignment/ContentLink tuples into display info,
 * for the keyword library's "matched pages" column, its cannibalization
 * flags, and its topic-cluster membership — anywhere that needs to turn a
 * bare (contentType, contentId, locale) into a title and a path.
 *
 * Unlike searchContentLinks() above, NOT published-only: a keyword can be
 * assigned to a still-draft page, and the library should name it (with a
 * draft status) rather than silently omit it. A soft-deleted record is
 * still omitted, though — there is no page left to name.
 */
export async function resolveContentRefs(refs: ContentRef[]): Promise<Map<string, ResolvedContentRef>> {
  const result = new Map<string, ResolvedContentRef>();
  if (refs.length === 0) return result;

  const projectIds = [...new Set(refs.filter((r) => r.contentType === "PROJECT").map((r) => r.contentId))];
  const articleIds = [...new Set(refs.filter((r) => r.contentType === "NEWS_ARTICLE").map((r) => r.contentId))];
  const eventIds = [...new Set(refs.filter((r) => r.contentType === "EVENT").map((r) => r.contentId))];

  const [projects, articles, events] = await Promise.all([
    projectIds.length > 0
      ? prisma.project.findMany({
          where: { id: { in: projectIds }, deletedAt: null },
          select: { id: true, slug: true, nameEn: true, nameTh: true, isPublished: true, translations: true },
        })
      : [],
    articleIds.length > 0
      ? prisma.newsArticle.findMany({
          where: { id: { in: articleIds }, deletedAt: null },
          select: { id: true, slug: true, titleEn: true, titleTh: true, isPublished: true, translations: true },
        })
      : [],
    eventIds.length > 0
      ? prisma.event.findMany({
          where: { id: { in: eventIds } },
          select: { id: true, slug: true, titleEn: true, titleTh: true, isPublished: true, translations: true },
        })
      : [],
  ]);

  const projectById = new Map(projects.map((row) => [row.id, row]));
  const articleById = new Map(articles.map((row) => [row.id, row]));
  const eventById = new Map(events.map((row) => [row.id, row]));

  for (const ref of refs) {
    const key = refKey(ref);
    if (result.has(key)) continue;

    if (ref.contentType === "PROJECT") {
      const row = projectById.get(ref.contentId);
      if (!row) continue;
      result.set(key, {
        ...ref,
        title: resolveTitle(row.translations, ref.locale, "name", row.nameTh, row.nameEn),
        path: `/projects/${row.slug}`,
        status: row.isPublished ? "published" : "draft",
      });
    } else if (ref.contentType === "NEWS_ARTICLE") {
      const row = articleById.get(ref.contentId);
      if (!row) continue;
      result.set(key, {
        ...ref,
        title: resolveTitle(row.translations, ref.locale, "title", row.titleTh, row.titleEn),
        path: `/news/${row.slug}`,
        status: row.isPublished ? "published" : "draft",
      });
    } else {
      const row = eventById.get(ref.contentId);
      if (!row) continue;
      result.set(key, {
        ...ref,
        title: resolveTitle(row.translations, ref.locale, "title", row.titleTh, row.titleEn),
        path: `/events/${row.slug}`,
        status: row.isPublished ? "published" : "draft",
      });
    }
  }

  return result;
}

export type LinkSourceInfo = { label: string; adminHref: string | null };

/**
 * Resolves a batch of ContentLink "from" tuples (fromType, fromId — the
 * same shape a ContentLink row's own source columns use) to a display
 * label and an edit link. PROJECT/NEWS_ARTICLE/EVENT go through
 * resolveContentRefs() above; FAQ and HERO_SLIDE (link sources with no
 * individual public page of their own — see lib/admin/link-graph.ts) get
 * their own small lookup, mirroring lib/admin/url-health.ts's own
 * labelling for the exact same two source kinds.
 *
 * Shared by lib/admin/link-opportunities.ts's getArticleLinkPanel (an
 * article's own inbound-links list) and lib/admin/link-health.ts's
 * external-link report (which source mentions a checked external URL) —
 * one resolver for "what/where is this ContentLink row's source", not two.
 */
export async function resolveLinkSources(
  refs: { fromType: string; fromId: string }[],
): Promise<Map<string, LinkSourceInfo>> {
  const result = new Map<string, LinkSourceInfo>();
  const key = (fromType: string, fromId: string) => `${fromType}:${fromId}`;

  const contentRefs: ContentRef[] = refs
    .filter((r) => r.fromType === "PROJECT" || r.fromType === "NEWS_ARTICLE" || r.fromType === "EVENT")
    .map((r) => ({ contentType: r.fromType as ContentRef["contentType"], contentId: r.fromId, locale: "en" }));

  const resolved = contentRefs.length > 0 ? await resolveContentRefs(contentRefs) : new Map();
  for (const ref of contentRefs) {
    const info = resolved.get(`${ref.contentType}:${ref.contentId}:en`);
    if (!info) continue;
    const hrefBase =
      ref.contentType === "PROJECT" ? "projects" : ref.contentType === "NEWS_ARTICLE" ? "news" : "events";
    result.set(key(ref.contentType, ref.contentId), { label: info.title, adminHref: `/admin/${hrefBase}/${ref.contentId}/edit` });
  }

  const faqIds = [...new Set(refs.filter((r) => r.fromType === "FAQ").map((r) => r.fromId))];
  if (faqIds.length > 0) {
    const faqs = await prisma.faq.findMany({
      where: { id: { in: faqIds } },
      select: { id: true, questionEn: true, questionTh: true, translations: { select: { locale: true, question: true } } },
    });
    for (const faq of faqs) {
      result.set(key("FAQ", faq.id), {
        label: resolveTitle(faq.translations, "en", "question", faq.questionTh, faq.questionEn),
        adminHref: `/admin/pages/faq/${faq.id}/edit`,
      });
    }
  }

  if (refs.some((r) => r.fromType === "HERO_SLIDE")) {
    const slides = await prisma.heroStorySlide.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true } });
    slides.forEach((slide, index) => {
      result.set(key("HERO_SLIDE", slide.id), { label: `#${index + 1}`, adminHref: "/admin/pages/home/hero" });
    });
  }

  return result;
}

/**
 * The narrow-sort-cap step, pulled out as its own pure function so it can
 * be unit tested without a database — see tests/lib/content-link-index
 * .test.ts. Candidates arrive already matched broadly (any locale's
 * title); this re-checks against the *resolved* title/path for the
 * requested locale, since a broad DB-side OR can surface a row whose
 * English title matched but whose Thai title (what actually renders in
 * the picker) does not.
 */
export function rankContentLinks(query: string, candidates: ContentLinkHit[]): ContentLinkHit[] {
  return candidates
    .filter((hit) => matches(query, hit.title, hit.path))
    .sort((a, b) => a.title.localeCompare(b.title))
    .slice(0, RESULT_LIMIT);
}

export async function searchContentLinks(locale: string, rawQuery: string): Promise<ContentLinkHit[]> {
  const query = rawQuery.trim();
  if (query.length < 2) return [];

  const contains = { contains: query, mode: "insensitive" as const };

  const [projects, articles, events] = await Promise.all([
    prisma.project.findMany({
      where: {
        deletedAt: null,
        isPublished: true,
        OR: [{ nameEn: contains }, { nameTh: contains }, { translations: { some: { name: contains } } }],
      },
      take: CANDIDATE_LIMIT,
      select: { id: true, slug: true, nameEn: true, nameTh: true, translations: true },
    }),
    prisma.newsArticle.findMany({
      where: {
        deletedAt: null,
        isPublished: true,
        OR: [{ titleEn: contains }, { titleTh: contains }, { translations: { some: { title: contains } } }],
      },
      take: CANDIDATE_LIMIT,
      select: { id: true, slug: true, titleEn: true, titleTh: true, translations: true },
    }),
    prisma.event.findMany({
      where: {
        isPublished: true,
        OR: [{ titleEn: contains }, { titleTh: contains }, { translations: { some: { title: contains } } }],
      },
      take: CANDIDATE_LIMIT,
      select: { id: true, slug: true, titleEn: true, titleTh: true, translations: true },
    }),
  ]);

  const projectHits: ContentLinkHit[] = projects.map((row) => ({
    id: row.id,
    type: "project",
    title: resolveTitle(row.translations, locale, "name", row.nameTh, row.nameEn),
    path: `/projects/${row.slug}`,
  }));

  const newsHits: ContentLinkHit[] = articles.map((row) => ({
    id: row.id,
    type: "news",
    title: resolveTitle(row.translations, locale, "title", row.titleTh, row.titleEn),
    path: `/news/${row.slug}`,
  }));

  const eventHits: ContentLinkHit[] = events.map((row) => ({
    id: row.id,
    type: "event",
    title: resolveTitle(row.translations, locale, "title", row.titleTh, row.titleEn),
    path: `/events/${row.slug}`,
  }));

  const staticHits: ContentLinkHit[] = STATIC_PATHS.map((path) => ({
    id: path,
    type: "static" as const,
    title: path,
    path,
  }));

  return rankContentLinks(query, [...projectHits, ...newsHits, ...eventHits, ...staticHits]);
}
