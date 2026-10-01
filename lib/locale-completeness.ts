import "server-only";

/**
 * lib/locale-completeness.ts
 * ─────────────────────────────────────────────────────────────────────────
 * "How much of the site's content exists in each of the 4 locales" — the
 * dashboard's summary card (Main.dc.html). The per-record, per-locale
 * detail already lives at /admin/publishing (its completeness table,
 * driven by lib/publishing.ts's PublishingRow.localesPresent); this is a
 * cheap, dashboard-only rollup of the same underlying fact — a locale
 * "present" on a record means its title/name is non-empty, same
 * convention as PublishingRow.localesPresent — without that page's
 * per-row AuditLog lookups, which this summary has no use for.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { prisma } from "@/lib/prisma";
import { safeQuery } from "@/lib/db";
import { locales, LOCALE_DISPLAY_ORDER } from "@/i18n";

/** Native display name per locale — this card names all 4 locales at
 *  once regardless of which one the admin is currently viewing in, so
 *  these are fixed labels, not translated strings. */
export const LOCALE_NATIVE_NAMES: Record<string, string> = {
  en: "English",
  th: "ไทย",
  zh: "中文",
  ru: "Русский",
};

/** Re-exported for the callers that already import it from here; defined
 *  in i18n.ts so client components can read it too. */
export { LOCALE_DISPLAY_ORDER };

/**
 * How filled-in one locale's content is, for the per-row language pills on
 * the admin Projects list (Projects.dc.html's ภาษา column).
 *
 * "missing" is deliberately the *same* rule as localesPresent() below and
 * lib/publishing.ts's — a locale counts as absent when its name/title is
 * empty — so the dashboard rollup, the Publishing completeness table and
 * the Projects list can never disagree about whether a language exists.
 * "partial" then splits what those two both call "present" into a row that
 * is only a name and one that a visitor could actually read: the public
 * project page renders tagline and description, and a locale with neither
 * is a title in an otherwise English page, not a translation.
 *
 * The distinction is display-only. Nothing gates publishing on it — see
 * lib/publishing-gate.ts for the one rule that is actually enforced.
 */
export type LocaleFill = "complete" | "partial" | "missing";

type FillableTranslation = {
  name?: string | null;
  title?: string | null;
  tagline?: string | null;
  description?: string | null;
};

function filled(value: string | null | undefined): boolean {
  return (value ?? "").trim().length > 0;
}

export function localeFill(translation: FillableTranslation | undefined): LocaleFill {
  if (!translation || !filled(translation.name ?? translation.title)) return "missing";
  return filled(translation.tagline) && filled(translation.description) ? "complete" : "partial";
}

/** One LocaleFill per locale, in LOCALE_DISPLAY_ORDER (Thai first). */
export function localeFills(translations: (FillableTranslation & { locale: string })[]) {
  return LOCALE_DISPLAY_ORDER.map((locale) => ({
    locale,
    fill: localeFill(translations.find((row) => row.locale === locale)),
  }));
}

export type LocaleCompletenessRow = { locale: string; percent: number };

export type LocaleCompletenessSummary = {
  rows: LocaleCompletenessRow[];
  /** Total (content item × locale) gaps across every publishable type —
   *  the number behind the "see what's missing" link. */
  missingCount: number;
};

const EMPTY_SUMMARY: LocaleCompletenessSummary = {
  rows: (locales as readonly string[]).map((locale) => ({ locale, percent: 0 })),
  missingCount: 0,
};

type TranslationRow = { locale: string; title?: string | null; name?: string | null };

function localesPresent(translations: TranslationRow[]): Set<string> {
  const set = new Set<string>();
  for (const row of translations) {
    if ((row.title ?? row.name ?? "").trim().length > 0) set.add(row.locale);
  }
  return set;
}

// ── Translation Status report (/admin/publishing/translations) ──────────

