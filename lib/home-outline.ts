/**
 * lib/home-outline.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The home page from top to bottom, and who owns each band of it.
 *
 * WHAT THIS IS FOR
 *
 * /admin/pages/home used to be four tabs: one that ordered and hid the nine
 * reorderable sections, and three that edited the banner, the photo strip
 * and the closing CTA. Reordering and writing were therefore two different
 * screens, and — worse — the three writing screens were not in the order
 * list at all, so the list was not a picture of the page. You could not
 * look anywhere and see what the home page consists of.
 *
 * The harder half is that the home page is a *summary* page. Six of its
 * nine reorderable sections are the About page's or the FAQ page's content
 * shown again, and three are filled automatically from published projects,
 * events and articles. Only three bands are the home page's own: the
 * banner, the photo strip inside "Who we are", and the closing CTA. Nothing
 * on screen said any of that, so "edit the awards section of the home page"
 * looked like a thing this screen should let you do.
 *
 * So each row names its editors rather than pretending to be one. A row
 * with no editor at all (`auto`) says where the data comes from instead —
 * previously those sections simply had no explanation for why they could
 * not be edited.
 *
 * WHY IT IS A STATIC TABLE AND NOT DERIVED
 *
 * "Which admin screen writes the copy this section renders" is a fact about
 * two other route trees, not something queryable. It is recorded here in
 * the same spirit as lib/seo-audit.ts's STRUCTURED_DATA: keep it honest by
 * updating it in the same commit that moves one of those screens.
 * tests/admin/home-outline.test.ts checks every href resolves to a real
 * route, which is the half that can be checked mechanically.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { HOME_SECTION_KEYS, type HomeSectionKey } from "@/lib/home-sections";

/** Where a band of the page is written. `auto` has no form anywhere. */
export type OutlineEditor = {
  /** i18n key suffix under admin.homeBuilder.editor.* */
  labelKey: string;
  /** Under `/{locale}/admin`. */
  href: string;
};

export type OutlineRow = {
  /**
   * A HomeSectionKey for the nine the order list controls, or "HERO" /
   * "CTA" for the two fixed bands that have never had a HomeSection row —
   * see the comment on HOME_SECTION_KEYS for why they do not get one.
   */
  key: HomeSectionKey | "HERO" | "CTA";
  /** i18n key suffix under admin.homeBuilder.sections.* */
  labelKey: string;
  /** Can it be moved or hidden? False for the two fixed bands. */
  managed: boolean;
  /** Empty = filled automatically; `note` then says from what. */
  editors: OutlineEditor[];
  /** i18n key suffix under admin.homeBuilder.auto.* for an `auto` row. */
  autoKey?: string;
};

/**
 * In the order the page renders, which is not the order of
 * HOME_SECTION_KEYS: the banner is always first and the closing CTA always
 * last, neither being reorderable, and the nine in between move.
 *
 * The nine are listed here in their *default* order only. The live order
 * comes from the HomeSection table — see getAllSectionRows() — and this
 * table is joined onto it by key, so a reorder does not have to be
 * mirrored here.
 */
export const HOME_OUTLINE: readonly OutlineRow[] = [
  {
    key: "HERO",
    labelKey: "hero",
    managed: false,
    editors: [{ labelKey: "heroSlides", href: "/pages/home/hero" }],
  },
  {
    key: "COMPANY_INTRO",
    labelKey: "companyIntro",
    managed: true,
    /* Two owners, which is the clearest case for this table existing: the
       words come from the About page's story and the photographs from a
       screen under this one. Nothing previously said either. */
    editors: [
      { labelKey: "aboutStory", href: "/pages/about/story" },
      { labelKey: "homeGallery", href: "/pages/home/gallery" },
    ],
  },
  {
    key: "VISION_MISSION",
    labelKey: "visionMission",
    managed: true,
    editors: [{ labelKey: "aboutMission", href: "/pages/about/mission" }],
  },
  {
    key: "FEATURED_PROJECTS",
    labelKey: "featuredProjects",
    managed: true,
    editors: [],
    autoKey: "featuredProjects",
  },
  {
    key: "CORPORATE",
    labelKey: "corporate",
    managed: true,
    editors: [{ labelKey: "aboutCorporate", href: "/pages/about/corporate" }],
  },
  {
    key: "AWARDS",
    labelKey: "awards",
    managed: true,
    editors: [{ labelKey: "aboutAwards", href: "/pages/about/awards" }],
  },
  {
    key: "WHY_US",
    labelKey: "whyUs",
    managed: true,
    editors: [{ labelKey: "aboutWhyUs", href: "/pages/about/why-us" }],
  },
  {
    key: "UPCOMING_EVENT",
    labelKey: "upcomingEvent",
    managed: true,
    editors: [],
    autoKey: "upcomingEvent",
  },
  {
    key: "LATEST_NEWS",
    labelKey: "latestNews",
    managed: true,
    editors: [],
    autoKey: "latestNews",
  },
  {
    key: "FAQ",
    labelKey: "faq",
    managed: true,
    editors: [{ labelKey: "faq", href: "/pages/faq" }],
  },
  {
    key: "CTA",
    labelKey: "cta",
    managed: false,
    editors: [{ labelKey: "closingCta", href: "/pages/home/cta" }],
  },
] as const;

/** The outline row for one section key. */
export function outlineFor(key: string): OutlineRow | undefined {
  return HOME_OUTLINE.find((row) => row.key === key);
}

/** The two fixed bands, in render position. */
export const HERO_ROW = HOME_OUTLINE[0];
export const CTA_ROW = HOME_OUTLINE[HOME_OUTLINE.length - 1];

/** Every managed key the outline covers — must be exactly the nine the
 *  order list knows about, which the test asserts in both directions. */
export const OUTLINE_MANAGED_KEYS: readonly HomeSectionKey[] = HOME_OUTLINE.filter(
  (row) => row.managed,
).map((row) => row.key as HomeSectionKey);

/** True when the outline and lib/home-sections.ts agree. Exported so the
 *  disagreement is a test failure rather than a row that silently renders
 *  without a label. */
export function outlineCoversEverySection(): boolean {
  return (
    OUTLINE_MANAGED_KEYS.length === HOME_SECTION_KEYS.length &&
    HOME_SECTION_KEYS.every((key) => OUTLINE_MANAGED_KEYS.includes(key))
  );
}
