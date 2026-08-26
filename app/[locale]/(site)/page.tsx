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
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getTranslations, unstable_setRequestLocale } from "next-intl/server";
import {
  ArrowRight,
  CalendarDays,
  HandHeart,
  HardHat,
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
import FaqAccordion from "@/components/FaqAccordion";
import { siteConfig } from "@/config/site";
import { locales, type Locale } from "@/i18n";
import { getPublishedProjects } from "@/lib/projects";
import { getPublishedArticles } from "@/lib/news";
import { getPublishedEvents } from "@/lib/events";
import { getFaqs } from "@/lib/faqs";
import { getHeroStorySlides } from "@/lib/hero-story";
import { getSiteSettings } from "@/lib/settings";
import { isDatabaseOffline } from "@/lib/db";
import { intlLocale } from "@/lib/format";

/*
  One hour.

  The home page reads five tables, and its content changes on the order of
  weeks. Every admin write calls revalidatePath, so an edit still appears
  immediately — this window is the backstop, not the mechanism.
*/
export const revalidate = 3600;

type Props = { params: { locale: string } };

/** Used only when no published project has a hero image yet. */
const FALLBACK_HERO =
  "https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=2000&q=80";

const WHY_POINTS = [
  { key: "land", icon: Mountain },
  { key: "privacy", icon: ShieldCheck },
  { key: "progress", icon: HardHat },
  { key: "aftercare", icon: HandHeart },
] as const;

export async function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params: { locale },
}: Props): Promise<Metadata> {
  const resolvedLocale = locale as Locale;

  return {
    // The layout already sets a default title; the homepage should use it
    // verbatim rather than running through the "%s | …" template.
    title: {
      absolute:
        siteConfig.seo.defaultTitle[resolvedLocale] ?? siteConfig.seo.defaultTitle.en,
    },
    description: siteConfig.description[resolvedLocale] ?? siteConfig.description.en,
    alternates: {
      canonical: `${siteConfig.url}/${locale}`,
      languages: Object.fromEntries(
        locales.map((l) => [l, `${siteConfig.url}/${l}`]),
      ),
    },
  };
}