/**
 * The five groups the report page and its CSV export both draw from.
 * "staticPages" is everything the Pages hub edits that isn't one of the
 * other four — hero slides, the closing CTA, the About tabs, the FAQ list
 * — grouped under one heading because they share a home in the nav
 * (lib/admin/nav.ts's "pages" item) even though they are seven distinct
 * models underneath.
 */
export type TranslationGroupKey = "projects" | "news" | "events" | "eBrochures" | "staticPages";

/**
 * The content type an item belongs to — finer than its group. The groups
 * are where a gap is listed (and what the CSV says); the sections are the
 * matrix's rows, "FAQ 12 of 40 missing Russian", which the five groups
 * were too coarse to say: "static pages" alone was seven models.
 */
export type TranslationSectionKey =
  | "projects"
  | "unitTypes"
  | "facilities"
  | "news"
  | "events"
  | "eBrochures"
  | "heroSlides"
  | "cta"
  | "corporate"
  | "whyUs"
  | "mission"
  | "awards"
  | "faq";

export type TranslationStatusItem = {
  id: string;
  section: TranslationSectionKey;
  /** English first, then Thai, then the record's slug — never a
   *  deprecated column, per every *Translation model's own migration
   *  note ("not read by any query layer written after that migration"). */
  label: string;
  /** Appended to `/${locale}/admin` by the page — never the full URL,
   *  same convention as NavItem.href in lib/admin/nav.ts. */
  editHref: string;
  /** Subset of LOCALE_DISPLAY_ORDER with no content at all. */
  missingLocales: string[];
};

export type TranslationStatusGroup = {
  group: TranslationGroupKey;
  /** Only rows missing at least one locale — a complete row is not a gap
   *  to report, and the four-model rollup above already answers "how much
   *  of the site is translated" for anyone who wants the positive number. */
  items: TranslationStatusItem[];
};

export type TranslationLocaleTotal = { locale: string; missing: number; total: number };

export type TranslationMatrixRow = {
  section: TranslationSectionKey;
  total: number;
  /** Records that HAVE this locale, per locale. */
  have: Record<string, number>;
};

/** The matrix: per content type, how many records have each locale.
 *  Derived from the report, so it cannot disagree with the list of gaps
 *  under it or with the per-locale totals above it. */
export function translationMatrix(report: TranslationStatusReport): TranslationMatrixRow[] {
  const items = report.groups.flatMap((group) => group.items);
  return report.sections
    .filter((entry) => entry.total > 0)
    .map((entry) => ({
      section: entry.section,
      total: entry.total,
      have: Object.fromEntries(
        LOCALE_DISPLAY_ORDER.map((locale) => [
          locale,
          entry.total -
            items.filter((item) => item.section === entry.section && item.missingLocales.includes(locale)).length,
        ]),
      ),
    }));
}

export type TranslationStatusReport = {
  groups: TranslationStatusGroup[];
  /** Every content type with how many records it has, complete or not —
   *  the matrix's denominators. In display order. */
  sections: { section: TranslationSectionKey; group: TranslationGroupKey; total: number }[];
  /** Every item across all five groups, complete or not — the denominator
   *  behind each TranslationLocaleTotal.total. */
  totalItems: number;
};

const EMPTY_TRANSLATION_REPORT: TranslationStatusReport = {
  groups: (["projects", "news", "events", "eBrochures", "staticPages"] as const).map((group) => ({
    group,
    items: [],
  })),
  sections: [],
  totalItems: 0,
};

type LocaleText = { locale: string; primary?: string | null };

/** English, then Thai, then whatever the caller passes as a last resort —
 *  a slug for the four publishable types, "(untitled)" for a static-page
 *  row with no identifying text in either base locale. */
function referenceLabel(rows: LocaleText[], fallback: string): string {
  const en = rows.find((row) => row.locale === "en")?.primary;
  if (filled(en)) return en as string;
  const th = rows.find((row) => row.locale === "th")?.primary;
  if (filled(th)) return th as string;
  return fallback;
}

function missingLocalesOf(rows: LocaleText[]): string[] {
  return LOCALE_DISPLAY_ORDER.filter(
    (locale) => !filled(rows.find((row) => row.locale === locale)?.primary),
  );
}

