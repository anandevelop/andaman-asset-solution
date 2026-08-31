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
import { getTranslations, unstable_setRequestLocale } from "next-intl/server";
import { SearchX } from "lucide-react";
import Reveal from "@/components/Reveal";
import ProjectsHero from "@/components/ProjectsHero";
import DbOfflineNotice from "@/components/DbOfflineNotice";
import FeaturedProjectCard from "@/components/FeaturedProjectCard";
import ProjectFilterBar from "@/components/ProjectFilterBar";
import { siteConfig } from "@/config/site";
import { locales } from "@/i18n";
import { getProjectFacets, getPublishedProjects } from "@/lib/projects";
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
  params: { locale: string };
  searchParams: Record<string, string | string[] | undefined>;
};

export async function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params: { locale },
  searchParams,
}: Props): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "projects" });
  const filters = parseProjectFilters(searchParams);
  const filtered = hasActiveFilters(filters);

  return {
    title: t("title"),
    description: t("subtitle"),
    alternates: {
      // Always points at the unfiltered page, so link equity from a shared
      // filtered URL consolidates onto one canonical.
      canonical: `${siteConfig.url}/${locale}/projects`,
      languages: Object.fromEntries(
        locales.map((l) => [l, `${siteConfig.url}/${l}/projects`]),
      ),
    },
    robots: filtered ? { index: false, follow: true } : { index: true, follow: true },
  };
}

export default async function ProjectsPage({ params: { locale }, searchParams }: Props) {
  unstable_setRequestLocale(locale);

  const filters = parseProjectFilters(searchParams);

  const [t, projects, facets] = await Promise.all([
    getTranslations("projects"),
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

  return (
    <>
      {/* ── Header ─────────────────────────────────────────────────────
          Staggered/animated in ProjectsHero rather than one flat Reveal —
          see that component for why. */}
      <section className="container-luxe pb-4 pt-28 sm:pt-36">
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
                    propertyType: t(`propertyType.${project.propertyType}` as never),
                    cta: t("viewProject"),
                    specType: t("specs.type"),
                    specUnits: t("specs.units"),
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
