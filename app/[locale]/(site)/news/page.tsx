/**
 * app/[locale]/(site)/news/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Article index. The category filter is a query param rather than a nested
 * route so a chip can be shared as a URL without minting a second set of
 * indexable pages that duplicate this one's content.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { Metadata } from "next";
import ImageWithSkeleton from "@/components/ImageWithSkeleton";
import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowRight, CalendarDays } from "lucide-react";
import Reveal from "@/components/Reveal";
import DbOfflineNotice from "@/components/DbOfflineNotice";
import { siteConfig } from "@/config/site";
import { locales } from "@/i18n";
import { getArticleCategories, getPublishedArticles } from "@/lib/news";
import { isDatabaseOffline } from "@/lib/db";
import { intlLocale } from "@/lib/format";

export const revalidate = 300;

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ category?: string }>;
};

export async function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata(
  props: {
    params: Promise<{ locale: string }>;
  }
): Promise<Metadata> {
  const params = await props.params;

  const {
    locale
  } = params;

  const t = await getTranslations({ locale, namespace: "news" });

  return {
    title: t("title"),
    description: t("subtitle"),
    alternates: {
      canonical: `${siteConfig.url}/${locale}/news`,
      languages: Object.fromEntries(
        locales.map((l) => [l, `${siteConfig.url}/${l}/news`]),
      ),
    },
  };
}

export default async function NewsPage(props: Props) {
  const searchParams = await props.searchParams;
  const params = await props.params;

  const {
    locale
  } = params;

  setRequestLocale(locale);

  const category = searchParams.category;

  const [t, articles, categories] = await Promise.all([
    getTranslations("news"),
    getPublishedArticles(locale, { category }),
    getArticleCategories(),
  ]);

  const dateFormat = new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const [lead, ...rest] = articles;

  return (
    <>
      {/* ── Header ───────────────────────────────────────────────────── */}
      <section className="container-luxe pb-4 pt-28 sm:pt-36">
        <Reveal>
          <p className="eyebrow">{t("eyebrow")}</p>
          <h1 className="mt-3 max-w-2xl text-4xl font-light text-primary sm:text-5xl">
            {t("title")}
          </h1>
          <p className="mt-6 max-w-lg text-sm leading-relaxed text-ink/70 sm:text-base">
            {t("subtitle")}
          </p>
        </Reveal>

        {categories.length > 0 && (
          <Reveal delay={0.1}>
            <nav aria-label={t("categoryFilter")} className="mt-9 flex flex-wrap gap-2">
              <Link
                href={`/${locale}/news`}
                aria-current={!category ? "page" : undefined}
                className={
                  !category
                    ? "rounded-full bg-primary px-4 py-1.5 text-xs font-medium uppercase tracking-wide text-white"
                    : "rounded-full border border-primary/15 px-4 py-1.5 text-xs font-medium uppercase tracking-wide text-ink/70 transition-colors hover:border-primary/40 hover:text-primary"
                }
              >
                {t("allCategories")}
              </Link>

              {categories.map((name) => (
                <Link
                  key={name}
                  href={`/${locale}/news?category=${encodeURIComponent(name)}`}
                  aria-current={category === name ? "page" : undefined}
                  className={
                    category === name
                      ? "rounded-full bg-primary px-4 py-1.5 text-xs font-medium uppercase tracking-wide text-white"
                      : "rounded-full border border-primary/15 px-4 py-1.5 text-xs font-medium uppercase tracking-wide text-ink/70 transition-colors hover:border-primary/40 hover:text-primary"
                  }
                >
                  {name}
                </Link>
              ))}
            </nav>
          </Reveal>
        )}
      </section>

      {/* ── Articles ─────────────────────────────────────────────────── */}
      <section className="container-luxe py-14 sm:py-20">
        {isDatabaseOffline() && <DbOfflineNotice />}

        {articles.length === 0 ? (
          <p className="border border-dashed border-primary/15 bg-white/50 p-12 text-center text-sm text-ink/65">
            {category ? t("emptyCategory") : t("empty")}
          </p>
        ) : (
          <>
            {/* Lead story — the newest article gets the wide treatment. */}
            <Reveal>
              <Link
                href={`/${locale}/news/${lead.slug}`}
                className="group grid gap-8 overflow-hidden rounded-sm border border-primary/10 bg-white shadow-card transition-shadow hover:shadow-lg lg:grid-cols-2"
              >
                <div className="relative aspect-video w-full overflow-hidden bg-primary/5 lg:self-start">
                  {lead.coverImageUrl && (
                    <ImageWithSkeleton
                      src={lead.coverImageUrl}
                      alt={lead.title}
                      fill
                      priority
                      sizes="(max-width: 1024px) 100vw, 50vw"
                      className="object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                  )}
                </div>

                <div className="flex flex-col justify-center p-6 sm:p-10">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink/65">
                    {lead.category && (
                      <span className="text-accent-700">{lead.category}</span>
                    )}
                    {lead.publishedAt && (
                      <time
                        dateTime={lead.publishedAt.toISOString()}
                        className="flex items-center gap-1.5"
                      >
                        <CalendarDays size={12} aria-hidden />
                        {dateFormat.format(lead.publishedAt)}
                      </time>
                    )}
                  </div>

                  <h2 className="mt-3 text-2xl font-light leading-snug text-primary sm:text-3xl">
                    {lead.title}
                  </h2>
                  <p className="mt-4 line-clamp-3 text-sm leading-relaxed text-ink/70">
                    {lead.excerpt}
                  </p>

                  <span className="mt-7 inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-accent-700">
                    {t("readArticle")}
                    <ArrowRight
                      size={14}
                      className="transition-transform group-hover:translate-x-1"
                      aria-hidden
                    />
                  </span>
                </div>
              </Link>
            </Reveal>

            {rest.length > 0 && (
              <div className="mt-8 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
                {rest.map((article, index) => (
                  <Reveal key={article.id} delay={index * 0.08}>
                    <Link
                      href={`/${locale}/news/${article.slug}`}
                      className="group flex h-full flex-col overflow-hidden rounded-sm border border-primary/10 bg-white shadow-card transition-shadow hover:shadow-lg"
                    >
                      <div className="relative aspect-[16/10] w-full overflow-hidden bg-primary/5">
                        {article.coverImageUrl && (
                          <ImageWithSkeleton
                            src={article.coverImageUrl}
                            alt={article.title}
                            fill
                            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                            className="object-cover transition-transform duration-700 group-hover:scale-105"
                          />
                        )}
                      </div>

                      <div className="flex flex-1 flex-col p-6">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink/65">
                          {article.category && (
                            <span className="text-accent-700">{article.category}</span>
                          )}
                          {article.publishedAt && (
                            <time dateTime={article.publishedAt.toISOString()}>
                              {dateFormat.format(article.publishedAt)}
                            </time>
                          )}
                        </div>

                        <h2 className="mt-2 text-lg font-light leading-snug text-primary">
                          {article.title}
                        </h2>
                        <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-ink/70">
                          {article.excerpt}
                        </p>

                        <span className="mt-auto pt-5 inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-accent-700">
                          {t("readArticle")}
                          <ArrowRight
                            size={14}
                            className="transition-transform group-hover:translate-x-1"
                            aria-hidden
                          />
                        </span>
                      </div>
                    </Link>
                  </Reveal>
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}
