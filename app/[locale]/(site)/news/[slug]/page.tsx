/**
 * app/[locale]/(site)/news/[slug]/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Article detail. Body is either Markdown or already-sanitized HTML (see
 * schema.prisma's ArticleFormat and lib/markdown.ts's header) — rendered
 * and sanitized again on the server either way, so the client never
 * receives unsanitized markup regardless of which editor wrote it.
 *
 * The rendered body then gets its leading H1 stripped (the page's own
 * `<h1>{article.title}</h1>` below already covers that — see
 * lib/heading-policy.ts) and every remaining heading gets an anchor id
 * (lib/heading-anchors.ts) for deep links and a future table of contents.
 *
 * Carries Article-family JSON-LD (lib/article-schema.ts), @type driven by
 * the article's own schemaType column rather than a hardcoded "Article".
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { Metadata } from "next";
import ImageWithSkeleton from "@/components/ImageWithSkeleton";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { redirectIfMoved } from "@/lib/redirects";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CalendarDays, Clock, User } from "lucide-react";
import Reveal from "@/components/Reveal";
import JsonLd from "@/components/JsonLd";
import PageViewBeacon from "@/components/PageViewBeacon";
import { siteConfig } from "@/config/site";
import {
  getArticleBySlug,
  getPublishedArticles,
} from "@/lib/news";
import { isDatabaseOffline, DatabaseUnavailableError } from "@/lib/db";
import { renderMarkdown, sanitizeArticleHtml } from "@/lib/markdown";
import { stripLeadingH1 } from "@/lib/heading-policy";
import { addHeadingAnchors } from "@/lib/heading-anchors";
import { truncate } from "@/lib/markdown-text";
import { buildArticleJsonLd } from "@/lib/article-schema";
import { intlLocale } from "@/lib/format";
import { getSiteSettings } from "@/lib/settings";
import { localizedAlternates, breadcrumbList, trailFor } from "@/lib/seo";
import Breadcrumb from "@/components/Breadcrumb";
import ArticleBody from "@/components/ArticleBody";

export const dynamicParams = true;

/*
  One hour. An article is written once and rarely revised, and publishing
  calls revalidatePath — so this only governs edits made outside the app.
*/
export const revalidate = 3600;

type Props = { params: Promise<{ locale: string; slug: string }> };

// Nothing is prerendered at build (see app/[locale]/layout.tsx). The empty
// array — rather than no function at all — is what keeps this route
// ISR-cached: with none, Next renders it on every request.
export function generateStaticParams() {
  return [];
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params;

  const {
    locale,
    slug
  } = params;

  const article = await getArticleBySlug(slug, locale);
  if (!article) return { title: "Not found", robots: { index: false } };

  const description = truncate(article.metaDescription, 300);
  const alternates = localizedAlternates(locale, `/news/${article.slug}`);

  return {
    title: article.metaTitle,
    description,
    alternates: article.canonicalUrl ? { ...alternates, canonical: article.canonicalUrl } : alternates,
    // Per-locale admin toggle (NewsForm's SEO section) — see the
    // schema.prisma comment on NewsArticleTranslation.noIndex.
    robots: article.noIndex ? { index: false, follow: true } : { index: true, follow: true },
    openGraph: {
      title: article.metaTitle,
      description,
      type: "article",
      url: `${siteConfig.url}/${locale}/news/${article.slug}`,
      publishedTime: article.publishedAt?.toISOString(),
      modifiedTime: article.updatedAt.toISOString(),
      authors: article.authorName ? [article.authorName] : undefined,
      tags: [...article.tags],
      // No `images` here: opengraph-image.tsx in this same folder
      // generates the card (category, headline, cover photo) and, per
      // Next's file-convention precedence, replaces whatever this field
      // would have set anyway.
    },
  };
}

