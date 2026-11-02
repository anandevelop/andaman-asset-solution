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
import { adminLocales, locales } from "@/i18n";
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

/**
 * Is `path` somewhere on the public site an admin page may link back to?
 * "/th/projects/x" yes; "//evil.com", "https://…", "/th/admin/…" no. The
 * check behind components/admin/ReturnToSite.tsx, which takes it from a
 * query string anyone can write.
 */
export function isReturnPath(path: string): boolean {
  if (path.length > 300) return false;
  const match = path.match(new RegExp(`^/(${locales.join("|")})(/[\\p{L}\\p{M}\\p{N}._~%\\-/]*)?$`, "u"));
  if (!match) return false;
  const rest = match[2] ?? "";
  return !rest.includes("//") && !/^\/admin(\/|$)/.test(rest) && !/^\/login(\/|$)/.test(rest);
}

/** `href` (under /{locale}/admin) carrying where the editor came from. */
export function withReturnTo(href: string, from: string | null | undefined): string {
  if (!from || !isReturnPath(from)) return href;
  return `${href}${href.includes("?") ? "&" : "?"}from=${encodeURIComponent(from)}`;
}

/**
 * Spread on every link from the public site into the admin: the editor
 * opens in a new tab, so the page being edited stays where it was, scrolled
 * to the band that was clicked. `data-edit-admin` is what
 * EditModeProvider watches to refresh this tab when the editor comes back
 * to it, so a save made in the admin tab shows here without a manual reload.
 * noopener: the admin tab has no reason to reach back into this one.
 */
export const ADMIN_LINK_PROPS = {
  target: "_blank",
  rel: "noopener",
  "data-edit-admin": "",
} as const;

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
/**
 * How an admin path travels in the public page.
 *
 * These hrefs reach the browser as props of client components, so they sit
 * in the RSC payload of every cached public page — including for visitors
 * who never see a button. Written as "/news/ID/edit" they looked like links
 * to Googlebot, which crawled them as /th/news/ID/edit and reported a pile
 * of 404s (and /e-brochures/ID/edit, /projects/ID/content…). So they are
 * carried without slashes ("news~ID~edit") and only turned back into a path
 * in the browser, when a signed-in editor is shown the button.
 */
const SEP = "~";

/** "/news/ID/edit" → "news~ID~edit". */
export function ref(path: string): string {
  return path.replace(/^\//, "").split("/").join(SEP);
}

/** The same for a list of links (home-outline's are written as paths). */
export function refLinks(links: readonly EditLink[]): EditLink[] {
  return links.map((link) => ({ ...link, href: ref(link.href) }));
}

/** "news~ID~edit" → "/news/ID/edit". Paths already in that form pass through. */
export function adminPath(href: string): string {
  if (href.startsWith("/")) return href;
  return `/${href.split(SEP).join("/")}`;
}

export const PAGE_EDIT_LINKS: Readonly<Record<string, EditLink>> = {
  "/": { labelKey: "homePage", href: ref("/pages/home") },
  "/about": { labelKey: "aboutStory", href: ref("/pages/about/story") },
  "/achievements": { labelKey: "aboutAwards", href: ref("/pages/about/awards") },
  "/contact": { labelKey: "contactPage", href: ref("/pages/contact") },
  "/projects": { labelKey: "projectsBanner", href: ref("/pages/projects") },
  "/progress": { labelKey: "progress", href: ref("/progress") },
  "/news": { labelKey: "news", href: ref("/news") },
  "/events": { labelKey: "events", href: ref("/events") },
  "/e-brochure": { labelKey: "brochures", href: ref("/e-brochures") },
  "/privacy-policy": { labelKey: "siteCopy", href: ref("/pages/copy?ns=privacyPolicy") },
  "/terms": { labelKey: "siteCopy", href: ref("/pages/copy?ns=terms") },
};

export function pageEditLink(pathname: string): EditLink | null {
  return PAGE_EDIT_LINKS[stripLocale(pathname)] ?? null;
}

/** Item-level editors, keyed by what a card shows. `id` is the row's id. */
export const ITEM_EDIT_HREF = {
  project: (id: string) => ref(`/projects/${id}/edit`),
  projectProgress: (id: string) => ref(`/projects/${id}/progress`),
  article: (id: string) => ref(`/news/${id}/edit`),
  event: (id: string) => ref(`/events/${id}/edit`),
  brochure: (id: string) => ref(`/e-brochures/${id}/edit`),
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
    hero: [{ labelKey: "projectOverview", href: ref(`${base}/edit`) }],
    narrative: [
      { labelKey: "projectContent", href: ref(`${base}/content`) },
      { labelKey: "projectOverview", href: ref(`${base}/edit`) },
    ],
    facilities: [{ labelKey: "projectFacilities", href: ref(`${base}/facilities`) }],
    gallery: [{ labelKey: "projectOverview", href: ref(`${base}/edit`) }],
    unitTypes: [{ labelKey: "projectUnitTypes", href: ref(`${base}/unit-types`) }],
    sitePlan: [
      { labelKey: "projectSitePlan", href: ref(`${base}/site-plan`) },
      { labelKey: "projectUnits", href: ref(`${base}/units`) },
    ],
    // The map's pin and address are project details; its Nearby tabs are
    // their own tab (lib/nearby.ts).
    location: [
      { labelKey: "projectOverview", href: ref(`${base}/edit`) },
      { labelKey: "projectNearby", href: ref(`${base}/nearby`) },
    ],
    progress: [{ labelKey: "progress", href: ref(`${base}/progress`) }],
  } satisfies Record<string, EditLink[]>;
}

