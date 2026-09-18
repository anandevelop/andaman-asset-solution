/**
 * lib/article-schema.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The Article-family JSON-LD block for a news article's public page,
 * factored out of app/[locale]/(site)/news/[slug]/page.tsx so the news
 * editor's Schema tab can render the exact same object the public page
 * will actually emit, not a hand-maintained approximation of it.
 *
 * "@type" comes from the article's own `schemaType` column (NewsArticle,
 * BlogPosting, Report, …) rather than a hardcoded "Article" — see the
 * schema.prisma comment on NewsArticle.schemaType for why that's a plain,
 * open string rather than an enum this file would have to keep in sync.
 *
 * No `"server-only"`: the public page calls this with real settings from
 * getSiteSettings() (server, DB-backed); the editor's live Schema-tab
 * preview — a "use client" component recomputing on every keystroke —
 * calls it with a static config stand-in instead. Same function, two
 * callers, neither forced into the other's constraints.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { absoluteAssetUrl } from "@/lib/seo";
import { truncate } from "@/lib/markdown-text";

export type ArticleSchemaInput = {
  url: string;
  /** Falls back to "NewsArticle" when null — see the schema.prisma
   *  comment on NewsArticle.schemaType. */
  schemaType: string | null;
  title: string;
  metaDescription: string;
  coverImageUrl: string | null;
  publishedAt: Date | null;
  updatedAt: Date;
  locale: string;
  category: string | null;
  tags: string[];
  authorName: string | null;
};

export type ArticleSchemaBranding = {
  legalName: string;
  siteUrl: string;
  /** Publisher logo — resolved through absoluteAssetUrl() by the caller's
   *  own settings source (DB-backed for the public page, config for the
   *  editor preview), not by this function. */
  logoUrl: string | null;
};

/**
 * TODO(Phase 2b): once an article can carry a real FAQ block, this
 * function should detect it and return an array of two JSON-LD objects
 * (this one plus a sibling FAQPage) instead of a single object — see
 * lib/article-seo.ts's matching TODO for why that block doesn't exist
 * yet. Do not add heuristic FAQ detection ahead of it landing.
 */
export function buildArticleJsonLd(
  input: ArticleSchemaInput,
  branding: ArticleSchemaBranding,
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": input.schemaType ?? "NewsArticle",
    "@id": input.url,
    mainEntityOfPage: { "@type": "WebPage", "@id": input.url },
    // Google rejects headlines over 110 characters.
    headline: truncate(input.title, 110),
    description: input.metaDescription,
    image: input.coverImageUrl ? [input.coverImageUrl] : undefined,
    datePublished: input.publishedAt?.toISOString(),
    dateModified: input.updatedAt.toISOString(),
    inLanguage: input.locale === "th" ? "th-TH" : "en-US",
    articleSection: input.category,
    keywords: input.tags.length > 0 ? input.tags.join(", ") : undefined,
    author: input.authorName
      ? { "@type": "Person", name: input.authorName }
      : { "@type": "Organization", name: branding.legalName },
    publisher: {
      "@type": "Organization",
      name: branding.legalName,
      url: branding.siteUrl,
      logo: {
        "@type": "ImageObject",
        /*
          absoluteAssetUrl, not string concatenation.

          This value is admin-editable, so it is a /public path or an
          absolute CDN URL depending on whether anyone has uploaded one.
          `${siteUrl}${value}` silently produces
          "https://example.comhttps://cdn…" for the second case — and
          unlike openGraph.images, structured data gets no help from
          metadataBase. JsonLd prunes an empty string, so a value we
          cannot resolve drops the field rather than emitting a broken
          one.
        */
        url: absoluteAssetUrl(branding.logoUrl, branding.siteUrl),
      },
    },
  };
}
