/**
 * app/[locale]/(site)/about/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * About — story, working principles, numbers, timeline.
 *
 * The stats bar is computed from the database rather than hardcoded. A
 * developer's credibility page claiming "3 developments" while /projects
 * lists five is the kind of inconsistency a serious buyer notices, and it
 * costs nothing to derive the figure from the same source the listing uses.
 *
 * The Milestones timeline is real project history — see Milestone in
 * schema.prisma, lib/milestones.ts and /admin/pages/about/milestones. Only the
 * section's eyebrow/title/"START" chrome is editorial copy
 * (messages/*.json, `about.timeline`); year, project name and brand are
 * proper nouns and come from the database unmodified, same convention as
 * Award.organization/projectName.
 *
 * COMPANY_FOUNDED_YEAR (2005, content/company-timeline.ts) is what the
 * "years of experience" stat below is computed from — unrelated to the
 * timeline's row data now, but still the same single source of truth it
 * always was for that one number.
 *
 * Everything else is editorial copy and lives in messages/*.json.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { Metadata } from "next";
import ImageWithSkeleton from "@/components/ImageWithSkeleton";
import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  ArrowRight,
  Building2,
  Eye,
  HandHeart,
  HardHat,
  HeartHandshake,
  Mountain,
  ShieldCheck,
} from "lucide-react";
import Reveal from "@/components/Reveal";
import StatBar from "@/components/StatBar";
import DbOfflineNotice from "@/components/DbOfflineNotice";
import MilestonesScroller from "@/components/MilestonesScroller";
import { isDatabaseOffline } from "@/lib/db";
import { siteConfig } from "@/config/site";
import { locales } from "@/i18n";
import { localizedAlternates, breadcrumbList, trailFor } from "@/lib/seo";
import Breadcrumb from "@/components/Breadcrumb";
import JsonLd from "@/components/JsonLd";
import { getPublishedProjects } from "@/lib/projects";
import { getCompanyProfile } from "@/lib/company";
import { getMilestones } from "@/lib/milestones";
import { getMissionPrinciples } from "@/lib/mission-principles";
import { formatNumber, formatYear } from "@/lib/format";
import { COMPANY_FOUNDED_YEAR } from "@/content/company-timeline";
import type { SectionIcon } from "@prisma/client";

export const revalidate = 3600;

type Props = { params: Promise<{ locale: string }> };

/**
 * Every icon a MissionPrinciple row can pick (see the SectionIcon enum in
 * schema.prisma) — not just the three the section happened to use when
 * this was still a hardcoded PRINCIPLES array. /admin/pages/about/mission's icon
 * picker offers all six, so this map has to resolve all six.
 */
const MISSION_ICONS: Record<SectionIcon, typeof ShieldCheck> = {
  SHIELD_CHECK: ShieldCheck,
  EYE: Eye,
  HEART_HANDSHAKE: HeartHandshake,
  MOUNTAIN: Mountain,
  HARD_HAT: HardHat,
  HAND_HEART: HandHeart,
};

export async function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params;

  const {
    locale
  } = params;

  const t = await getTranslations({ locale, namespace: "about" });

  return {
    title: t("title"),
    description: t("subtitle"),
    alternates: localizedAlternates(locale, "/about"),
  };
}

