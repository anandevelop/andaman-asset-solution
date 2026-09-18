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
import { getBrochureSitemapEntries } from "@/lib/brochures";

// Regenerate hourly. A sitemap that lags a new article by an hour is fine;
// one rebuilt on every crawler hit is a self-inflicted load problem.
export const revalidate = 3600;

type Entry = MetadataRoute.Sitemap[number];

// A real fallback for pages with no dedicated "last touched" signal of
// their own. NEVER default to `new Date()` here — doing that inside a
// function that reruns every regeneration (hourly, per `revalidate`
// above) stamps a fresh "now" on every rebuild, which teaches Google the
// lastmod field is meaningless and it starts ignoring it site-wide. This
// constant only moves when someone deliberately bumps it (e.g. a
// deploy that meaningfully changes one of the pages below), so it stays
// a trustworthy signal instead of a clock.
const FALLBACK_LAST_MODIFIED = new Date("2026-01-01T00:00:00.000Z");

/** Latest of a set of optional dates, falling back to FALLBACK_LAST_MODIFIED. */
function latest(...dates: (Date | null | undefined)[]): Date {
  const known = dates.filter((d): d is Date => d instanceof Date);
  if (known.length === 0) return FALLBACK_LAST_MODIFIED;
  return known.reduce((max, d) => (d > max ? d : max));
}

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
  // x-default: the entry a crawler (or a browser with no locale match)
  // should fall back to. The Thai build is the canonical entry point.
  languages["x-default"] = `${siteConfig.url}/${defaultLocale}${path}`;

  return locales.map((locale) => ({
    url: `${siteConfig.url}/${locale}${path}`,
    lastModified: options.lastModified ?? FALLBACK_LAST_MODIFIED,
    changeFrequency: options.changeFrequency ?? "weekly",
    // The default locale is the canonical entry point for Thai visitors,
    // who are the primary audience — give it a slight edge. Rounded
    // because the multiplication is binary floating point: 0.4 × 0.9 is
    // 0.36000000000000004, and that is what would land in the XML.
    priority: Math.round((options.priority ?? 0.7) * (locale === defaultLocale ? 1 : 0.9) * 100) / 100,
    alternates: { languages },
  }));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [projects, articles, events, brochures, companyProfile, latestProgress, latestAward, latestSetting] =
    await Promise.all([
      safeQuery(
        "sitemap:projects",
        () =>
          prisma.project.findMany({
            where: { isPublished: true, deletedAt: null },
            select: {
              slug: true,
              updatedAt: true,
              sitemapPriority: true,
              sitemapChangeFreq: true,
            },
            orderBy: { sortOrder: "asc" },
          }),
        [] as {
          slug: string;
          updatedAt: Date;
          sitemapPriority: number | null;
          sitemapChangeFreq: string | null;
        }[],
      ),
      getArticleSitemapEntries(),
      getEventSitemapEntries(),
      getBrochureSitemapEntries(),
      safeQuery(
        "sitemap:companyProfile",
        () => prisma.companyProfile.findUnique({ where: { id: "default" }, select: { updatedAt: true } }),
        null as { updatedAt: Date } | null,
      ),
      safeQuery(
        "sitemap:latestProgress",
        () =>
          prisma.projectProgress.findFirst({
            where: { isPublished: true },
            orderBy: { updatedAt: "desc" },
            select: { updatedAt: true },
          }),
        null as { updatedAt: Date } | null,
      ),
      safeQuery(
        "sitemap:latestAward",
        () =>
          prisma.award.findFirst({
            where: { isActive: true },
            orderBy: { updatedAt: "desc" },
            select: { updatedAt: true },
          }),
        null as { updatedAt: Date } | null,
      ),
      safeQuery(
        "sitemap:latestSetting",
        () => prisma.siteSetting.findFirst({ orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
        null as { updatedAt: Date } | null,
      ),
    ]);

  // "Site last meaningfully touched" — a real, DB-backed proxy for pages
  // (like /contact) that have no content record of their own but do
  // change when an admin edits company info or settings.
  const siteLastTouched = latest(companyProfile?.updatedAt, latestSetting?.updatedAt);

  const latestProjectUpdate = projects.reduce<Date | undefined>(
    (max, p) => (max === undefined || p.updatedAt > max ? p.updatedAt : max),
    undefined,
  );
  const latestArticleUpdate = articles.reduce<Date | undefined>(
    (max, a) => (max === undefined || a.updatedAt > max ? a.updatedAt : max),
    undefined,
  );
  const latestEventUpdate = events.reduce<Date | undefined>(
    (max, e) => (max === undefined || e.updatedAt > max ? e.updatedAt : max),
    undefined,
  );
  const latestBrochureUpdate = brochures.reduce<Date | undefined>(
    (max, b) => (max === undefined || b.updatedAt > max ? b.updatedAt : max),
    undefined,
  );

  return [
    // ── Static routes ───────────────────────────────────────────────
    // Mirrors siteConfig.nav.main ∪ nav.secondary — if a page is worth a
    // nav slot it is worth indexing, and a page the client kept out of the
    // header still has to be findable (see nav.secondary in config/site.ts).
    //
    // lastModified below is deliberately tied to a real content signal for
    // each page rather than "now" — see FALLBACK_LAST_MODIFIED's comment.
    ...localized("", {
      changeFrequency: "weekly",
      priority: 1,
      lastModified: latest(latestProjectUpdate, latestArticleUpdate, latestEventUpdate, siteLastTouched),
    }),
    ...localized("/projects", {
      changeFrequency: "weekly",
      priority: 0.9,
      lastModified: latest(latestProjectUpdate),
    }),
    ...localized("/progress", {
      changeFrequency: "weekly",
      priority: 0.7,
      lastModified: latest(latestProgress?.updatedAt),
    }),
    ...localized("/news", {
      changeFrequency: "daily",
      priority: 0.8,
      lastModified: latest(latestArticleUpdate),
    }),
    ...localized("/events", {
      changeFrequency: "daily",
      priority: 0.8,
      lastModified: latest(latestEventUpdate),
    }),
    // Editorial pages: rarely change, but /about carries the trust signals
    // and /contact is a common branded-search landing page.
    ...localized("/about", {
      changeFrequency: "monthly",
      priority: 0.6,
      lastModified: latest(companyProfile?.updatedAt),
    }),
    ...localized("/contact", {
      changeFrequency: "monthly",
      priority: 0.6,
      lastModified: siteLastTouched,
    }),
    // Footer-only (nav.secondary), but real award content in four locales.
    ...localized("/achievements", {
      changeFrequency: "monthly",
      priority: 0.5,
      lastModified: latest(latestAward?.updatedAt),
    }),
    // Footer-only (nav.secondary), like /achievements — a catalogue reached
    // from a project page rather than the header.
    ...localized("/e-brochure", {
      changeFrequency: "monthly",
      priority: 0.5,
      lastModified: latest(latestBrochureUpdate),
    }),

    // ── Detail pages ────────────────────────────────────────────────
    /* Per-project overrides win when set from the SEO tab; otherwise the
       section defaults below apply, which is the case for every project
       until somebody decides one of them deserves otherwise. */
    ...projects.flatMap((project) =>
      localized(`/projects/${project.slug}`, {
        lastModified: project.updatedAt,
        changeFrequency:
          (project.sitemapChangeFreq as Entry["changeFrequency"] | null) ?? "weekly",
        priority: project.sitemapPriority ?? 0.9,
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

    ...brochures.flatMap((brochure) =>
      localized(`/e-brochure/${brochure.slug}`, {
        // A brochure is replaced, not edited — a new edition is a new file
        // against the same slug, which moves lastModified.
        lastModified: brochure.updatedAt,
        changeFrequency: "monthly",
        priority: 0.6,
      }),
    ),
  ];
}
