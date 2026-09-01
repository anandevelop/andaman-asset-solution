/**
 * app/[locale]/(site)/news/[slug]/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Article detail. Body is Markdown, rendered and sanitized on the server by
 * lib/markdown — the client never receives unsanitized HTML.
 *
 * Carries Article JSON-LD. `headline` is capped at 110 characters because
 * Google truncates beyond that and flags the property as invalid.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { Metadata } from "next";
import ImageWithSkeleton from "@/components/ImageWithSkeleton";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft, CalendarDays, Clock, User } from "lucide-react";
import Reveal from "@/components/Reveal";
import JsonLd from "@/components/JsonLd";
import { siteConfig } from "@/config/site";
import { locales } from "@/i18n";
import {
  getArticleBySlug,
  getPublishedArticleSlugs,
  getPublishedArticles,
} from "@/lib/news";
import { isDatabaseOffline, DatabaseUnavailableError } from "@/lib/db";
import { renderMarkdown, readingMinutes, truncate } from "@/lib/markdown";
import { intlLocale } from "@/lib/format";

export const dynamicParams = true;

/*
  One hour. An article is written once and rarely revised, and publishing
  calls revalidatePath — so this only governs edits made outside the app.
*/
export const revalidate = 3600;

type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateStaticParams() {
  const slugs = await getPublishedArticleSlugs();
  return slugs.map((slug) => ({ slug }));
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

  return {
    title: article.metaTitle,
    description,
    alternates: {
      canonical: `${siteConfig.url}/${locale}/news/${article.slug}`,
      languages: Object.fromEntries(
        locales.map((l) => [l, `${siteConfig.url}/${l}/news/${article.slug}`]),
      ),
    },
    openGraph: {
      title: article.metaTitle,
      description,
      type: "article",
      url: `${siteConfig.url}/${locale}/news/${article.slug}`,
      publishedTime: article.publishedAt?.toISOString(),
      modifiedTime: article.updatedAt.toISOString(),
      authors: article.authorName ? [article.authorName] : undefined,
      tags: [...article.tags],
      // Falls back to the site default (config/site.ts: seo.ogImage) when
      // this article has no cover photo — this page sets its own
      // `openGraph` object, which per Next.js's metadata merging rules
      // *replaces* the root layout's openGraph entirely rather than
      // merging field-by-field, so `images: undefined` here would ship
      // with no og:image at all rather than quietly inheriting the site's
      // default the way the rest of `openGraph` (title/description) does
      // when a page skips setting them.
      images: [{ url: article.coverImageUrl ?? siteConfig.seo.ogImage }],
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
    notFound();
  }

  const [t, related] = await Promise.all([
    getTranslations("news"),
    getPublishedArticles(locale, {
      category: article.category ?? undefined,
      excludeSlug: article.slug,
      take: 3,
    }),
  ]);

  const html = renderMarkdown(article.content);
  const minutes = readingMinutes(article.content);
  const url = `${siteConfig.url}/${locale}/news/${article.slug}`;

  const dateFormat = new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <>
      <JsonLd
        id="article-schema"
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          "@id": url,
          mainEntityOfPage: { "@type": "WebPage", "@id": url },
          // Google rejects headlines over 110 characters.
          headline: truncate(article.title, 110),
          description: article.metaDescription,
          image: article.coverImageUrl ? [article.coverImageUrl] : undefined,
          datePublished: article.publishedAt?.toISOString(),
          dateModified: article.updatedAt.toISOString(),
          inLanguage: locale === "th" ? "th-TH" : "en-US",
          articleSection: article.category,
          keywords: article.tags.length > 0 ? article.tags.join(", ") : undefined,
          author: article.authorName
            ? { "@type": "Person", name: article.authorName }
            : { "@type": "Organization", name: siteConfig.legalName },
          publisher: {
            "@type": "Organization",
            name: siteConfig.legalName,
            url: siteConfig.url,
            logo: {
              "@type": "ImageObject",
              url: `${siteConfig.url}${siteConfig.seo.ogImage}`,
            },
          },
        }}
      />

      {/* ── Header ───────────────────────────────────────────────────── */}
      <article>
        <header className="container-luxe pb-4 pt-28 sm:pt-36">
          <Reveal>
            <Link
              href={`/${locale}/news`}
              className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-ink/65 transition-colors hover:text-accent-700"
            >
              <ArrowLeft size={13} aria-hidden />
              {t("backToNews")}
            </Link>

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
              <div className="relative aspect-[16/9] w-full overflow-hidden rounded-sm shadow-card">
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

            {/* Sanitized in lib/markdown before it ever reaches this point. */}
            <div className="prose-article" dangerouslySetInnerHTML={{ __html: html }} />

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
          </div>
        </div>
      </article>

      {/* ── Related ──────────────────────────────────────────────────── */}
      {related.length > 0 && (
        <section className="bg-primary-900/[0.03] py-16 sm:py-24">
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
                    className="group flex h-full flex-col overflow-hidden rounded-sm border border-primary/10 bg-white shadow-card transition-shadow hover:shadow-lg"
                  >
                    <div className="relative aspect-[16/10] w-full overflow-hidden bg-primary/5">
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