export default async function HomePage({ params: { locale } }: Props) {
  unstable_setRequestLocale(locale);

  const [t, tProjects, tChat, projects, articles, events, faqs, heroSlides, settings] =
    await Promise.all([
      getTranslations("home"),
      getTranslations("projects"),
      getTranslations("chatButtons"),
      getPublishedProjects(locale),
      getPublishedArticles(locale, { take: 3 }),
      getPublishedEvents(locale),
      getFaqs(locale, { take: 8 }),
      getHeroStorySlides(locale),
      getSiteSettings(),
    ]);

  const featured = projects.slice(0, 3);
  const heroImage = featured.find((p) => p.heroImageUrl)?.heroImageUrl ?? FALLBACK_HERO;
  const nextEvent = events.upcoming[0];

  // Same wa.me construction as the site-wide floating chat button
  // (app/[locale]/(site)/layout.tsx) — this CTA used to link to LINE, which
  // the site no longer uses anywhere; WhatsApp is now the only chat channel.
  const waNumber = settings.contact.whatsapp.replace(/\D/g, "");
  const waGreeting = encodeURIComponent(tChat("whatsappGreeting"));
  const whatsappUrl = `https://wa.me/${waNumber}?text=${waGreeting}`;

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
        secondaryCta={{
          label: t("hero.ctaSecondary"),
          href: `/${locale}/contact`,
        }}
        labels={{
          previousSlide: t("hero.storyBanner.previousSlide"),
          nextSlide: t("hero.storyBanner.nextSlide"),
        }}
      />

      {isDatabaseOffline() && (
        <div className="container-luxe pt-10">
          <DbOfflineNotice />
        </div>
      )}

      {/* ── Featured projects ────────────────────────────────────────── */}
      {featured.length > 0 && (
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

            <div className="horizon-divider my-8 ml-0" />
          </Reveal>

          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((project, index) => (
              <Reveal key={project.id} delay={index * 0.1}>
                <FeaturedProjectCard
                  project={project}
                  locale={locale}
                  variant="compact"
                  labels={{
                    status: tProjects(`status.${project.status}` as never),
                    propertyType: tProjects(
                      `propertyType.${project.propertyType}` as never,
                    ),
                    cta: tProjects("viewProject"),
                  }}
                />
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {/* ── Awards ───────────────────────────────────────────────────── */}
      <AwardsSection />

      {/* ── Why us ───────────────────────────────────────────────────── */}
      <section className="bg-primary-900/[0.03] py-20 sm:py-28">
        <div className="container-luxe">
          <Reveal>
            <p className="eyebrow">{t("why.eyebrow")}</p>
            <h2 className="mt-3 max-w-2xl text-3xl font-light text-primary sm:text-4xl">
              {t("why.title")}
            </h2>
            <div className="horizon-divider my-6 ml-0" />
            <p className="max-w-xl text-sm leading-relaxed text-ink/70 sm:text-base">
              {t("why.subtitle")}
            </p>
          </Reveal>

          <div className="mt-14 grid grid-cols-1 gap-px overflow-hidden rounded-sm border border-primary/10 bg-primary/10 sm:grid-cols-2 lg:grid-cols-4">
            {WHY_POINTS.map(({ key, icon: Icon }, index) => (
              <Reveal key={key} delay={index * 0.08}>
                <div className="flex h-full flex-col bg-white p-7">
                  <Icon
                    size={24}
                    strokeWidth={1.5}
                    className="text-accent-700"
                    aria-hidden
                  />
                  <h3 className="mt-5 text-base font-medium text-primary">
                    {t(`why.${key}.title` as never)}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-ink/70">
                    {t(`why.${key}.body` as never)}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Upcoming event ───────────────────────────────────────────── */}
      {nextEvent && (
        <section className="container-luxe py-20 sm:py-24">
          <Reveal>
            <Link
              href={`/${locale}/events/${nextEvent.slug}`}
              className="group grid overflow-hidden rounded-sm border border-primary/10 bg-white shadow-card transition-shadow hover:shadow-lg lg:grid-cols-[1.1fr_1fr]"
            >
              <div className="relative aspect-[16/9] w-full overflow-hidden bg-primary/5 lg:aspect-auto lg:h-full">
                {nextEvent.coverImageUrl && (
                  <Image
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
      )}

      {/* ── Latest news ──────────────────────────────────────────────── */}
      {articles.length > 0 && (
        <section className="container-luxe pb-20 sm:pb-28">
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

            <div className="horizon-divider my-8 ml-0" />
          </Reveal>

          <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
            {articles.map((article, index) => (
              <Reveal key={article.id} delay={index * 0.1}>
                <Link
                  href={`/${locale}/news/${article.slug}`}
                  className="group flex h-full flex-col overflow-hidden rounded-sm border border-primary/10 bg-white shadow-card transition-shadow hover:shadow-lg"
                >
                  <div className="relative aspect-[16/10] w-full overflow-hidden bg-primary/5">
                    {article.coverImageUrl && (
                      <Image
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
      )}

      {/* ── FAQ ──────────────────────────────────────────────────────── */}
      {/* This accordion owns the FAQPage schema for the whole site: it
          carries the full set, and Google honours only one per page. */}
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

      {/* ── Final CTA ────────────────────────────────────────────────── */}
     <section className="relative bg-primary py-24 sm:py-32 text-white overflow-hidden">
  <div className="container-luxe max-w-3xl text-center relative z-10">
    <Reveal>
      {/* 1. Title / Eyebrow: ใช้ตัวพิมพ์ใหญ่และถ่างช่องไฟให้ดูหรูหรา */}
      {t("cta.eyebrow") && (
        <p className="mb-2 text-xs uppercase tracking-[0.2em] text-[#E2AD7F]">
          {t("cta.eyebrow")}
        </p>
      )}
      
      {/* ปรับ Title ให้คล้ายคำว่า "SPEAK TO US" ในภาพ */}
      <h2 className="text-sm sm:text-base uppercase tracking-[0.25em] text-[#E2AD7F] font-medium">
        {t("cta.title")}
      </h2>
      
      {/* 2. Divider: เส้นคั่นแบบไล่สี (Gradient) เส้นเล็กๆ ตรงกลาง */}
      <div className="w-20 h-[1px] mx-auto bg-gradient-to-r from-transparent via-[#E2AD7F]/70 to-transparent my-8 sm:my-10" />
      
      {/* 3. Subtitle: ปรับฟอนต์ให้บางลง (font-light) และเพิ่มขนาดเล็กน้อยให้อ่านง่าย */}
      <p className="mx-auto max-w-xl text-base leading-relaxed text-white/80 font-light sm:text-lg">
        {t("cta.subtitle")}
      </p>

      {/* 4. Buttons: ปรับปุ่มให้เป็นทรงเหลี่ยม (หรือมนน้อยที่สุด) ดูหนักแน่นและพรีเมียม */}
      <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6">
        <Link
          href={`/${locale}/contact`}
          className="w-full sm:w-auto px-10 py-4 bg-[#E2AD7F] text-primary text-sm uppercase tracking-widest font-medium hover:bg-[#d19b6e] transition-colors duration-300 text-center"
        >
          {t("cta.primary")}
        </Link>

        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full sm:w-auto px-10 py-4 border border-white/20 text-white text-sm uppercase tracking-widest font-medium hover:border-white/60 hover:bg-white/5 transition-all duration-300 text-center"
        >
          {t("cta.secondary")}
        </a>
      </div>
    </Reveal>
  </div>
</section>
    </>
  );
}
