/**
 * app/[locale]/(site)/projects/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Project listing with filtering and sorting.
 *
 * Filters live in searchParams, which makes this route dynamic — the
 * result set depends on the request. That is the correct trade: the page
 * still streams, the queries are indexed, and the alternative (filtering
 * client-side over a full fetch) would ship every project to every visitor
 * and flash the unfiltered grid first.
 *
 * A filtered view is marked noindex. The content is a subset of the
 * canonical page, and letting four facets multiply into indexable
 * permutations is how a five-page site ends up with sixty thin URLs
 * competing with each other.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SearchX } from "lucide-react";
import Reveal from "@/components/Reveal";
import ProjectsHero from "@/components/ProjectsHero";
import DbOfflineNotice from "@/components/DbOfflineNotice";
import FeaturedProjectCard from "@/components/FeaturedProjectCard";
import ProjectFilterBar from "@/components/ProjectFilterBar";
import { localizedAlternates, breadcrumbList, trailFor } from "@/lib/seo";
import Breadcrumb from "@/components/Breadcrumb";
import JsonLd from "@/components/JsonLd";
import {
  getProjectFacets,
  getProjectPortfolioSummary,
  getPublishedProjects,
} from "@/lib/projects";
import { formatNumber } from "@/lib/format";
import { projectCtaKey, projectSignalLabel } from "@/lib/project-card-labels";
import { isDatabaseOffline } from "@/lib/db";
import {
  SORT_OPTIONS,
  hasActiveFilters,
  parseProjectFilters,
} from "@/lib/project-filters";
import { PROPERTY_TYPES, PROJECT_STATUSES } from "@/lib/validations";
import { robotsMetadata } from "@/lib/indexing";

/*
  One hour for the unfiltered page. Filtered views read searchParams, which
  makes them dynamic regardless of this value — so the cache only ever
  serves the canonical listing, which is also the only one that is indexed.
*/
export const revalidate = 3600;

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata(props: Props): Promise<Metadata> {
  const searchParams = await props.searchParams;
  const params = await props.params;

  const {
    locale
  } = params;

  const t = await getTranslations({ locale, namespace: "projects" });
  const filters = parseProjectFilters(searchParams);
  const filtered = hasActiveFilters(filters);

  return {
    title: t("title"),
    description: t("subtitle"),
    // Always points at the unfiltered page, so link equity from a shared
    // filtered URL consolidates onto one canonical.
    alternates: localizedAlternates(locale, "/projects"),
    robots: robotsMetadata({ index: !filtered }),
  };
}

