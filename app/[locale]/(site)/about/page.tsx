/**
 * app/[locale]/(site)/about/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * About — story, working principles, numbers, timeline, team.
 *
 * The stats bar is computed from the database rather than hardcoded. A
 * developer's credibility page claiming "3 developments" while /projects
 * lists five is the kind of inconsistency a serious buyer notices, and it
 * costs nothing to derive the figure from the same source the listing uses.
 *
 * The Milestones timeline is real project history (content/company-timeline.ts),
 * not editorial copy — see that file's header for why it's plain data
 * rather than an i18n message, and why COMPANY_FOUNDED_YEAR (2005) is also
 * what the "years of experience" stat above is computed from.
 *
 * Everything else is editorial copy and lives in messages/*.json.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getTranslations, unstable_setRequestLocale } from "next-intl/server";
import { Eye, HeartHandshake, ShieldCheck } from "lucide-react";
import Reveal from "@/components/Reveal";
import StatBar from "@/components/StatBar";
import { siteConfig } from "@/config/site";
import { team } from "@/config/team";
import { locales } from "@/i18n";
import { getPublishedProjects } from "@/lib/projects";
import { getCompanyProfile } from "@/lib/company";
import { formatNumber, formatYear } from "@/lib/format";
import { COMPANY_FOUNDED_YEAR, COMPANY_TIMELINE } from "@/content/company-timeline";

export const revalidate = 3600;

type Props = { params: { locale: string } };

const PRINCIPLES = [
  { key: "quality", icon: ShieldCheck },
  { key: "transparency", icon: Eye },
  { key: "longTerm", icon: HeartHandshake },
] as const;

export async function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params: { locale },
}: Props): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "about" });

  return {
    title: t("title"),
    description: t("subtitle"),
    alternates: {
      canonical: `${siteConfig.url}/${locale}/about`,
      languages: Object.fromEntries(
        locales.map((l) => [l, `${siteConfig.url}/${l}/about`]),
      ),
    },
  };
}

export default async function AboutPage({ params: { locale } }: Props) {
  unstable_setRequestLocale(locale);

  const [t, projects, companyProfile] = await Promise.all([
    getTranslations("about"),
    getPublishedProjects(locale),
    getCompanyProfile(locale),
  ]);

  // CompanyProfile.aboutUsEn/Th (from the Sale Kit's shared "About Us" text,
  // seeded once and reused everywhere — see lib/company.ts) replaces the
  // static story.body translation once seeded. Falls back to the existing
  // static copy so the section never renders blank on a fresh clone that
  // hasn't run prisma:seed yet.
  const storyBody = companyProfile?.aboutUs || t("story.body");

  // Derived from live data, so the page cannot contradict /projects.
  const totalUnits = projects.reduce((sum, p) => sum + (p.totalUnits ?? 0), 0);
  const totalLand = projects.reduce((sum, p) => sum + (p.landAreaSqm ?? 0), 0);
  const years = Math.max(1, new Date().getFullYear() - COMPANY_FOUNDED_YEAR);

  const stats = [
    { label: t("stats.projects"), value: formatNumber(locale, projects.length) },
    { label: t("stats.units"), value: formatNumber(locale, totalUnits) },
    { label: t("stats.landArea"), value: formatNumber(locale, Math.round(totalLand)) },
    { label: t("stats.years"), value: `${formatNumber(locale, years)}+` },
  ];

  const localeKey = locale === "th" ? "th" : "en";

  return (
    <>
      {/* ── Header ───────────────────────────────────────────────────── */}
      <section className="container-luxe pb-4 pt-28 sm:pt-36">
        <Reveal>
          <p className="eyebrow">{t("eyebrow")}</p>
          <h1 className="mt-3 max-w-2xl text-4xl font-light text-primary sm:text-5xl">
            {t("title")}
          </h1>
          <div className="horizon-divider my-6 ml-0" />
          <p className="max-w-lg text-sm leading-relaxed text-ink/70 sm:text-base">
            {t("subtitle")}
          </p>
        </Reveal>
      </section>

      {/* ── Story ────────────────────────────────────────────────────── */}
      <section className="container-luxe grid gap-10 py-16 sm:py-24 lg:grid-cols-2 lg:gap-16">
        <Reveal>
          <div className="relative aspect-[4/5] w-full overflow-hidden rounded-sm shadow-card">
            <Image
              src="https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=1200&q=80"
              alt=""
              fill
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover"
            />
          </div>
        </Reveal>

        <Reveal delay={0.15}>
          <div className="flex h-full flex-col justify-center">
            <p className="eyebrow">{t("story.eyebrow")}</p>
            <h2 className="mt-3 text-3xl font-light text-primary sm:text-4xl">
              {t("story.title")}
            </h2>
            <div className="horizon-divider my-6 ml-0" />
            {/* whitespace-pre-line keeps the paragraph breaks authored in
                the message file without needing markup in the JSON. */}
            <p className="max-w-lg whitespace-pre-line text-sm leading-relaxed text-ink/70 sm:text-base">
              {storyBody}
            </p>
          </div>
        </Reveal>
      </section>

      {/* ── Stats ────────────────────────────────────────────────────── */}
      <section className="container-luxe pb-16 sm:pb-24">
        <Reveal>
          <p className="eyebrow">{t("stats.eyebrow")}</p>
          <h2 className="mt-3 text-3xl font-light text-primary sm:text-4xl">
            {t("stats.title")}
          </h2>
        </Reveal>

        <Reveal delay={0.1} className="mt-8">
          <StatBar stats={stats} />
        </Reveal>
      </section>

      {/* ── Principles ───────────────────────────────────────────────── */}
      <section className="bg-primary-900/[0.03] py-20 sm:py-28">
        <div className="container-luxe">
          <Reveal>
            <p className="eyebrow">{t("mission.eyebrow")}</p>
            <h2 className="mt-3 text-3xl font-light text-primary sm:text-4xl">
              {t("mission.title")}
            </h2>
            <div className="horizon-divider my-6 ml-0" />
          </Reveal>

          <div className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-3">
            {PRINCIPLES.map(({ key, icon: Icon }, index) => (
              <Reveal key={key} delay={index * 0.1}>
                <div className="flex h-full flex-col border-t-2 border-accent bg-white p-7 shadow-card">
                  <Icon size={24} strokeWidth={1.5} className="text-accent-700" aria-hidden />
                  <h3 className="mt-5 text-lg font-light text-primary">
                    {t(`mission.${key}.title` as never)}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-ink/70">
                    {t(`mission.${key}.body` as never)}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Timeline ─────────────────────────────────────────────────── */}
      <section className="container-luxe py-20 sm:py-28">
        <Reveal>
          <p className="eyebrow">{t("timeline.eyebrow")}</p>
          <h2 className="mt-3 text-3xl font-light text-primary sm:text-4xl">
            {t("timeline.title")}
          </h2>
        </Reveal>

        {/* Real project history (content/company-timeline.ts), transcribed
            from the company's own portfolio graphic — one entry per year,
            one or more project names each. Text-only by request: no
            photos, no per-project admin CRUD, since project names are
            proper nouns that don't need translation. The origin marker
            (COMPANY_FOUNDED_YEAR) leads the flow and is the same figure
            that drives the "years of experience" stat above, so the two
            numbers on this page can never contradict each other.

            13 entries as one long single-column rail read as a lot of
            empty space beside a thin strip of text on desktop. CSS multi-
            column flow (not a grid — entry heights vary a lot, from a
            single project to five) reads top-to-bottom then wraps into the
            next column, so the container's full width gets used on large
            screens while narrow screens keep the original single strip.
            Each entry carries its own short marker + rule rather than one
            continuous rail, since a rule can no longer span the whole list
            once it's split across columns. */}
        <ol className="mt-12 columns-1 gap-x-14 sm:columns-2 lg:columns-3 lg:gap-x-16">
          <li className="mb-10 break-inside-avoid">
            <Reveal>
              <div className="relative border-l border-primary/15 py-0.5 pl-8">
                <span
                  aria-hidden
                  className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full bg-accent ring-4 ring-surface"
                />
                <p className="text-sm font-medium tracking-wide text-accent-700">
                  {formatYear(COMPANY_FOUNDED_YEAR)}
                </p>
                <h3 className="mt-1.5 text-lg font-light text-primary">
                  {t("timeline.origin")}
                </h3>
              </div>
            </Reveal>
          </li>

          {COMPANY_TIMELINE.map((entry, index) => (
            <li key={entry.year} className="mb-10 break-inside-avoid">
              <Reveal delay={Math.min(index + 1, 6) * 0.05}>
                <div className="relative border-l border-primary/15 py-0.5 pl-8">
                  <span
                    aria-hidden
                    className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full bg-accent ring-4 ring-surface"
                  />

                  <p className="text-sm font-medium tracking-wide text-accent-700">
                    {formatYear(entry.year)}
                  </p>
                  <ul className="mt-1.5 space-y-1.5">
                    {entry.projects.map((project) => (
                      <li key={project.name} className="text-base font-light text-primary">
                        {project.name}
                        {project.brand && (
                          <span className="ml-2 text-xs font-normal text-ink/50">
                            {t("timeline.byBrand", { brand: project.brand })}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            </li>
          ))}
        </ol>
      </section>

      {/* ── Team ─────────────────────────────────────────────────────── */}
      <section className="bg-primary-900/[0.03] py-20 sm:py-28">
        <div className="container-luxe">
          <Reveal>
            <p className="eyebrow">{t("team.eyebrow")}</p>
            <h2 className="mt-3 max-w-lg text-3xl font-light text-primary sm:text-4xl">
              {t("team.title")}
            </h2>
            <div className="horizon-divider my-6 ml-0" />
            <p className="max-w-lg text-sm leading-relaxed text-ink/70">
              {t("team.subtitle")}
            </p>
          </Reveal>

          <div className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {team.map((member, index) => (
              <Reveal key={member.key} delay={index * 0.08}>
                <figure className="flex h-full flex-col overflow-hidden rounded-sm border border-primary/10 bg-white shadow-card">
                  <div className="relative aspect-[3/4] w-full overflow-hidden bg-primary/5">
                    <Image
                      src={member.imageUrl}
                      alt={member.name[localeKey]}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                      className="object-cover"
                    />
                  </div>

                  <figcaption className="flex flex-1 flex-col p-6">
                    <p className="text-base font-medium text-primary">
                      {member.name[localeKey]}
                    </p>
                    <p className="mt-0.5 text-xs uppercase tracking-wide text-accent-700">
                      {member.role[localeKey]}
                    </p>
                    <p className="mt-3 text-sm leading-relaxed text-ink/70">
                      {member.focus[localeKey]}
                    </p>
                  </figcaption>
                </figure>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────── */}
      <section className="container-luxe py-20 sm:py-28">
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-light text-primary sm:text-3xl">
              {t("cta.title")}
            </h2>
            <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-ink/70">
              {t("cta.body")}
            </p>
            <Link href={`/${locale}/contact`} className="btn-primary mt-8 inline-flex">
              {t("cta.button")}
            </Link>
          </div>
        </Reveal>
      </section>
    </>
  );
}