export default async function ArticlePage(props: Props) {
  const params = await props.params;

  const {
    locale,
    slug
  } = params;

  setRequestLocale(locale);

  const article = await getArticleBySlug(slug, locale);

  if (!article) {
    // Same reasoning as the project page: an unreachable database must not
    // be cached as a permanent 404.
    if (isDatabaseOffline()) throw new DatabaseUnavailableError(`news/${slug}`);
    await redirectIfMoved(locale, `/news/${slug}`);
    notFound();
  }

  const [t, tNav, related, settings] = await Promise.all([
    getTranslations("news"),
    getTranslations("nav"),
    getPublishedArticles(locale, {
      category: article.category ?? undefined,
      excludeSlug: article.slug,
      take: 3,
    }),
    getSiteSettings(),
  ]);

  const renderedBody =
    article.contentFormat === "HTML"
      ? sanitizeArticleHtml(article.content)
      : renderMarkdown(article.content);
  const html = addHeadingAnchors(stripLeadingH1(renderedBody));
  // Already computed in a format-aware way by lib/news.ts — recomputing
  // it here from article.content directly would call the Markdown-only
  // formula on HTML content for a rich-text article.
  const minutes = article.readingMinutes;
  const url = `${siteConfig.url}/${locale}/news/${article.slug}`;

  const dateFormat = new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // One array for the trail a visitor reads and the one Google reads.
  const trail = trailFor(locale, [
    { name: tNav("home"), path: "" },
    { name: tNav("news"), path: "/news" },
    { name: article.title, path: `/news/${article.slug}` },
  ]);

  return (
    <>
      {/* Counts this read for /admin/news's "views in 30 days" column,
          which sits beside its lead count. Renders nothing. */}
      <PageViewBeacon />

      <JsonLd
        id="breadcrumb-schema"
        data={breadcrumbList(trail)}
      />
      <JsonLd
        id="article-schema"
        data={buildArticleJsonLd(
          {
            url,
            schemaType: article.schemaType,
            title: article.title,
            metaDescription: article.metaDescription,
            coverImageUrl: article.coverImageUrl,
            publishedAt: article.publishedAt,
            updatedAt: article.updatedAt,
            locale,
            category: article.category,
            tags: article.tags,
            authorName: article.authorName,
            content: article.content,
          },
          { legalName: siteConfig.legalName, siteUrl: siteConfig.url, logoUrl: settings.branding.ogImageUrl },
        )}
      />

      {/* ── Header ───────────────────────────────────────────────────── */}
      <article>
        <header className="container-luxe pb-4 pt-28 sm:pt-36">
          <Reveal>
            <Breadcrumb items={trail} />

            {article.category && (
              <p className="eyebrow mt-6">{article.category}</p>
            )}

            <h1 className="mt-3 max-w-3xl text-3xl font-light leading-[1.15] text-primary sm:text-5xl">
              {article.title}
            </h1>

            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-ink/65">
              {article.publishedAt && (
                <time
                  dateTime={article.publishedAt.toISOString()}
                  className="flex items-center gap-1.5"
                >
                  <CalendarDays size={13} aria-hidden />
                  {dateFormat.format(article.publishedAt)}
                </time>
              )}

              {article.authorName && (
                <span className="flex items-center gap-1.5">
                  <User size={13} aria-hidden />
                  {article.authorName}
                </span>
              )}

              {minutes > 0 && (
                <span className="flex items-center gap-1.5">
                  <Clock size={13} aria-hidden />
                  {t("readingTime", { minutes })}
                </span>
              )}
            </div>
          </Reveal>
        </header>

        {/* ── Cover ──────────────────────────────────────────────────── */}
        {article.coverImageUrl && (
          <div className="container-luxe mt-10">
            <Reveal>
              <div className="relative aspect-video w-full overflow-hidden rounded-xs shadow-card">
                <ImageWithSkeleton
                  src={article.coverImageUrl}
                  alt={article.title}
                  fill
                  priority
                  sizes="(max-width: 1440px) 100vw, 1440px"
                  className="object-cover"
                />
              </div>
            </Reveal>
          </div>
        )}

        {/* ── Body ───────────────────────────────────────────────────── */}
        <div className="container-luxe py-14 sm:py-20">
          <div className="mx-auto max-w-2xl">
            {article.excerpt && (
              <p className="mb-10 border-l-2 border-accent pl-6 text-base font-light leading-relaxed text-ink/70 sm:text-lg">
                {article.excerpt}
              </p>
            )}

            {/* Sanitized in lib/markdown before it ever reaches this point.
                ArticleBody renders it as-is unless the body embeds a
                project card, which it resolves against the database — see
                lib/article-embeds.ts. */}
            <ArticleBody html={html} locale={locale} />

            {article.tags.length > 0 && (
              <ul className="mt-12 flex flex-wrap gap-2 border-t border-primary/10 pt-8">
                {article.tags.map((tag) => (
                  <li
                    key={tag}
                    className="rounded-full bg-primary/5 px-3 py-1 text-xs text-ink/70"
                  >
                    {tag}
                  </li>
                ))}
              </ul>
            )}

            {/* ── Talk to sales ──────────────────────────────────────────
                The article's only lead-capture moment. The link's utm_*
                params are how /admin/news's "leads" column knows a
                submission started here — LeadForm (components/LeadForm.tsx)
                reads them straight off window.location.search when the
                contact page mounts, so no schema or new tracking pipe is
                needed, only that this link carries them. See
                lib/news-leads.ts for the read side. */}
            <div className="mt-12 rounded-xs border border-primary/10 bg-primary-900/3 px-6 py-7 text-center sm:px-10">
              <p className="text-base font-medium text-primary">{t("cta.title")}</p>
              <p className="mt-2 text-sm leading-relaxed text-ink/70">{t("cta.body")}</p>
              <Link
                href={`/${locale}/contact?utm_source=news&utm_medium=article&utm_campaign=${encodeURIComponent(article.slug)}`}
                className="mt-5 inline-flex items-center gap-1.5 rounded-xs bg-primary px-6 py-3 text-xs font-medium uppercase tracking-wide text-white transition-colors hover:bg-primary/90"
              >
                {t("cta.button")}
              </Link>
            </div>
          </div>
        </div>
      </article>

      {/* ── Related ──────────────────────────────────────────────────── */}
      {related.length > 0 && (
        <section className="bg-primary-900/3 py-16 sm:py-24">
          <div className="container-luxe">
            <Reveal>
              <h2 className="text-2xl font-light text-primary sm:text-3xl">
                {t("related")}
              </h2>
            </Reveal>

            <div className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-3">
              {related.map((item, index) => (
                <Reveal key={item.id} delay={index * 0.08}>
                  <Link
                    href={`/${locale}/news/${item.slug}`}
                    className="group flex h-full flex-col overflow-hidden rounded-xs border border-primary/10 bg-white shadow-card transition-shadow hover:shadow-lg"
                  >
                    <div className="relative aspect-16/10 w-full overflow-hidden bg-primary/5">
                      {item.coverImageUrl && (
                        <ImageWithSkeleton
                          src={item.coverImageUrl}
                          alt={item.title}
                          fill
                          sizes="(max-width: 640px) 100vw, 33vw"
                          className="object-cover transition-transform duration-700 group-hover:scale-105"
                        />
                      )}
                    </div>
                    <div className="flex flex-1 flex-col p-6">
                      <h3 className="text-base font-light leading-snug text-primary">
                        {item.title}
                      </h3>
                      <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-ink/70">
                        {item.excerpt}
                      </p>
                    </div>
                  </Link>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
