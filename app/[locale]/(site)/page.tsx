/**
 * app/[locale]/(site)/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Homepage.
 *
 * Every data-driven section hides itself when it has nothing to show. A
 * luxury developer's front page with an empty "Latest news" panel reads as
 * a site nobody maintains — worse than the section simply not being there.
 * That is why each block is inside a `length > 0` guard rather than
 * rendering an empty state.
 *
 * The hero image is the lead project's own photograph, so uploading a new
 * hero in the admin changes the front page without a code deploy. The
 * fallback only appears on a fresh database.
 *
 * Section order/visibility below the hero is admin-editable — see
 * /admin/pages/home/sections and lib/home-sections.ts. Every section still hides
 * itself on empty data exactly as before; the admin only controls WHICH
 * of the always-safe-to-render sections appear and in what order. The
 * hero carousel and the closing CTA are not part of that list — see the
 * comment on HOME_SECTION_KEYS for why.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { Metadata } from "next";
import { Fragment } from "react";
import ImageWithSkeleton from "@/components/ImageWithSkeleton";
import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  ArrowRight,
  CalendarDays,
  Eye,
  HandHeart,
  HardHat,
  HeartHandshake,
  MapPin,
  Mountain,
  ShieldCheck,
  Users,
} from "lucide-react";
import Reveal from "@/components/Reveal";
import DbOfflineNotice from "@/components/DbOfflineNotice";
import FeaturedProjectCard from "@/components/FeaturedProjectCard";
import HeroCarousel from "@/components/HeroCarousel";
import AwardsSection from "@/components/AwardsSection";
import CompanyIntro from "@/components/CompanyIntro";
import Corporate from "@/components/Corporate";
import VisionMission from "@/components/VisionMission";
import FaqAccordion from "@/components/FaqAccordion";
import { siteConfig } from "@/config/site";
import type { Locale } from "@/i18n";
import { localizedAlternates } from "@/lib/seo";
import { getPublishedProjects } from "@/lib/projects";
import { getPublishedArticles } from "@/lib/news";
import { getPublishedEvents } from "@/lib/events";
import { getFaqs } from "@/lib/faqs";
import { getHeroStorySlides } from "@/lib/hero-story";
import { getSiteSettings } from "@/lib/settings";
import { getWhyUsPoints } from "@/lib/home-content";
import { getOrderedVisibleSectionKeys, type HomeSectionKey } from "@/lib/home-sections";
import { isDatabaseOffline } from "@/lib/db";
import { intlLocale } from "@/lib/format";
import { projectCtaKey, projectSignalLabel } from "@/lib/project-card-labels";
import type { SectionIcon } from "@prisma/client";

/*
  One hour.

  The home page reads five tables, and its content changes on the order of
  weeks. Every admin write calls revalidatePath, so an edit still appears
  immediately — this window is the backstop, not the mechanism.
*/
export const revalidate = 3600;

type Props = { params: Promise<{ locale: string }> };

/**
 * Used only when no published project has a hero image yet — a fresh
 * database, or one the site cannot reach.
 *
 * A local photograph of an actual development rather than the Unsplash URL
 * this used to be. The two moments it renders are a first deploy and an
 * outage, which are precisely the moments a stranger's house on the
 * homepage of a property developer is least affordable.
 */
const FALLBACK_HERO = "/corporate/development-exterior.webp";

/**
 * Every icon a WhyUsPoint row can pick (see the SectionIcon enum in
 * schema.prisma) — not just the four the section happened to use when
 * this was still a hardcoded WHY_POINTS array. /admin/pages/about/why-us's icon
 * picker offers all six, so this map has to resolve all six.
 */
const WHY_US_ICONS: Record<SectionIcon, typeof Mountain> = {
  MOUNTAIN: Mountain,
  SHIELD_CHECK: ShieldCheck,
  HARD_HAT: HardHat,
  HAND_HEART: HandHeart,
  EYE: Eye,
  HEART_HANDSHAKE: HeartHandshake,
};

