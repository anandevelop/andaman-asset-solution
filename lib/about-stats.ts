/**
 * lib/about-stats.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The four figures in the About page's stat bar: developments, villas,
 * square metres and years in Phuket.
 *
 * Each one is counted from the published projects (the years from the
 * founding year), so by default the About page cannot contradict
 * /projects. The client still needs to state a figure the database cannot
 * produce, such as land in a project that is not listed yet, or "20+"
 * where the count says 21. Each figure therefore takes an override,
 * typed in /admin/pages/about/figures and stored as a SiteSetting
 * (aboutStats.*). A blank override means "count it".
 * The override is shown exactly as typed, so "1,200+" stays "1,200+".
 *
 * The years count from CompanyProfile.foundedYear (/admin/pages/about/
 * story) when it is set, and only fall back to COMPANY_FOUNDED_YEAR. Before
 * this, the page counted from the constant alone, and changing the founding
 * year in the admin did not reach this number.
 *
 * Pure, so the public page, the admin form's placeholders and the admin
 * sidebar card all compute the same numbers.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { COMPANY_FOUNDED_YEAR } from "@/content/company-timeline";
import { formatNumber } from "@/lib/format";

export const ABOUT_STAT_KEYS = ["projects", "units", "landArea", "years"] as const;
export type AboutStatKey = (typeof ABOUT_STAT_KEYS)[number];

type ProjectFigures = { totalUnits: number | null; landAreaSqm: number | null };

/** What the page shows with no override, already formatted for `locale`. */
export function countedAboutStats(
  locale: string,
  projects: readonly ProjectFigures[],
  foundedYear: number | null,
  now: Date = new Date(),
): Record<AboutStatKey, string> {
  const units = projects.reduce((sum, p) => sum + (p.totalUnits ?? 0), 0);
  const land = projects.reduce((sum, p) => sum + (p.landAreaSqm ?? 0), 0);
  const years = Math.max(1, now.getFullYear() - (foundedYear ?? COMPANY_FOUNDED_YEAR));
  return {
    projects: formatNumber(locale, projects.length),
    units: formatNumber(locale, units),
    landArea: formatNumber(locale, Math.round(land)),
    years: `${formatNumber(locale, years)}+`,
  };
}

/** Overrides win per figure; whitespace counts as blank. */
export function resolveAboutStats(
  counted: Record<AboutStatKey, string>,
  overrides: Partial<Record<AboutStatKey, string>>,
): Record<AboutStatKey, string> {
  const out = { ...counted };
  for (const key of ABOUT_STAT_KEYS) {
    const typed = overrides[key]?.trim();
    if (typed) out[key] = typed;
  }
  return out;
}
