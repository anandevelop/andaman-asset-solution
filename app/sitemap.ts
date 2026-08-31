/**
 * app/sitemap.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Every indexable URL, in both locales.
 *
 * Each entry carries `alternates.languages` so Google can pair the Thai and
 * English versions of a page instead of treating them as duplicates
 * competing for the same query. That pairing is the main reason to generate
 * this from the database rather than hand-maintaining a static list.
 *
 * Deliberately absent: /admin, /login, /privacy-policy, /terms. The first
 * two are disallowed in robots.ts, and policy/legal pages have no business
 * consuming crawl budget.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";
import { locales, defaultLocale } from "@/i18n";
import { prisma } from "@/lib/prisma";
import { safeQuery } from "@/lib/db";
import { getArticleSitemapEntries } from "@/lib/news";
import { getEventSitemapEntries } from "@/lib/events";

// Regenerate hourly. A sitemap that lags a new article by an hour is fine;
// one rebuilt on every crawler hit is a self-inflicted load problem.
export const revalidate = 3600;

type Entry = MetadataRoute.Sitemap[number];

/**
 * One sitemap entry per locale for a given path, cross-linked via
 * alternates so each locale's URL declares the others.
 */
function localized(
  path: string,
  options: { lastModified?: Date; changeFrequency?: Entry["changeFrequency"]; priority?: number } = {},
): MetadataRoute.Sitemap {
  const languages = Object.fromEntries(
    locales.map((locale) => [locale, `${siteConfig.url}/${locale}${path}`]),
  );

  return locales.map((locale) => ({
    url: `${siteConfig.url}/${locale}${path}`,
    lastModified: options.lastModified ?? new Date(),
    changeFrequency: options.changeFrequency ?? "weekly",
    // The default locale is the canonical entry point for Thai visitors,
    // who are the primary audience — give it a slight edge.
    priority: (options.priority ?? 0.7) * (locale === defaultLocale ? 1 : 0.9),
    alternates: { languages },
  }));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [projects, articles, events] = await Promise.all([
    safeQuery(
      "sitemap:projects",
      () =>
        prisma.project.findMany({
          where: { isPublished: true, deletedAt: null },
          select: { slug: true, updatedAt: true },
          orderBy: { sortOrder: "asc" },
        }),
      [] as { slug: string; updatedAt: Date }[],
    ),
    getArticleSitemapEntries(),
    getEventSitemapEntries(),
  ]);

  return [
    // ── Static routes ───────────────────────────────────────────────
    // Mirrors siteConfig.nav.main — if a page is worth a nav slot it is
    // worth indexing, and vice versa.
    ...localized("", { changeFrequency: "weekly", priority: 1 }),
    ...localized("/projects", { changeFrequency: "weekly", priority: 0.9 }),
    ...localized("/progress", { changeFrequency: "weekly", priority: 0.7 }),
    ...localized("/news", { changeFrequency: "daily", priority: 0.8 }),
    ...localized("/events", { changeFrequency: "daily", priority: 0.8 }),
    // Editorial pages: rarely change, but /about carries the trust signals
    // and /contact is a common branded-search landing page.
    ...localized("/about", { changeFrequency: "monthly", priority: 0.6 }),
    ...localized("/contact", { changeFrequency: "monthly", priority: 0.6 }),

    // ── Detail pages ────────────────────────────────────────────────
    ...projects.flatMap((project) =>
      localized(`/projects/${project.slug}`, {
        lastModified: project.updatedAt,
        changeFrequency: "weekly",
        priority: 0.9,
      }),
    ),

    ...articles.flatMap((article) =>
      localized(`/news/${article.slug}`, {
        lastModified: article.updatedAt,
        // An article is written once and rarely revised.
        changeFrequency: "monthly",
        priority: 0.7,
      }),
    ),

    ...events.flatMap((event) =>
      localized(`/events/${event.slug}`, {
        lastModified: event.updatedAt,
        changeFrequency: "weekly",
        priority: 0.6,
      }),
    ),
  ];
}
