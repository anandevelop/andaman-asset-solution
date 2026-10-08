/**
 * lib/edit-mode.ts
 * ─────────────────────────────────────────────────────────────────────────
 * "Edit this" on the public site — the rules, with no React in them.
 *
 * WHAT THE FEATURE IS
 *
 * Someone who maintains the site is usually looking at the site when they
 * notice the thing that needs changing: a stale banner, a typo in an FAQ,
 * a sold-out project still saying "selling". Until now the next step was
 * to open /admin and work out which of ~40 screens writes that band of
 * that page — and lib/home-outline.ts exists precisely because the honest
 * answer is often "a different page's editor" (the home page's awards are
 * the About page's awards). So a signed-in editor now sees an admin bar
 * on the public site and an "Edit" pill on each band, linking straight to
 * the screen that owns it.
 *
 * WHY THE CHECK HAPPENS IN THE BROWSER
 *
 * Every public route is statically rendered with `revalidate` set. Reading
 * the session on the server would either take each route dynamic (slower
 * for every visitor, and forbidden outright on a route with `revalidate` —
 * DYNAMIC_SERVER_USAGE, see app/[locale]/(site)/layout.tsx) or, worse,
 * bake one editor's buttons into the cached HTML that every visitor is
 * then served. So the cached page carries only inert hrefs, and
 * components/edit/EditModeProvider.tsx asks /api/auth/session after
 * hydration whether to show anything.
 *
 * THIS IS A CONVENIENCE, NOT A PERMISSION
 *
 * A pill is only a link. Every admin route still runs requireAdmin and
 * every action its own guard (lib/admin/guard.ts); someone who forged the
 * session response would get a button to a login page.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { Role } from "@prisma/client";
import { adminLocales } from "@/i18n";
import { hasRole } from "@/lib/role-rank";
import { stripLocale } from "@/lib/public-paths";

/**
 * Who sees the bar. EDITOR, because that is the rank every content
 * screen's write path requires (lib/permissions.ts editContent). A VIEWER
 * could open the screens read-only, but a button labelled "Edit" that
 * leads to a disabled form is a worse experience than no button.
 */
export const EDIT_MIN_ROLE: Role = "EDITOR";

export function canSeeEditMode(role: Role | null | undefined): boolean {
  return hasRole(role, EDIT_MIN_ROLE);
}

/**
 * `/{locale}/admin` for a public page in `locale`. The back office only
 * renders in Thai and English (i18n.ts adminLocales) and proxy.ts bounces
 * anything else; going there directly saves the visible redirect.
 */
export function adminBaseFor(locale: string): string {
  const target = (adminLocales as readonly string[]).includes(locale) ? locale : "th";
  return `/${target}/admin`;
}

/** One link out of a band of the page. `href` is under `/{locale}/admin`. */
export type EditLink = {
  /** i18n key suffix under editMode.editors.* */
  labelKey: string;
  href: string;
};

/**
 * The page-level "Edit this page" button, for pages whose editor follows
 * from the path alone. Detail pages (one project, one article) need a
 * database id the path does not carry; they mount <EditTarget> instead,
 * which takes precedence over this table.
 *
 * Exact paths, not prefixes: /news/some-slug must not fall back to the
 * news list when its page forgot to mount a target — no button is better
 * than the wrong one.
 */
export const PAGE_EDIT_LINKS: Readonly<Record<string, EditLink>> = {
  "/": { labelKey: "homePage", href: "/pages/home" },
  "/about": { labelKey: "aboutStory", href: "/pages/about/story" },
  "/achievements": { labelKey: "aboutAwards", href: "/pages/about/awards" },
  "/contact": { labelKey: "contactPage", href: "/pages/contact" },
  "/projects": { labelKey: "projectsBanner", href: "/pages/projects" },
  "/progress": { labelKey: "progress", href: "/progress" },
  "/news": { labelKey: "news", href: "/news" },
  "/events": { labelKey: "events", href: "/events" },
  "/e-brochure": { labelKey: "brochures", href: "/e-brochures" },
  "/privacy-policy": { labelKey: "siteCopy", href: "/pages/copy?ns=privacyPolicy" },
  "/terms": { labelKey: "siteCopy", href: "/pages/copy?ns=terms" },
};

export function pageEditLink(pathname: string): EditLink | null {
  return PAGE_EDIT_LINKS[stripLocale(pathname)] ?? null;
}

/** Item-level editors, keyed by what a card shows. `id` is the row's id. */
export const ITEM_EDIT_HREF = {
  project: (id: string) => `/projects/${id}/edit`,
  article: (id: string) => `/news/${id}/edit`,
  event: (id: string) => `/events/${id}/edit`,
  brochure: (id: string) => `/e-brochures/${id}/edit`,
} as const;

/**
 * The bands of one project's detail page and the tab that owns each.
 * The overview tab (edit) owns images, location and anything untranslated;
 * the content tab owns the translated narrative — see the header of
 * app/[locale]/admin/(catalog)/projects/[id]/content/page.tsx.
 */
export function projectSectionLinks(id: string) {
  const base = `/projects/${id}`;
  return {
    hero: [{ labelKey: "projectOverview", href: `${base}/edit` }],
    narrative: [
      { labelKey: "projectContent", href: `${base}/content` },
      { labelKey: "projectOverview", href: `${base}/edit` },
    ],
    facilities: [{ labelKey: "projectFacilities", href: `${base}/facilities` }],
    gallery: [{ labelKey: "projectOverview", href: `${base}/edit` }],
    unitTypes: [{ labelKey: "projectUnitTypes", href: `${base}/unit-types` }],
    sitePlan: [
      { labelKey: "projectSitePlan", href: `${base}/site-plan` },
      { labelKey: "projectUnits", href: `${base}/units` },
    ],
    location: [{ labelKey: "projectOverview", href: `${base}/edit` }],
    progress: [{ labelKey: "progress", href: `${base}/progress` }],
  } satisfies Record<string, EditLink[]>;
}

/** The About page's bands. Its stat bar is computed, so it has none. */
export const ABOUT_SECTION_LINKS = {
  hero: [{ labelKey: "aboutStory", href: "/pages/about/story" }],
  story: [{ labelKey: "aboutStory", href: "/pages/about/story" }],
  principles: [{ labelKey: "aboutMission", href: "/pages/about/mission" }],
  timeline: [{ labelKey: "aboutMilestones", href: "/pages/about/milestones" }],
} satisfies Record<string, EditLink[]>;

/**
 * The home page's three auto-filled sections have no editor of their own
 * in lib/home-outline.ts (they are lists of published rows), but the list
 * screen that publishes those rows is still the useful place to land.
 */
export const HOME_AUTO_SECTION_LINKS: Readonly<Record<string, EditLink[]>> = {
  FEATURED_PROJECTS: [{ labelKey: "projects", href: "/projects" }],
  UPCOMING_EVENT: [{ labelKey: "events", href: "/events" }],
  LATEST_NEWS: [{ labelKey: "news", href: "/news" }],
};

/** The closing CTA band mounted site-wide by the (site) layout. */
export const SITE_CTA_LINKS: EditLink[] = [{ labelKey: "closingCta", href: "/pages/home/cta" }];