/** The About page's bands. */
export const ABOUT_SECTION_LINKS = {
  hero: [{ labelKey: "aboutStory", href: ref("/pages/about/story") }],
  // Counted from the projects unless overridden there; see lib/about-stats.ts.
  stats: [{ labelKey: "aboutFigures", href: ref("/pages/about/figures") }],
  story: [{ labelKey: "aboutStory", href: ref("/pages/about/story") }],
  principles: [{ labelKey: "aboutMission", href: ref("/pages/about/mission") }],
  timeline: [{ labelKey: "aboutMilestones", href: ref("/pages/about/milestones") }],
} satisfies Record<string, EditLink[]>;

/** The contact page: its words are site copy; its details are settings. */
export const CONTACT_SECTION_LINKS = {
  header: [{ labelKey: "siteCopy", href: ref("/pages/copy?ns=contact") }],
  details: [
    { labelKey: "contactPage", href: ref("/pages/contact") },
    { labelKey: "siteCopy", href: ref("/pages/copy?ns=contact") },
  ],
  map: [{ labelKey: "contactPage", href: ref("/pages/contact") }],
} satisfies Record<string, EditLink[]>;

/** /achievements: narrative from content/achievements.ts, awards from the table. */
export const ACHIEVEMENTS_SECTION_LINKS = {
  copy: [{ labelKey: "siteCopy", href: ref("/pages/copy?ns=achievementsPage") }],
  awards: [{ labelKey: "aboutAwards", href: ref("/pages/about/awards") }],
} satisfies Record<string, EditLink[]>;

/** /progress: a heading over one card per project. */
export const PROGRESS_SECTION_LINKS = {
  header: [{ labelKey: "siteCopy", href: ref("/pages/copy?ns=progress") }],
  projects: [{ labelKey: "progress", href: ref("/progress") }],
} satisfies Record<string, EditLink[]>;

/**
 * The home page's three auto-filled sections have no editor of their own
 * in lib/home-outline.ts (they are lists of published rows), but the list
 * screen that publishes those rows is still the useful place to land.
 */
export const HOME_AUTO_SECTION_LINKS: Readonly<Record<string, EditLink[]>> = {
  FEATURED_PROJECTS: [{ labelKey: "projects", href: ref("/projects") }],
  UPCOMING_EVENT: [{ labelKey: "events", href: ref("/events") }],
  LATEST_NEWS: [{ labelKey: "news", href: ref("/news") }],
};

/** The closing CTA band mounted site-wide by the (site) layout. */
export const SITE_CTA_LINKS: EditLink[] = [{ labelKey: "closingCta", href: ref("/pages/home/cta") }];