export default async function ProjectsPage(props: Props) {
  const searchParams = await props.searchParams;
  const params = await props.params;

  const {
    locale
  } = params;

  setRequestLocale(locale);

  const filters = parseProjectFilters(searchParams);

  const [t, tNav, projects, facets, portfolio, allProjects] = await Promise.all([
    getTranslations("projects"),
    getTranslations("nav"),
    getPublishedProjects(locale, filters),
    getProjectFacets(),
    getProjectPortfolioSummary(),
    /*
      The unfiltered list, for the hero's photograph and its shortcut bar.
      Both have to stay independent of the chips: the bar is a table of
      contents for the portfolio, and the photo changing as a visitor
      filtered would be bizarre. getPublishedProjects is cache()d per
      argument list, so this is one extra query on a filtered view and
      zero on the canonical one, where it's the same call as above.
    */
    getPublishedProjects(locale),
  ]);

  const filtered = hasActiveFilters(filters);

  // The first published project by the sortOrder the team curated — the
  // same order getPublishedProjects returns by default — lends the hero its
  // photograph, and the credit badge names it, so the two cannot disagree.
  const heroProject = allProjects[0] ?? null;

  const heroStats = [
    {
      label: t("hero.statProjects"),
      value: formatNumber(locale, portfolio.count),
      unit: t("hero.statProjectsUnit"),
    },
    {
      label: t("hero.statUnits"),
      value: formatNumber(locale, portfolio.totalUnits),
      unit: t("hero.statUnitsUnit"),
    },
    {
      label: t("hero.statLand"),
      value: formatNumber(locale, portfolio.totalLandSqm),
      unit: t("units.sqm"),
    },
  ];

  /*
    Two rules empty the shortcut bar, both about not sending anyone
    somewhere useless. Under a filter the card an anchor points at may not
    be on the page at all, and the filter bar directly below already says
    what is showing. With a single project it is a shortcut to the one card
    two inches further down.
  */
  const shortcuts =
    filtered || allProjects.length < 2
      ? []
      : allProjects.map((project) => ({
          slug: project.slug,
          name: project.name,
          location: project.location,
          status: t(`status.${project.status}` as never),
          accentDot: project.status === "UNDER_CONSTRUCTION",
          units: formatNumber(locale, project.totalUnits),
          unitsLabel:
            project.propertyType === "POOL_VILLA"
              ? t("hero.villasShort")
              : t("hero.unitsShort"),
          imageUrl: project.heroImageUrl,
        }));

  // Pre-translate every label the client filter bar needs — see the note
  // on server/client boundaries in that component.
  const labelMap = <T extends readonly string[]>(
    values: T,
    prefix: string,
  ): Record<string, string> =>
    Object.fromEntries(values.map((value) => [value, t(`${prefix}.${value}` as never)]));

  // One array for the trail a visitor reads and the one Google reads.
  const trail = trailFor(locale, [
    { name: tNav("home"), path: "" },
    { name: tNav("projects"), path: "/projects" },
  ]);

  return (
    <>
      <JsonLd
        id="breadcrumb-schema"
        data={breadcrumbList(trail)}
      />
      {/* ── Hero ───────────────────────────────────────────────────────
          Full-bleed, so no container-luxe here — ProjectsHero pads its own
          copy and shortcut bar. The breadcrumb goes in as a prop because
          Breadcrumb is an async server component and the hero is a client
          one; tone="onImage" for the same reason it sits down with the
          copy rather than at the top of the frame. */}
      <ProjectsHero
        breadcrumb={<Breadcrumb items={trail} tone="onImage" />}
        eyebrow={t("eyebrow")}
        title={t("title")}
        subtitle={t("subtitle")}
        image={
          heroProject?.heroImageUrl
            ? {
                url: heroProject.heroImageUrl,
                alt: `${heroProject.name} — ${heroProject.location}`,
              }
            : null
        }
        credit={
          heroProject?.heroImageUrl
            ? { name: heroProject.name, suffix: t("hero.imageCredit") }
            : null
        }
        stats={heroStats}
        shortcuts={shortcuts}
        shortcutsLabel={t("hero.shortcutsLabel")}
      />

      {/* ── Filters ──────────────────────────────────────────────────── */}
      {/* Hidden with fewer than two projects: a filter bar over a single
          card is noise, and every control would be a no-op. */}
      {facets.total > 1 && (
        <div className="container-luxe mt-8">
          <ProjectFilterBar
            locale={locale}
            available={{
              propertyTypes: facets.propertyTypes,
              statuses: facets.statuses,
            }}
            resultCount={projects.length}
            labels={{
              heading: t("filters.heading"),
              propertyType: t("specs.type"),
              status: t("filters.status"),
              sort: t("filters.sort"),
              all: t("filters.all"),
              clear: t("filters.clear"),
              results: t("filters.results", { count: projects.length }),
              propertyTypes: labelMap(PROPERTY_TYPES, "propertyType"),
              statuses: labelMap(PROJECT_STATUSES, "status"),
              sortOptions: labelMap(SORT_OPTIONS, "filters.sortOptions"),
            }}
          />
        </div>
      )}

      {/* ── Grid ─────────────────────────────────────────────────────── */}
      <section className="container-luxe py-14 sm:py-20">
        {isDatabaseOffline() && <DbOfflineNotice />}

        {projects.length === 0 ? (
          <div className="border border-dashed border-primary/15 bg-white/50 p-12 text-center">
            <SearchX size={26} strokeWidth={1.5} className="mx-auto text-ink/30" aria-hidden />
            <p className="mt-3 text-sm text-ink/65">
              {filtered ? t("filters.empty") : t("empty")}
            </p>

            {filtered && (
              // The way out of a dead end, one tap away.
              <Link
                href={`/${locale}/projects`}
                className="mt-5 inline-block text-xs font-medium uppercase tracking-wide text-accent-700 hover:text-accent-800"
              >
                {t("filters.clearAll")}
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project, i) => (
              <Reveal
                key={project.id}
                delay={i * 0.08}
                // Target for the hero's shortcut bar. scroll-mt clears the
                // sticky navbar, which would otherwise sit over the top of
                // the card the anchor just jumped to.
                id={`project-${project.slug}`}
                className="scroll-mt-24"
              >
                <FeaturedProjectCard
                  project={project}
                  locale={locale}
                  // No priority on any card now. The hero photograph above
                  // is the LCP element and carries it; `priority` preloads
                  // at high fetchpriority, so tagging the first card too
                  // puts two images in a race for the same bandwidth and
                  // lands the real LCP later than tagging neither.
                  labels={{
                    status: t(`status.${project.status}` as never),
                    cta: t(projectCtaKey(project.status) as never),
                    specVillas: t("specs.villas"),
                    specBedrooms: t("specs.bedrooms"),
                    specLand: t("specs.land"),
                    signal: projectSignalLabel(project.signal, t as never, locale),
                  }}
                />
              </Reveal>
            ))}
          </div>
        )}
      </section>
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