/** One list-style static-page model, described just enough to turn its
 *  rows into TranslationStatusItems the same way every other one is. */
type StaticPageSource<Row> = {
  section: TranslationSectionKey;
  /** Shown before the row's own label, since none of these seven models
   *  has a slug or other identifier a reader would recognise on its own. */
  sectionLabel: string;
  editHref: string;
  rows: Row[];
  toLocaleText: (row: Row) => LocaleText[];
  id: (row: Row) => string;
};

function staticPageItems<Row>(source: StaticPageSource<Row>): TranslationStatusItem[] {
  return source.rows
    .map((row) => {
      const localeText = source.toLocaleText(row);
      return {
        id: source.id(row),
        section: source.section,
        label: `${source.sectionLabel} — ${referenceLabel(localeText, "(untitled)")}`,
        editHref: source.editHref,
        missingLocales: missingLocalesOf(localeText),
      };
    })
    .filter((item) => item.missingLocales.length > 0);
}

export async function getTranslationStatusReport(): Promise<TranslationStatusReport> {
  return safeQuery(
    "admin:translationStatus",
    async () => {
      const [
        projects,
        news,
        events,
        brochures,
        heroSlides,
        ctaBlocks,
        corporateServices,
        whyUsPoints,
        missionPrinciples,
        awards,
        faqs,
        unitTypes,
        facilities,
      ] = await Promise.all([
        prisma.project.findMany({
          where: { deletedAt: null },
          select: { id: true, slug: true, translations: { select: { locale: true, name: true } } },
        }),
        prisma.newsArticle.findMany({
          where: { deletedAt: null },
          select: { id: true, slug: true, translations: { select: { locale: true, title: true } } },
        }),
        prisma.event.findMany({
          select: { id: true, slug: true, translations: { select: { locale: true, title: true } } },
        }),
        prisma.eBrochure.findMany({
          select: { id: true, slug: true, translations: { select: { locale: true, title: true } } },
        }),
        prisma.heroStorySlide.findMany({
          select: { id: true, translations: { select: { locale: true, label: true } } },
        }),
        prisma.siteCtaBlock.findMany({
          select: { id: true, translations: { select: { locale: true, title: true } } },
        }),
        prisma.corporateService.findMany({
          select: { id: true, translations: { select: { locale: true, label: true } } },
        }),
        prisma.whyUsPoint.findMany({
          select: { id: true, translations: { select: { locale: true, title: true } } },
        }),
        prisma.missionPrinciple.findMany({
          select: { id: true, translations: { select: { locale: true, title: true } } },
        }),
        prisma.award.findMany({
          select: { id: true, translations: { select: { locale: true, title: true } } },
        }),
        prisma.faq.findMany({
          select: { id: true, translations: { select: { locale: true, question: true } } },
        }),
        /* House types and facilities: per-project copy the public project
           page shows, and the two biggest sources of missing locales — a
           project complete in four languages could still show Russian
           readers English house-type descriptions. Listed under the
           project group, since that is where they are edited. */
        prisma.projectUnitType.findMany({
          where: { project: { deletedAt: null } },
          select: {
            id: true,
            name: true,
            projectId: true,
            translations: { select: { locale: true, description: true } },
          },
        }),
        prisma.projectFacility.findMany({
          where: { project: { deletedAt: null } },
          select: { id: true, projectId: true, translations: { select: { locale: true, name: true } } },
        }),
      ]);

      const projectItems: TranslationStatusItem[] = projects
        .map((project) => {
          const localeText = project.translations.map((row) => ({ locale: row.locale, primary: row.name }));
          return {
            id: project.id,
            label: referenceLabel(localeText, project.slug),
            editHref: `/projects/${project.id}/edit`,
            section: "projects" as const,
            missingLocales: missingLocalesOf(localeText),
          };
        })
        .filter((item) => item.missingLocales.length > 0);

      const newsItems: TranslationStatusItem[] = news
        .map((article) => {
          const localeText = article.translations.map((row) => ({ locale: row.locale, primary: row.title }));
          return {
            id: article.id,
            label: referenceLabel(localeText, article.slug),
            editHref: `/news/${article.id}/edit`,
            section: "news" as const,
            missingLocales: missingLocalesOf(localeText),
          };
        })
        .filter((item) => item.missingLocales.length > 0);

      const eventItems: TranslationStatusItem[] = events
        .map((event) => {
          const localeText = event.translations.map((row) => ({ locale: row.locale, primary: row.title }));
          return {
            id: event.id,
            label: referenceLabel(localeText, event.slug),
            editHref: `/events/${event.id}/edit`,
            section: "events" as const,
            missingLocales: missingLocalesOf(localeText),
          };
        })
        .filter((item) => item.missingLocales.length > 0);

      const brochureItems: TranslationStatusItem[] = brochures
        .map((brochure) => {
          const localeText = brochure.translations.map((row) => ({ locale: row.locale, primary: row.title }));
          return {
            id: brochure.id,
            label: referenceLabel(localeText, brochure.slug),
            editHref: `/e-brochures/${brochure.id}/edit`,
            section: "eBrochures" as const,
            missingLocales: missingLocalesOf(localeText),
          };
        })
        .filter((item) => item.missingLocales.length > 0);

      const staticItems: TranslationStatusItem[] = [
        ...staticPageItems({
          section: "heroSlides",
          sectionLabel: "Hero",
          editHref: "/pages/home/hero",
          rows: heroSlides,
          id: (row) => row.id,
          toLocaleText: (row) => row.translations.map((t) => ({ locale: t.locale, primary: t.label })),
        }),
        ...staticPageItems({
          section: "cta",
          sectionLabel: "Closing CTA",
          editHref: "/pages/home/cta",
          rows: ctaBlocks,
          id: (row) => row.id,
          toLocaleText: (row) => row.translations.map((t) => ({ locale: t.locale, primary: t.title })),
        }),
        ...staticPageItems({
          section: "corporate",
          sectionLabel: "Corporate Services",
          editHref: "/pages/about/corporate",
          rows: corporateServices,
          id: (row) => row.id,
          toLocaleText: (row) => row.translations.map((t) => ({ locale: t.locale, primary: t.label })),
        }),
        ...staticPageItems({
          section: "whyUs",
          sectionLabel: "Why Us",
          editHref: "/pages/about/why-us",
          rows: whyUsPoints,
          id: (row) => row.id,
          toLocaleText: (row) => row.translations.map((t) => ({ locale: t.locale, primary: t.title })),
        }),
        ...staticPageItems({
          section: "mission",
          sectionLabel: "Mission",
          editHref: "/pages/about/mission",
          rows: missionPrinciples,
          id: (row) => row.id,
          toLocaleText: (row) => row.translations.map((t) => ({ locale: t.locale, primary: t.title })),
        }),
        ...staticPageItems({
          section: "awards",
          sectionLabel: "Awards",
          editHref: "/pages/about/awards",
          rows: awards,
          id: (row) => row.id,
          toLocaleText: (row) => row.translations.map((t) => ({ locale: t.locale, primary: t.title })),
        }),
        ...staticPageItems({
          section: "faq",
          sectionLabel: "FAQ",
          editHref: "/pages/faq",
          rows: faqs,
          id: (row) => row.id,
          toLocaleText: (row) => row.translations.map((t) => ({ locale: t.locale, primary: t.question })),
        }),
      ];

      const unitTypeItems: TranslationStatusItem[] = unitTypes
        .map((type) => {
          const localeText = type.translations.map((row) => ({ locale: row.locale, primary: row.description }));
          return {
            id: type.id,
            section: "unitTypes" as const,
            label: `House type — ${type.name}`,
            editHref: `/projects/${type.projectId}/unit-types`,
            missingLocales: missingLocalesOf(localeText),
          };
        })
        .filter((item) => item.missingLocales.length > 0);

      const facilityItems: TranslationStatusItem[] = facilities
        .map((facility) => {
          const localeText = facility.translations.map((row) => ({ locale: row.locale, primary: row.name }));
          return {
            id: facility.id,
            section: "facilities" as const,
            label: `Facility — ${referenceLabel(localeText, "(untitled)")}`,
            editHref: `/projects/${facility.projectId}/facilities`,
            missingLocales: missingLocalesOf(localeText),
          };
        })
        .filter((item) => item.missingLocales.length > 0);

      const sections: TranslationStatusReport["sections"] = [
        { section: "projects", group: "projects", total: projects.length },
        { section: "unitTypes", group: "projects", total: unitTypes.length },
        { section: "facilities", group: "projects", total: facilities.length },
        { section: "news", group: "news", total: news.length },
        { section: "events", group: "events", total: events.length },
        { section: "eBrochures", group: "eBrochures", total: brochures.length },
        { section: "heroSlides", group: "staticPages", total: heroSlides.length },
        { section: "cta", group: "staticPages", total: ctaBlocks.length },
        { section: "corporate", group: "staticPages", total: corporateServices.length },
        { section: "whyUs", group: "staticPages", total: whyUsPoints.length },
        { section: "mission", group: "staticPages", total: missionPrinciples.length },
        { section: "awards", group: "staticPages", total: awards.length },
        { section: "faq", group: "staticPages", total: faqs.length },
      ];

      const groups: TranslationStatusGroup[] = [
        { group: "projects", items: [...projectItems, ...unitTypeItems, ...facilityItems] },
        { group: "news", items: newsItems },
        { group: "events", items: eventItems },
        { group: "eBrochures", items: brochureItems },
        { group: "staticPages", items: staticItems },
      ];

      const totalItems = sections.reduce((sum, entry) => sum + entry.total, 0);

      return { groups, sections, totalItems };
    },
    EMPTY_TRANSLATION_REPORT,
  );
}