export default async function AboutPage(props: Props) {
  const params = await props.params;

  const {
    locale
  } = params;

  setRequestLocale(locale);

  const [t, tNav, projects, companyProfile, milestones, principles] = await Promise.all([
    getTranslations("about"),
    getTranslations("nav"),
    getPublishedProjects(locale),
    getCompanyProfile(locale),
    getMilestones(),
    getMissionPrinciples(locale),
  ]);

  /*
    Adjacent-run grouping, not a second sort. lib/milestones.ts orders by
    year first, so two rows sharing a year are always next to each other
    here — this just finds where each run starts and how long it is, which
    is what lets one underline span a whole year's cards instead of the
    row drawing one under every card.
  */
  const milestoneGroups: { year: number; start: number; count: number }[] = [];
  for (const [index, milestone] of milestones.entries()) {
    const current = milestoneGroups[milestoneGroups.length - 1];
    if (current && current.year === milestone.year) current.count += 1;
    else milestoneGroups.push({ year: milestone.year, start: index, count: 1 });
  }

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

  // One array for the trail a visitor reads and the one Google reads.
  const trail = trailFor(locale, [
    { name: tNav("home"), path: "" },
    { name: tNav("about"), path: "/about" },
  ]);

  return (
    <>
      <JsonLd
        id="breadcrumb-schema"
        data={breadcrumbList(trail)}
      />
      {/* ── Header hero ──────────────────────────────────────────────── */}
      {/* Same full-bleed hero-with-scrim-and-breadcrumb treatment the
          project/event detail pages use (see components/Breadcrumb.tsx's
          tone="onImage", which exists for exactly this) — About did not
          have one before; it was the plain white header every listing
          page still uses. CompanyProfile.aboutHeroImageUrl
          (/admin/settings/company) is the source, alongside the existing
          storyImageUrl below — deliberately a different photo, since a
          fresh install showing the same picture twice one screen apart
          would look like a bug. */}
      <section className="relative flex h-[70vh] min-h-[480px] w-full items-end overflow-hidden sm:h-[80vh]">
        <ImageWithSkeleton
          src={companyProfile?.aboutHeroImageUrl || "/gallery/trinity-village/pool-garden.webp"}
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-linear-to-t from-primary-900/85 via-primary-900/20 to-primary-900/10" />

        <div className="container-luxe absolute inset-x-0 top-28 z-10 sm:top-32">
          <Breadcrumb items={trail} tone="onImage" />
        </div>

        {/* pb-28/pb-32, not the 16/20 a plain (non-overlapped) hero would
            use: the stat bar below pulls up -mt-14/-mt-16 over this
            section's bottom edge, and the subtitle's own line needs to
            clear that overlap with room to spare, or the floating card
            covers the last line of copy instead of just empty padding. */}
        <div className="container-luxe relative z-10 pb-28 sm:pb-32">
          <Reveal>
            <p className="eyebrow text-accent-200">{t("eyebrow")}</p>
            <h1 className="mt-3 max-w-2xl text-4xl font-light text-white sm:text-5xl">
              {t("title")}
            </h1>
            <p className="mt-6 max-w-lg text-sm leading-relaxed text-white/80 sm:text-base">
              {t("subtitle")}
            </p>
          </Reveal>
        </div>
      </section>

      {/* Development-only, like every other page that reads the database:
          during an outage the stat bar below claims zero projects and
          zero units, which is a very confident lie. */}
      {isDatabaseOffline() && (
        <div className="container-luxe pt-6">
          <DbOfflineNotice />
        </div>
      )}

      {/* ── Stats — overlapping the hero's bottom edge ──────────────────── */}
      {/* tone="elevated", not the default "plain": this is the same
          floating-card-over-a-photo treatment projects/[slug]/page.tsx and
          achievements/page.tsx already use for their own StatBar, via the
          negative top margin below. No heading here (unlike before) to
          match — the card reads as a continuation of the hero, not a new
          section with its own title. */}
      <section className="container-luxe relative z-10 -mt-14 sm:-mt-16">
        <Reveal>
          <StatBar stats={stats} tone="elevated" />
        </Reveal>
      </section>

      {/* ── Story ────────────────────────────────────────────────────── */}
      <section className="container-luxe grid gap-10 py-16 sm:py-24 lg:grid-cols-2 lg:gap-16">
        <Reveal>
          <div className="flex h-full flex-col justify-center">
            <p className="eyebrow">{companyProfile?.storyEyebrow ?? t("story.eyebrow")}</p>
            <h2 className="mt-3 text-3xl font-light text-primary sm:text-4xl">
              {companyProfile?.storyTitle ?? t("story.title")}
            </h2>
            {/* whitespace-pre-line keeps the paragraph breaks authored in
                the message file without needing markup in the JSON. */}
            <p className="mt-6 max-w-lg whitespace-pre-line text-sm leading-relaxed text-ink/70 sm:text-base">
              {storyBody}
            </p>
          </div>
        </Reveal>

        <Reveal delay={0.15}>
          <div className="relative aspect-4/5 w-full overflow-hidden rounded-xs shadow-card">
            {/* CompanyProfile.storyImageUrl (/admin/settings/company),
                defaulted to the Residence Prime facade this was hardcoded
                to before that field existed — never blank, unlike the
                homepage fallback, so every visitor to /about sees this
                company's own work.

                alt="" is deliberate and stays. The image accompanies the
                Story copy beside it rather than carrying information of
                its own, so announcing it would interrupt the narrative a
                screen-reader user is already being read. */}
            <ImageWithSkeleton
              src={companyProfile?.storyImageUrl || "/gallery/residence-prime/exterior-facade.webp"}
              alt=""
              fill
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover"
            />
          </div>
        </Reveal>
      </section>

      {/* ── Principles ───────────────────────────────────────────────── */}
      {principles.length > 0 && (
        <section className="bg-primary-900/3 py-20 sm:py-28">
          <div className="container-luxe">
            <Reveal>
              <p className="eyebrow">{t("mission.eyebrow")}</p>
              <h2 className="mt-3 text-3xl font-light text-primary sm:text-4xl">
                {t("mission.title")}
              </h2>
            </Reveal>

            <div className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-3">
              {principles.map((principle, index) => {
                const Icon = MISSION_ICONS[principle.icon];

                return (
                  <Reveal key={principle.id} delay={index * 0.1}>
                    <div className="flex h-full flex-col bg-white p-7 shadow-card">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-accent-700/30">
                        <Icon
                          size={20}
                          strokeWidth={1.5}
                          className="text-accent-700"
                          aria-hidden
                        />
                      </span>
                      <h3 className="mt-5 text-lg font-light text-primary">
                        {principle.title}
                      </h3>
                      {/* Short, fixed-width rule rather than the card's old
                          full-width border-t-2 — the accent now marks the
                          heading specifically, not the card as a whole. */}
                      <span aria-hidden className="mt-3 h-0.5 w-8 bg-accent-700" />
                      <p className="mt-4 text-sm leading-relaxed text-ink/70">
                        {principle.body}
                      </p>
                    </div>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ── Timeline ─────────────────────────────────────────────────── */}
      {/* Hidden rather than shown empty: a heading over nothing (every row
          soft-hidden, or a fresh clone before /admin/pages/about/milestones has any
          rows) reads as broken, not as "nothing to see yet". */}
      {milestones.length > 0 && (
        <section className="container-luxe py-20 sm:py-28">
          <Reveal>
            <p className="eyebrow">{t("timeline.eyebrow")}</p>
            <h2 className="mt-3 text-3xl font-light text-primary sm:text-4xl">
              {t("timeline.title")}
            </h2>
          </Reveal>

          <Reveal delay={0.05}>
            {/* "START" + a trailing dashed rule, then the founding line —
                the one thing on this page that still isn't a database row,
                since it isn't a project. formatYear(COMPANY_FOUNDED_YEAR) is
                the same figure the "years of experience" stat above is
                computed from, so the two can never contradict each other. */}
            <div className="mt-12 flex items-center gap-4">
              <span className="shrink-0 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                {t("timeline.start")}
              </span>
              <span
                aria-hidden
                className="h-px flex-1 border-t border-dashed border-primary/25"
              />
            </div>
            <p className="mt-2 text-xs text-ink-muted">
              {t("timeline.origin")} · {formatYear(COMPANY_FOUNDED_YEAR)}
            </p>

            {/* One project photo per entry, grouped by year: a shared bar
                and year number below every run of cards that share a year,
                rather than a caption repeated under each one. Built as one
                CSS grid (cards on row 1, each group's bar on row 2, each
                group's year on row 3) so a group's bar/label can span
                exactly the width of its own cards via `grid-column` — no
                JS measurement needed, and it re-solves for free on resize.
                See MilestonesScroller for why this scrolls at every width
                rather than settling into a static grid on desktop. */}
            <MilestonesScroller
              labels={{ previous: t("timeline.previous"), next: t("timeline.next") }}
            >
              <div
                className="grid gap-x-6 gap-y-4"
                style={{
                  gridTemplateColumns: `repeat(${milestones.length}, minmax(13rem, 16rem))`,
                }}
              >
                {milestones.map((milestone, index) => {
                  // Only worth telling a visitor when it's news to them —
                  // "by Andaman Asset Solution" on Andaman Asset Solution's
                  // own site says nothing a different sub-brand credit
                  // does.
                  const brandLabel =
                    milestone.brand && milestone.brand !== siteConfig.name
                      ? milestone.brand
                      : null;

                  return (
                    <div key={milestone.id} style={{ gridColumn: index + 1, gridRow: 1 }}>
                      <div className="relative aspect-4/5 w-full overflow-hidden rounded-xs bg-primary-900/4 shadow-card">
                        {milestone.imageUrl ? (
                          <ImageWithSkeleton
                            src={milestone.imageUrl}
                            alt=""
                            fill
                            sizes="220px"
                            className="object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <Building2
                              size={28}
                              strokeWidth={1.5}
                              className="text-primary/20"
                              aria-hidden
                            />
                          </div>
                        )}
                      </div>

                      <p className="mt-4 text-sm font-semibold text-primary">
                        {t("timeline.yearLabel", { year: milestone.year })}
                      </p>
                      <p className="mt-1 text-xs uppercase tracking-wide text-ink-muted">
                        {milestone.projectName}
                        {brandLabel && ` ${t("timeline.byBrand", { brand: brandLabel })}`}
                      </p>
                    </div>
                  );
                })}

                {milestoneGroups.map((group) => (
                  <div
                    key={`${group.year}-bar`}
                    aria-hidden
                    style={{ gridColumn: `${group.start + 1} / span ${group.count}`, gridRow: 2 }}
                    className="mt-4 border-t-2 border-primary"
                  />
                ))}
                {milestoneGroups.map((group) => (
                  <p
                    key={`${group.year}-label`}
                    style={{ gridColumn: `${group.start + 1} / span ${group.count}`, gridRow: 3 }}
                    className="mt-3 text-center text-base font-semibold text-primary"
                  >
                    {formatYear(group.year)}
                  </p>
                ))}
              </div>
            </MilestonesScroller>
          </Reveal>

          {/* Real award data lives on its own page (getAwards(locale), same
              source the homepage Awards section reads) rather than being
              duplicated here — see app/[locale]/(site)/achievements/page.tsx.
              Linked from here per the client's choice, rather than adding a
              new top-level Navbar item for a single page. */}
          <Reveal>
            <Link
              href={`/${locale}/achievements`}
              className="btn-outline mt-10 inline-flex items-center gap-2"
            >
              {t("timeline.viewAll")}
              <ArrowRight size={16} aria-hidden />
            </Link>
          </Reveal>
        </section>
      )}

      {/* No closing CTA here. This page ends with the site-wide one
          mounted in (site)/layout.tsx, which on /about is worded for this
          page — "come and meet the team", under the page about the team.
          The centred "Questions we have not answered here?" block that
          used to sit at this point asked for the same thing in weaker
          words, three sections higher, and having both meant the visitor
          was invited to contact us twice before reaching the footer. */}
    </>
  );
}