// Nothing is prerendered at build (see app/[locale]/layout.tsx). The empty
// array — rather than no function at all — is what keeps this route
// ISR-cached: with none, Next renders it on every request.
export function generateStaticParams() {
  return [];
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params;

  const {
    locale
  } = params;

  const resolvedLocale = locale as Locale;

  /*
    The same admin-editable values the root layout reads (lib/settings.ts),
    resolved the same defensive way. This page cannot simply inherit them:
    it overrides `title` to escape the "%s | …" template, and an override
    that read config/site.ts directly would leave the site's single most
    important page as the only one ignoring the setting.
  */
  const { seo } = await getSiteSettings();

  return {
    // The layout already sets a default title; the homepage should use it
    // verbatim rather than running through the "%s | …" template.
    title: {
      absolute: seo.metaTitle[resolvedLocale] ?? seo.metaTitle.en,
    },
    description: seo.metaDescription[resolvedLocale] ?? seo.metaDescription.en,
    alternates: localizedAlternates(locale, ""),
  };
}

export default async function HomePage(props: Props) {
  const params = await props.params;

  const {
    locale
  } = params;

  setRequestLocale(locale);

  const [
    t,
    tProjects,
    projects,
    articles,
    events,
    faqs,
    heroSlides,
    settings,
    whyUsPoints,
    sectionKeys,
  ] = await Promise.all([
    getTranslations("home"),
    getTranslations("projects"),
    getPublishedProjects(locale),
    getPublishedArticles(locale, { take: 3 }),
    getPublishedEvents(locale),
    getFaqs(locale, { take: 8 }),
    getHeroStorySlides(locale),
    getSiteSettings(),
    getWhyUsPoints(locale),
    getOrderedVisibleSectionKeys(),
  ]);

  const featured = projects.slice(0, 3);
  const heroImage = featured.find((p) => p.heroImageUrl)?.heroImageUrl ?? FALLBACK_HERO;
  const nextEvent = events.upcoming[0];

  const dateFormat = new Intl.DateTimeFormat(intlLocale(locale), {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const shortDate = new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  /*
    One renderer per manageable key (see HOME_SECTION_KEYS in
    lib/home-sections.ts). Every section's own empty-data guard is
    preserved exactly as it was before this was extracted — the admin only
    controls order/visibility among sections that already have something
    to show; it can't force an empty section to render.
  */
  const SECTION_RENDERERS: Record<HomeSectionKey, () => React.ReactNode> = {
    COMPANY_INTRO: () => <CompanyIntro />,

    VISION_MISSION: () => <VisionMission />,

    FEATURED_PROJECTS: () =>
      featured.length > 0 && (
        <section className="container-luxe py-20 sm:py-28">
          <Reveal>
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <p className="eyebrow">{t("featured.eyebrow")}</p>
                <h2 className="mt-3 max-w-lg text-3xl font-light text-primary sm:text-4xl">
                  {t("featured.title")}
                </h2>
              </div>

              <Link
                href={`/${locale}/projects`}
                className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-accent-700 transition-colors hover:text-accent-800"
              >
                {t("featured.viewAll")}
                <ArrowRight size={14} aria-hidden />
              </Link>
            </div>

          </Reveal>

          <div className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((project, index) => (
              <Reveal key={project.id} delay={index * 0.1}>
                <FeaturedProjectCard
                  project={project}
                  locale={locale}
                  labels={{
                    status: tProjects(`status.${project.status}` as never),
                    cta: tProjects(projectCtaKey(project.status) as never),
                    specVillas: tProjects("specs.villas"),
                    specBedrooms: tProjects("specs.bedrooms"),
                    specLand: tProjects("specs.land"),
                    signal: projectSignalLabel(project.signal, tProjects as never, locale),
                  }}
                />
              </Reveal>
            ))}
          </div>
        </section>
      ),

    CORPORATE: () => <Corporate />,

    AWARDS: () => <AwardsSection />,

    WHY_US: () =>
      whyUsPoints.length > 0 && (
        <section className="bg-primary-900/3 py-20 sm:py-28">
          <div className="container-luxe">
            <Reveal>
              <p className="eyebrow">{t("why.eyebrow")}</p>
              <h2 className="mt-3 max-w-2xl text-3xl font-light text-primary sm:text-4xl">
                {t("why.title")}
              </h2>
              <p className="mt-6 max-w-xl text-sm leading-relaxed text-ink/70 sm:text-base">
                {t("why.subtitle")}
              </p>
            </Reveal>

            <div className="mt-14 grid grid-cols-1 gap-px overflow-hidden rounded-xs border border-primary/10 bg-primary/10 sm:grid-cols-2 lg:grid-cols-4">
              {whyUsPoints.map((point, index) => {
                const Icon = WHY_US_ICONS[point.icon];

                return (
                  <Reveal key={point.id} delay={index * 0.08}>
                    <div className="flex h-full flex-col bg-white p-7">
                      <Icon
                        size={24}
                        strokeWidth={1.5}
                        className="text-accent-700"
                        aria-hidden
                      />
                      <h3 className="mt-5 text-base font-medium text-primary">
                        {point.title}
                      </h3>
                      <p className="mt-3 text-sm leading-relaxed text-ink/70">
                        {point.body}
                      </p>
                    </div>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>
      ),

    UPCOMING_EVENT: () =>
      nextEvent && (
        <section className="container-luxe py-20 sm:py-24">
          <Reveal>
            <Link
              href={`/${locale}/events/${nextEvent.slug}`}
              className="group grid overflow-hidden rounded-xs border border-primary/10 bg-white shadow-card transition-shadow hover:shadow-lg lg:grid-cols-[1.1fr_1fr]"
            >
              <div className="relative aspect-video w-full overflow-hidden bg-primary/5 lg:aspect-auto lg:h-full">
                {nextEvent.coverImageUrl && (
                  <ImageWithSkeleton
                    src={nextEvent.coverImageUrl}
                    alt={nextEvent.title}
                    fill
                    sizes="(max-width: 1024px) 100vw, 55vw"
                    className="object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                )}
              </div>

              <div className="flex flex-col justify-center p-8 sm:p-11">
                <p className="eyebrow">{t("event.eyebrow")}</p>

                <h2 className="mt-3 text-2xl font-light leading-snug text-primary sm:text-3xl">
                  {nextEvent.title}
                </h2>

                <dl className="mt-6 space-y-2.5 text-sm text-ink/70">
                  <div className="flex items-center gap-2.5">
                    <CalendarDays size={15} className="shrink-0 text-accent-700" aria-hidden />
                    <dd>
                      <time dateTime={nextEvent.startsAt.toISOString()}>
                        {dateFormat.format(nextEvent.startsAt)}
                      </time>
                    </dd>
                  </div>

                  {nextEvent.location && (
                    <div className="flex items-center gap-2.5">
                      <MapPin size={15} className="shrink-0 text-accent-700" aria-hidden />
                      <dd>{nextEvent.location}</dd>
                    </div>
                  )}

                  {nextEvent.seatsLeft !== null && (
                    <div className="flex items-center gap-2.5">
                      <Users size={15} className="shrink-0 text-accent-700" aria-hidden />
                      <dd>{t("event.seatsLeft", { count: nextEvent.seatsLeft })}</dd>
                    </div>
                  )}
                </dl>

                <span className="mt-8 inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-accent-700">
                  {t("event.reserve")}
                  <ArrowRight
                    size={14}
                    className="transition-transform group-hover:translate-x-1"
                    aria-hidden
                  />
                </span>
              </div>
            </Link>
          </Reveal>
        </section>
      ),

    LATEST_NEWS: () =>
      articles.length > 0 && (
        <section className="container-luxe py-20 sm:py-28">
          <Reveal>
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <p className="eyebrow">{t("news.eyebrow")}</p>
                <h2 className="mt-3 text-3xl font-light text-primary sm:text-4xl">
                  {t("news.title")}
                </h2>
              </div>

              <Link
                href={`/${locale}/news`}
                className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-accent-700 transition-colors hover:text-accent-800"
              >
                {t("news.viewAll")}
                <ArrowRight size={14} aria-hidden />
              </Link>
            </div>

          </Reveal>

          <div className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-3">
            {articles.map((article, index) => (
              <Reveal key={article.id} delay={index * 0.1}>
                <Link
                  href={`/${locale}/news/${article.slug}`}
                  className="group flex h-full flex-col overflow-hidden rounded-xs border border-primary/10 bg-white shadow-card transition-shadow hover:shadow-lg"
                >
                  <div className="relative aspect-16/10 w-full overflow-hidden bg-primary/5">
                    {article.coverImageUrl && (
                      <ImageWithSkeleton
                        src={article.coverImageUrl}
                        alt={article.title}
                        fill
                        sizes="(max-width: 640px) 100vw, 33vw"
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
                          {shortDate.format(article.publishedAt)}
                        </time>
                      )}
                    </div>

                    <h3 className="mt-2 text-lg font-light leading-snug text-primary">
                      {article.title}
                    </h3>
                    <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-ink/70">
                      {article.excerpt}
                    </p>
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>
        </section>
      ),

    // This accordion owns the FAQPage schema for the whole site: it
    // carries the full set, and Google honours only one per page.
    FAQ: () => (
      <FaqAccordion
        faqs={faqs}
        withSchema
        tone="muted"
        labels={{
          eyebrow: tProjects("faq.eyebrow"),
          title: tProjects("faq.title"),
          subtitle: tProjects("faq.subtitle"),
          categories: {
            ownership: tProjects("faq.categories.ownership"),
            payment: tProjects("faq.categories.payment"),
            construction: tProjects("faq.categories.construction"),
            aftercare: tProjects("faq.categories.aftercare"),
          },
        }}
      />
    ),
  };

  return (
    <>
      {/* ── Hero (carousel, falls back to a static hero when there are no
          active slides — see components/HeroCarousel.tsx) ──────────────── */}
      <HeroCarousel
        slides={heroSlides}
        fallback={{
          imageUrl: heroImage,
          eyebrow: t("hero.eyebrow"),
          title: t("hero.title"),
          subtitle: t("hero.subtitle"),
          ctaLabel: t("hero.cta"),
          ctaHref: `/${locale}/projects`,
          ctaSecondaryLabel: t("hero.ctaSecondary"),
          ctaSecondaryHref: `/${locale}/contact`,
        }}
        labels={{
          previousSlide: t("hero.storyBanner.previousSlide"),
          nextSlide: t("hero.storyBanner.nextSlide"),
        }}
        eyebrow={t("hero.eyebrow")}
        scrollLabel={t("hero.scroll")}
      />

      {isDatabaseOffline() && (
        <div className="container-luxe pt-10">
          <DbOfflineNotice />
        </div>
      )}

      {/* ── Admin-ordered sections (see /admin/pages/home/sections) ─────────── */}
      {sectionKeys.map((key) => (
        <Fragment key={key}>{SECTION_RENDERERS[key]()}</Fragment>
      ))}

    </>
  );
}

/**
 * The second badge's text, or null when the project has nothing to say.
 *
 * Formatted here rather than in the card so the numbers go through the
 * page's own translator once, and the card stays a component that renders
 * strings it is handed.
 */

/** An upcoming development has nothing to walk through yet — see the note
 *  on the CTA in components/FeaturedProjectCard.tsx. */