/** Per-locale gap count across every group — the header's "3 languages,
 *  X items missing something" summary. Derived from the same report
 *  rather than a second query, so the two can never disagree. */
export function translationLocaleTotals(report: TranslationStatusReport): TranslationLocaleTotal[] {
  return LOCALE_DISPLAY_ORDER.map((locale) => ({
    locale,
    missing: report.groups
      .flatMap((group) => group.items)
      .filter((item) => item.missingLocales.includes(locale)).length,
    total: report.totalItems,
  }));
}

export async function getLocaleCompletenessSummary(): Promise<LocaleCompletenessSummary> {
  return safeQuery(
    "dashboard:localeCompleteness",
    async () => {
      const [projects, news, events, brochures] = await Promise.all([
        prisma.project.findMany({
          where: { deletedAt: null },
          select: { translations: { select: { locale: true, name: true } } },
        }),
        prisma.newsArticle.findMany({
          where: { deletedAt: null },
          select: { translations: { select: { locale: true, title: true } } },
        }),
        prisma.event.findMany({
          select: { translations: { select: { locale: true, title: true } } },
        }),
        prisma.eBrochure.findMany({
          select: { translations: { select: { locale: true, title: true } } },
        }),
      ]);

      const allRows = [...projects, ...news, ...events, ...brochures];
      const total = allRows.length;

      let missingCount = 0;
      const haveCountByLocale = new Map<string, number>();

      for (const row of allRows) {
        const have = localesPresent(row.translations);
        for (const locale of locales) {
          if (have.has(locale)) {
            haveCountByLocale.set(locale, (haveCountByLocale.get(locale) ?? 0) + 1);
          } else {
            missingCount += 1;
          }
        }
      }

      const rows = (locales as readonly string[]).map((locale) => ({
        locale,
        percent:
          total === 0 ? 0 : Math.round(((haveCountByLocale.get(locale) ?? 0) / total) * 100),
      }));

      return { rows, missingCount };
    },
    EMPTY_SUMMARY,
  );
}
