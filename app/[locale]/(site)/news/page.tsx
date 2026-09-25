/**
 * app/[locale]/(site)/news/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The newsroom index (Newsroom.dc.html).
 *
 * Category, search and page all live in the query string rather than in
 * nested routes: a filtered view is then a link somebody can send, and none
 * of it mints a second set of indexable pages duplicating this one's
 * content.
 *
 * THE LEAD STORY IS THE NEWEST ONE, NOT A CHOSEN ONE
 *
 * There is no "featured" flag on NewsArticle and this page does not invent
 * one — the wide card at the top is simply the first article of the first
 * page, which is the newest thing published. It is labelled "featured"
 * because that is what it looks like, and it stops being wide from page two
 * onward, where "the newest" no longer means anything.
 *
 * The visible breadcrumb and the JSON-LD one are built from the same array,
 * so the trail a person reads and the trail Google reads cannot drift.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { Metadata } from "next";
import ImageWithSkeleton from "@/components/ImageWithSkeleton";
import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import Reveal from "@/components/Reveal";
import DbOfflineNotice from "@/components/DbOfflineNotice";
import NewsSearch from "@/components/NewsSearch";
import { localizedAlternates, breadcrumbList, trailFor } from "@/lib/seo";
import Breadcrumb from "@/components/Breadcrumb";
import JsonLd from "@/components/JsonLd";
import { getArticleCategories, getPublishedArticlePage } from "@/lib/news";
import { isDatabaseOffline } from "@/lib/db";
import { intlLocale } from "@/lib/format";

export const revalidate = 300;

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ category?: string; q?: string; page?: string }>;
};

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;

  const t = await getTranslations({ locale, namespace: "news" });

  return {
    title: t("title"),
    description: t("subtitle"),
    alternates: localizedAlternates(locale, "/news"),
  };
}

export default async function NewsPage(props: Props) {
  const [{ locale }, searchParams] = await Promise.all([props.params, props.searchParams]);

  setRequestLocale(locale);

  const category = searchParams.category;
  const search = searchParams.q?.trim() ?? "";
  const requestedPage = Number(searchParams.page);

  const [t, tNav, page, categories] = await Promise.all([
    getTranslations("news"),
    getTranslations("nav"),
    getPublishedArticlePage(locale, {
      category,
      search,
      page: Number.isFinite(requestedPage) ? requestedPage : 1,
    }),
    getArticleCategories(),
  ]);

  const dateFormat = new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // One array for the trail a visitor reads and the one Google reads.
  const trail = trailFor(locale, [
    { name: tNav("home"), path: "" },
    { name: tNav("news"), path: "/news" },
  ]);

  /** Every filter but the one being changed, so chips and pages compose. */
  const hrefWith = (changes: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = { category, q: search || undefined, ...changes };

    for (const [key, value] of Object.entries(merged)) {
      if (value) params.set(key, value);
    }

    const query = params.toString();
    return `/${locale}/news${query ? `?${query}` : ""}`;
  };

  const chipClass = (active: boolean) =>
    active
      ? "rounded-full bg-primary px-4 py-1.5 text-xs font-medium uppercase tracking-wide text-white"
      : "rounded-full border border-primary/15 bg-white px-4 py-1.5 text-xs font-medium uppercase tracking-wide text-ink/70 transition-colors hover:border-primary/40 hover:text-primary";

  // The wide treatment only makes sense where "newest" does: page one, and
  // only when there is something behind it to be the lead of.
  const isLeadPage = page.page === 1 && page.articles.length > 1;
  const [lead, ...rest] = page.articles;
  const gridArticles = isLeadPage ? rest : page.articles;

  return (
    <>
      <JsonLd id="breadcrumb-schema" data={breadcrumbList(trail)} />

      {/* ── Header ───────────────────────────────────────────────────── */}
      <section className="border-b border-primary/10 bg-white">
        <div className="container-luxe pb-6 pt-28 sm:pt-32">
          <Reveal>
            <Breadcrumb items={trail} />

            {/* Title left, standfirst right — the standfirst is a caption on
                the section, not the first thing to read, so it sits beside
                the heading rather than under it. Stacks below `lg`. */}
            <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end lg:gap-16">
              <div>
                <p className="eyebrow">{t("eyebrow")}</p>
                <h1 className="mt-2 text-4xl font-light text-primary sm:text-5xl">{t("title")}</h1>
              </div>

              <p className="max-w-md text-sm leading-relaxed text-ink/70 lg:pb-2">
                {t("subtitle")}
              </p>
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
              <nav aria-label={t("categoryFilter")} className="flex flex-wrap gap-2">
                <Link
                  href={hrefWith({ category: undefined, page: undefined })}
                  aria-current={!category ? "page" : undefined}
                  className={chipClass(!category)}
                >
                  {t("allCategories")}
                </Link>

                {categories.map((name) => (
                  <Link
                    key={name}
                    href={hrefWith({ category: name, page: undefined })}
                    aria-current={category === name ? "page" : undefined}
                    className={chipClass(category === name)}
                  >
                    {name}
                  </Link>
                ))}
              </nav>

              <NewsSearch
                locale={locale}
                activeSearch={search}
                labels={{ placeholder: t("searchPlaceholder"), clear: t("clearSearch") }}
              />
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Articles ─────────────────────────────────────────────────── */}
      <section className="bg-surface-muted/50 py-12 sm:py-16">
        <div className="container-luxe">
          {isDatabaseOffline() && <DbOfflineNotice />}

          {page.articles.length === 0 ? (
            <p className="border border-dashed border-primary/15 bg-white/60 p-12 text-center text-sm text-ink/65">
              {search ? t("emptySearch", { term: search }) : category ? t("emptyCategory") : t("empty")}
            </p>
          ) : (
            <>
              {isLeadPage && (
                <Reveal>
                  <Link
                    href={`/${locale}/news/${lead.slug}`}
                    className="group grid overflow-hidden rounded-xs bg-white shadow-card transition-shadow hover:shadow-lg lg:grid-cols-[1.05fr_1fr]"
                  >
                    <div className="relative aspect-16/10 w-full overflow-hidden bg-primary/5 lg:aspect-auto lg:min-h-[340px]">
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

                      <span className="absolute left-4 top-4 rounded-full bg-accent-50/95 px-3 py-1 text-[10px] font-medium uppercase tracking-widest text-accent-700">
                        {t("featured")}
                      </span>
                    </div>

                    <div className="flex flex-col justify-center p-7 sm:p-10">
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-ink/60">
                        {lead.category && (
                          <span className="font-medium uppercase tracking-wide text-accent-700">
                            {lead.category}
                          </span>
                        )}
                        {lead.publishedAt && (
                          <>
                            <span aria-hidden className="text-ink/30">
                              •
                            </span>
                            <time dateTime={lead.publishedAt.toISOString()}>
                              {dateFormat.format(lead.publishedAt)}
                            </time>
                          </>
                        )}
                        {lead.readingMinutes > 0 && (
                          <>
                            <span aria-hidden className="text-ink/30">
                              •
                            </span>
                            <span>{t("readingTime", { minutes: lead.readingMinutes })}</span>
                          </>
                        )}
                      </div>

                      <h2 className="mt-3 text-2xl font-light leading-snug text-primary sm:text-3xl">
                        {lead.title}
                      </h2>
                      <p className="mt-4 line-clamp-3 text-sm leading-relaxed text-ink/70">
                        {lead.excerpt}
                      </p>

                      <span className="mt-7 inline-flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-accent-700">
                        {t("readLead")}
                        <ArrowRight
                          size={14}
                          className="transition-transform group-hover:translate-x-1"
                          aria-hidden
                        />
                      </span>
                    </div>
                  </Link>
                </Reveal>
              )}

              {gridArticles.length > 0 && (
                <div
                  className={`grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 ${
                    isLeadPage ? "mt-6" : ""
                  }`}
                >
                  {gridArticles.map((article, index) => (
                    <Reveal key={article.id} delay={index * 0.06}>
                      <Link
                        href={`/${locale}/news/${article.slug}`}
                        className="group flex h-full flex-col overflow-hidden rounded-xs bg-white shadow-card transition-shadow hover:shadow-lg"
                      >
                        <div className="relative aspect-16/10 w-full overflow-hidden bg-primary/5">
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
                          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-ink/60">
                            {article.category && (
                              <span className="font-medium uppercase tracking-wide text-accent-700">
                                {article.category}
                              </span>
                            )}
                            {article.category && article.publishedAt && (
                              <span aria-hidden className="text-ink/30">
                                •
                              </span>
                            )}
                            {article.publishedAt && (
                              <time dateTime={article.publishedAt.toISOString()}>
                                {dateFormat.format(article.publishedAt)}
                              </time>
                            )}
                          </div>

                          <h2 className="mt-2.5 text-lg font-light leading-snug text-primary">
                            {article.title}
                          </h2>
                          <p className="mt-2.5 line-clamp-2 text-sm leading-relaxed text-ink/70">
                            {article.excerpt}
                          </p>

                          <span className="mt-auto inline-flex items-center gap-2 pt-5 text-xs font-medium uppercase tracking-widest text-accent-700">
                            {t("read")}
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

              {/* Plain links, no client JavaScript: every page of this index
                  is a real URL a crawler can follow, which is how the
                  articles past the first seven get found at all. */}
              {page.pageCount > 1 && (
                <nav aria-label={t("pagination")} className="mt-12 flex justify-center">
                  <ol className="flex items-center gap-2">
                    <li>
                      <PageArrow
                        href={hrefWith({ page: String(page.page - 1) })}
                        disabled={page.page === 1}
                        label={t("previousPage")}
                        direction="previous"
                      />
                    </li>

                    {Array.from({ length: page.pageCount }, (_, index) => index + 1).map(
                      (number) => (
                        <li key={number}>
                          <Link
                            href={hrefWith({ page: number === 1 ? undefined : String(number) })}
                            aria-current={number === page.page ? "page" : undefined}
                            className={
                              number === page.page
                                ? "flex h-9 w-9 items-center justify-center rounded-xs bg-primary text-sm font-medium text-white"
                                : "flex h-9 w-9 items-center justify-center rounded-xs border border-primary/15 bg-white text-sm text-ink/70 transition-colors hover:border-primary/40 hover:text-primary"
                            }
                          >
                            {number}
                          </Link>
                        </li>
                      ),
                    )}

                    <li>
                      <PageArrow
                        href={hrefWith({ page: String(page.page + 1) })}
                        disabled={page.page === page.pageCount}
                        label={t("nextPage")}
                        direction="next"
                      />
                    </li>
                  </ol>
                </nav>
              )}
            </>
          )}
        </div>
      </section>
    </>
  );
}

/**
 * A pagination arrow. Rendered as a disabled <span> at either end rather
 * than a link to a page that does not exist — a crawler following it would
 * be handed the same page under a different URL.
 */
function PageArrow({
  href,
  disabled,
  label,
  direction,
}: {
  href: string;
  disabled: boolean;
  label: string;
  direction: "previous" | "next";
}) {
  const Icon = direction === "previous" ? ChevronLeft : ChevronRight;
  const shape = "flex h-9 w-9 items-center justify-center rounded-xs border";

  if (disabled) {
    return (
      <span aria-hidden className={`${shape} border-primary/10 bg-white text-ink/25`}>
        <Icon size={15} />
      </span>
    );
  }

  return (
    <Link
      href={href}
      aria-label={label}
      className={`${shape} border-primary/15 bg-white text-ink/70 transition-colors hover:border-primary/40 hover:text-primary`}
    >
      <Icon size={15} aria-hidden />
    </Link>
  );
}
