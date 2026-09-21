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
import { locales } from "@/i18n";
import { localizedAlternates, breadcrumbList, trailFor } from "@/lib/seo";
import Breadcrumb from "@/components/Breadcrumb";
import JsonLd from "@/components/JsonLd";
import { getProjectFacets, getPublishedProjects, type ProjectSignal } from "@/lib/projects";
import { formatMonthYear } from "@/lib/format";
import { isDatabaseOffline } from "@/lib/db";
import {
  SORT_OPTIONS,
  hasActiveFilters,
  parseProjectFilters,
} from "@/lib/project-filters";
import { PROPERTY_TYPES, PROJECT_STATUSES } from "@/lib/validations";

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

export async function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

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
    robots: filtered ? { index: false, follow: true } : { index: true, follow: true },
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

  const [t, tNav, projects, facets] = await Promise.all([
    getTranslations("projects"),
    getTranslations("nav"),
    getPublishedProjects(locale, filters),
    getProjectFacets(),
  ]);

  const filtered = hasActiveFilters(filters);

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
      {/* ── Header ─────────────────────────────────────────────────────
          Staggered/animated in ProjectsHero rather than one flat Reveal —
          see that component for why. */}
      <section className="container-luxe pb-4 pt-28 sm:pt-36">
        <Breadcrumb items={trail} className="mb-5" />

        <ProjectsHero eyebrow={t("eyebrow")} title={t("title")} subtitle={t("subtitle")} />
      </section>

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
              <Reveal key={project.id} delay={i * 0.08}>
                <FeaturedProjectCard
                  project={project}
                  locale={locale}
                  // Only the first card. `priority` preloads at high
                  // fetchpriority, so marking a whole row of them makes
                  // three images compete for bandwidth and pushes the real
                  // LCP element later than tagging none at all.
                  priority={i === 0}
                  labels={{
                    status: t(`status.${project.status}` as never),
                    cta: t(ctaKey(project.status) as never),
                    specVillas: t("specs.villas"),
                    specBedrooms: t("specs.bedrooms"),
                    specLand: t("specs.land"),
                    signal: signalLabel(project.signal, t as never, locale),
                    construction: constructionLabel(project, t as never, locale),
                    constructionTitle: t("galleryTitle"),
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
function signalLabel(
  signal: ProjectSignal | null,
  t: (key: never, values?: Record<string, unknown>) => string,
  locale: string,
): string | null {
  if (!signal) return null;

  if (signal.kind === "awards") {
    return t("signal.awards" as never, { count: signal.count, year: signal.year });
  }

  return t("signal.progressPhotos" as never, {
    count: signal.count,
    when: formatMonthYear(locale, signal.year, signal.month),
  });
}

/**
 * The card's construction-progress row, or null when there is nothing
 * true to show — an upcoming development with no progress entries yet
 * gets no row at all, rather than a bar claiming 0%.
 *
 * "Complete" is a status fact (ready to move in / sold out), not a
 * hundred-percent reading — the two usually agree, but a development can
 * be marked ready before its last progress entry catches up to say so.
 */
function constructionLabel(
  project: { status: string; constructionPercent: number | null; constructionUpdated: { year: number; month: number } | null },
  t: (key: never, values?: Record<string, unknown>) => string,
  locale: string,
): { text: string; percent: number | null } | null {
  const complete =
    project.status === "READY_TO_MOVE_IN" ||
    project.status === "SOLD_OUT" ||
    project.constructionPercent === 100;

  if (complete) return { text: t("progressComplete" as never), percent: null };

  if (project.constructionPercent === null || !project.constructionUpdated) return null;

  return {
    text: t("progressUpdated" as never, {
      percent: project.constructionPercent,
      when: formatMonthYear(locale, project.constructionUpdated.year, project.constructionUpdated.month),
    }),
    percent: project.constructionPercent,
  };
}

/** An upcoming development has nothing to walk through yet — see the note
 *  on the CTA in components/FeaturedProjectCard.tsx. */
function ctaKey(status: string): "registerInterest" | "viewProject" {
  return status === "UPCOMING" ? "registerInterest" : "viewProject";
}
