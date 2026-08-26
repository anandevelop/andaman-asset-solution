/**
 * content/company-timeline.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Real company project history for the About page's "Milestones" timeline,
 * transcribed from the company's own portfolio timeline graphic (2005–2023).
 *
 * Project names are proper nouns — invariant across th/en/zh/ru, same as
 * project names anywhere else on the site — so this lives as plain data,
 * not an i18n message. Only the section's eyebrow/title/founding-line copy
 * is translated (messages/*.json, `about.timeline`).
 *
 * COMPANY_FOUNDED_YEAR (2005) is the single source of truth for both the
 * timeline's starting point and the About page's "years of experience"
 * stat (app/[locale]/(site)/about/page.tsx) — previously a separate,
 * inconsistent constant (2019) with no real basis. Update this one value if
 * the founding year is ever corrected; nothing else needs to change.
 *
 * The two 2019 groups visible as separate clusters in the source graphic
 * (Harmony Phase 1/2-3 + Citygate Kamala, and The Granary/The Nest) are
 * merged into one 2019 entry here — they were split only by the graphic's
 * row-wrapping layout, not by anything meaningful about the year itself.
 *
 * `brand` is set only where the source graphic showed a "BY ..." sub-label
 * — later projects sold under the Andaman Asset Solution or Wallaya Villas
 * names specifically, as distinct from the earlier, unlabelled projects.
 * ─────────────────────────────────────────────────────────────────────────
 */

export const COMPANY_FOUNDED_YEAR = 2005;

export type TimelineProject = {
  name: string;
  brand?: string;
};

export type TimelineYear = {
  year: number;
  projects: TimelineProject[];
};

export const COMPANY_TIMELINE: TimelineYear[] = [
  { year: 2009, projects: [{ name: "The Tree Residence" }] },
  { year: 2010, projects: [{ name: "Zen Space" }] },
  { year: 2014, projects: [{ name: "Iconpark" }] },
  { year: 2015, projects: [{ name: "Natural Touch" }] },
  {
    year: 2017,
    projects: [
      { name: "Wallaya Villas by the Lake" },
      { name: "Wallaya Grand Residence" },
      { name: "Natural Park Villas" },
    ],
  },
  {
    year: 2018,
    projects: [
      { name: "Natural Park Pavillion" },
      { name: "Natural Park Habitat" },
      { name: "Oceana Kamala" },
      { name: "Wallaya Villas Pasak Soi 8" },
    ],
  },
  {
    year: 2019,
    projects: [
      { name: "Wallaya Villas Harmony Phase 1" },
      { name: "Wallaya Villas Harmony Phase 2-3" },
      { name: "Citygate Kamala" },
      { name: "Wallaya Villas The Granary" },
      { name: "Wallaya Villas The Nest" },
    ],
  },
  {
    year: 2020,
    projects: [
      { name: "Wallaya Villas The Element" },
      { name: "Wallaya Villas Town at Chalong" },
    ],
  },
  {
    year: 2021,
    projects: [
      { name: "The Residence", brand: "Andaman Asset Solution" },
      { name: "The Trinity", brand: "Andaman Asset Solution" },
      { name: "The Victory", brand: "Andaman Asset Solution" },
    ],
  },
  {
    year: 2022,
    projects: [{ name: "Luxpride 1–2", brand: "Wallaya Villas" }],
  },
  {
    year: 2023,
    projects: [
      { name: "The Trinity Village", brand: "Andaman Asset Solution" },
      { name: "Luxpride 3–4", brand: "Wallaya Villas" },
      { name: "The Residence Prime", brand: "Andaman Asset Solution" },
      { name: "The Trinity Prime", brand: "Andaman Asset Solution" },
    ],
  },
];
