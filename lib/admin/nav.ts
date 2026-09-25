/**
 * lib/admin/nav.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The single source of truth for the back office's menu structure.
 *
 * Used in three places:
 *   1. components/admin/AdminSidebar.tsx — draws the rail
 *   2. components/admin/CommandK.tsx     — feeds the search list
 *   3. components/admin/PageTabs.tsx     — draws in-page tabs (Phase 3)
 *
 * NOTHING `server-only` MAY BE IMPORTED HERE. This file is pulled into a
 * client component, and lib/role-rank.ts's header explains what happens
 * otherwise: several of lib/auth.ts's transitive imports are Node-only and
 * do not build for the browser at all. lib/permissions.ts is safe — it
 * imports the Role enum and nothing else.
 *
 * THE SHAPE, AND WHY IT IS NOT A RANK LADDER
 *
 * Role allow-lists rather than a minimum rank, capability AND-ed on top,
 * tabs and aliases declared per item — the blueprint's §4.2.
 *
 * The sidebar holds entities and pages only. Nineteen rows became
 * fourteen over two passes, and every removal is the same move: a row that
 * was really a view of something else became a tab of that something.
 *
 *   · eight section editors  → tabs of the Pages hub, whose ordering
 *                              screen already knew about them
 *   · Translations           → a tab of Review & publish
 *   · Brand & SEO settings   → a tab of the SEO hub
 *   · Company / Contact      → tabs of the Pages hub; both edited a public
 *                              page from inside the settings drawer
 *   · Progress / E-brochures → tabs of the project workspace, plus a
 *                              cross-project strip on the projects list
 *   · Appointments           → a tab of Leads
 *   · Mobile view            → still a row, but `mobileOnly`: the drawer
 *                              draws it, the desktop rail does not
 *
 * Six groups, named after the job rather than the department: the SEO and
 * analytics rows used to sit under "Administration" beside user accounts
 * and the audit log, which put "how is the site doing" and "who deleted
 * that" in one list.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Building2,
  CalendarClock,
  CalendarDays,
  Contact,
  FileCheck2,
  Files,
  History,
  LayoutDashboard,
  LibraryBig,
  Newspaper,
  Search,
  Settings,
  ShieldCheck,
  Smartphone,
  Users,
} from "lucide-react";
import { Role } from "@prisma/client";
import { can, type Capability } from "@/lib/permissions";
import type { AdminNavCounts } from "@/lib/admin-nav-counts";

/* ── Ready-made role sets ───────────────────────────────────────────── */

/**
 * An allow-list, not a threshold — see the blueprint's §4.1. `minRole` is a
 * single ladder and grants everything below it, which breaks the moment
 * two roles are not really ordered: EDITOR writes copy but must not read
 * PDPA data, SALES reads leads but must not edit copy. Neither outranks
 * the other, and the ladder had to pick one, which is how a content editor
 * ended up with a "Mobile view" link that refused them.
 */
export const ROLE_SETS = {
  /** Anyone who can sign in at all. */
  EVERYONE: [Role.SUPER_ADMIN, Role.ADMIN, Role.EDITOR, Role.SALES, Role.VIEWER],

  /**
   * Content work.
   *
   * VIEWER joined in Phase 4, in the same change as the guard that admits
   * them: (catalog)/layout.tsx and (content)/layout.tsx now guard with
   * requireCapability(locale, "viewContent"), which is true for VIEWER, so
   * the link this set puts in front of them is one the destination accepts
   * — not the "Mobile view" defect this file exists to avoid repeating.
   * VIEWER's own page guard still only ever reads; see the `canWrite`
   * fieldset on every page in both zones.
   */
  CONTENT: [Role.SUPER_ADMIN, Role.ADMIN, Role.EDITOR, Role.VIEWER],

  /** CRM work. EDITOR is absent on purpose — the enquiry list is not
   *  theirs to read (see viewAllLeads in lib/permissions.ts). */
  CRM: [Role.SUPER_ADMIN, Role.ADMIN, Role.SALES],

  /** Both: the sales roster is published on the website, so content people
   *  edit it and reps read it. VIEWER joined in Phase 4, as with CONTENT —
   *  sales-team/page.tsx's own guard is Role.SALES rank, which VIEWER does
   *  not meet, so VIEWER sees this link and the page turns it away. That
   *  is deliberate: nothing in (crm) opens a read floor for VIEWER the way
   *  (catalog)/(content) did, so this set stays as it would without the
   *  VIEWER row — kept here rather than silently dropped, since the next
   *  reader would otherwise re-derive the same "should VIEWER be here"
   *  question from scratch. */
  CONTENT_AND_CRM: [Role.SUPER_ADMIN, Role.ADMIN, Role.EDITOR, Role.SALES],

  ADMIN_UP: [Role.SUPER_ADMIN, Role.ADMIN],
  OWNER_ONLY: [Role.SUPER_ADMIN],

  /** Not CONTENT: the translation-status tab calls requireAdmin(locale,
   *  Role.EDITOR) with no read floor beneath it, so VIEWER — who the
   *  (content) zone does admit — must not be offered the tab.
   *
   *  This set used to exist for the (growth) zone's one ROUTE_EXCEPTIONS
   *  entry, back when the same screen lived at /seo/translations under an
   *  ADMIN floor it had to be exempted from. The screen moved into the
   *  publishing hub, where EDITOR is unremarkable, and the exception went
   *  with it — see (growth)/layout.tsx. */
  EDITOR_UP: [Role.SUPER_ADMIN, Role.ADMIN, Role.EDITOR],
} as const satisfies Record<string, readonly Role[]>;

/* ── Shapes ─────────────────────────────────────────────────────────── */

/** A node whose visibility can be decided — shared by items and tabs. */
type Gated = {
  /** A plain allow-list, not a ladder — see ROLE_SETS above. */
  roles: readonly Role[];
  /** AND-ed with `roles`. `roles` answers "whose menu is this?";
   *  capability answers "may they actually do it?", and
   *  lib/permissions.ts is what decides. */
  capability?: Capability;
};

/** An in-page tab. Never drawn as a row in the sidebar. */
export type NavTab = Gated & {
  key: string;
  /** Appended to the parent item's href ("" = the index tab). */
  segment: string;
};

/**
 * Tab strips that are not a sidebar item's own.
 *
 * The Pages hub is two levels deep — Home | About | Contact | FAQ across
 * the top, then the sections of About inside it — and only the first level
 * belongs to a nav item. The second level is keyed by the i18n group that
 * labels it (admin.tabs.pagesAbout.*), which is also what PageTabs is
 * handed, so one name identifies the strip, its labels and its config.
 *
 * Home had such a strip and no longer does. It drew Sections | Hero
 * Banner | Gallery | Closing CTA — an order list and three editors as
 * peers, which is exactly why the order list was not a picture of the
 * page. /admin/pages/home is that picture now and the three editors are
 * reached from the rows they belong to; see lib/home-outline.ts.
 */
export const NAV_TAB_GROUPS = {
  pages: [
    { key: "home", segment: "/home", roles: ROLE_SETS.CONTENT },
    { key: "about", segment: "/about", roles: ROLE_SETS.CONTENT },
    /* The blueprint always put `contact` here; the screen it points at
       finally exists, lifted out of settings/contact. ROLE_SETS.CONTENT
       like its siblings: the page admits VIEWER to read and gates saving
       to ADMIN with a disabled fieldset, exactly as settings did. */
    { key: "contact", segment: "/contact", roles: ROLE_SETS.CONTENT },
    { key: "faq", segment: "/faq", roles: ROLE_SETS.CONTENT },
  ],
  pagesAbout: [
    /* First, because it is the top of the public page and the thing
       somebody opens the About hub to change. It was /admin/settings/company
       — a whole other zone — until Phase 4. */
    { key: "story", segment: "/story", roles: ROLE_SETS.CONTENT },
    { key: "corporate", segment: "/corporate", roles: ROLE_SETS.CONTENT },
    { key: "whyUs", segment: "/why-us", roles: ROLE_SETS.CONTENT },
    { key: "mission", segment: "/mission", roles: ROLE_SETS.CONTENT },
    { key: "awards", segment: "/awards", roles: ROLE_SETS.CONTENT },
    { key: "milestones", segment: "/milestones", roles: ROLE_SETS.CONTENT },
  ],
  /**
   * Review & publish.
   *
   * The translation-status report used to be its own sidebar row under
   * SEO, which put "which locales are missing" and "what is waiting to go
   * live" in two different parts of the menu although they are the same
   * person's next action on the same record — and forced the (growth)
   * zone to carry a per-route exception for a screen that was never a
   * growth screen. It is a tab here instead.
   *
   * No `history` tab: the revision panel is not a page. It renders beside
   * the queue and is scoped to whichever row the queue is pointed at
   * (`?item=`), so a sibling route would either arrive with nothing
   * selected or need the selection carried across a navigation — and it
   * would take the history away from the queue it exists to annotate.
   */
  publishing: [
    { key: "queue", segment: "", roles: ROLE_SETS.CONTENT },
    { key: "translations", segment: "/translations", roles: ROLE_SETS.EDITOR_UP },
  ],
  /**
   * Sitewide SEO.
   *
   * Four of these five screens existed and three of them had no reliable
   * way in: keywords and links were reachable only from two buttons in the
   * overview's header, and /seo/urls from nowhere at all — it was linked
   * from the settings page it used to live on, and that link went when it
   * moved. `defaults` is the old /admin/settings/seo, which put the title
   * template and the default OG image in the settings drawer while every
   * other SEO control lived here.
   *
   * ADMIN_UP throughout, which is the zone's floor anyway — declared per
   * tab rather than inherited so the strip filters by the same rule
   * everything else does.
   */
  seo: [
    { key: "overview", segment: "", roles: ROLE_SETS.ADMIN_UP },
    { key: "keywords", segment: "/keywords", roles: ROLE_SETS.ADMIN_UP },
    { key: "links", segment: "/links", roles: ROLE_SETS.ADMIN_UP },
    { key: "urls", segment: "/urls", roles: ROLE_SETS.ADMIN_UP },
    { key: "defaults", segment: "/defaults", roles: ROLE_SETS.ADMIN_UP },
  ],
  /**
   * The three cross-project lists, which is the only thing "Progress" and
   * "E-brochures" ever were as sidebar rows.
   *
   * Everything those two rows led to about *one* project now lives under
   * /admin/projects/[id] (see components/ProjectHubTabs.tsx), so the rows
   * were down to a monthly log across every project and a brochure list
   * across every project — real screens, but not two of the fourteen
   * things the whole back office is organised around.
   *
   * SEGMENTS ARE ABSOLUTE HERE
   *
   * Unlike every other strip, these are not under their parent's href:
   * /admin/progress and /admin/e-brochures kept their addresses, because
   * nothing about them is per-project and moving them would be a rename
   * for its own sake. PageTabs is given baseHref="" on these three pages
   * so each segment is the whole path.
   */
  projects: [
    { key: "all", segment: "/projects", roles: ROLE_SETS.CONTENT },
    { key: "progress", segment: "/progress", roles: ROLE_SETS.CONTENT },
    { key: "brochures", segment: "/e-brochures", roles: ROLE_SETS.CONTENT },
  ],
  /**
   * One customer, two views of them.
   *
   * An appointment is a lead's next step — LeadActivityComposer already
   * books one from inside a lead — so "Leads" and "Appointments" were two
   * menu rows for two ways of looking at the same pipeline, and a rep
   * switching between them lost whatever they had filtered to.
   *
   * Absolute segments, as with `projects`: /admin/appointments kept its
   * address, so both pages render PageTabs with baseHref="". They also
   * pass carryParams so `project` and `assignedTo` survive the switch.
   */
  leads: [
    { key: "pipeline", segment: "/leads", roles: ROLE_SETS.CRM, capability: "viewAllLeads" },
    {
      key: "appointments",
      segment: "/appointments",
      roles: ROLE_SETS.CRM,
      capability: "viewAllLeads",
    },
  ],
} as const satisfies Record<string, readonly NavTab[]>;

export type NavItem = Gated & {
  key: string;
  /** Appended to `/${locale}/admin`. */
  href: string;
  icon: LucideIcon;
  /** Live badge count — see lib/admin-nav-counts.ts. */
  countKey?: keyof AdminNavCounts;
  /** Present → this page is a tabbed workspace. None yet; Phase 3. */
  tabs?: readonly NavTab[];
  /** Extra prefixes that still count as this item being active. Used when
   *  a path moves and the old one has to keep highlighting. */
  alias?: readonly string[];
  /**
   * Drawn in the mobile drawer, never in the desktop rail.
   *
   * For /admin/m, which is a phone layout for reps in the car between
   * viewings. It sat in the desktop rail offering a worse version of the
   * screens directly above it to somebody sitting at a monitor — a row
   * that is never the right answer where it is shown.
   *
   * Hidden, not removed: the route stays, ⌘K still finds it (it reads
   * visibleNav, which does not filter on this), and a phone gets it at the
   * top of the group. Auto-redirecting by viewport was the other option
   * and is deliberately not done — a rep who opens the full leads table on
   * a phone on purpose should get the full leads table.
   */
  mobileOnly?: boolean;
  /**
   * The prefix this item's tabs hang off, when it is not its own href.
   *
   * "" for a strip whose segments are already whole paths under /admin —
   * NAV_TAB_GROUPS.projects and .leads, whose tabs point at addresses that
   * did not move when the menu rows above them were folded away.
   *
   * It lives here rather than being passed to PageTabs per call site
   * because it was passed per call site, and the other reader of the same
   * config — visibleTabRows, which feeds ⌘K — had no way to know. The
   * palette built "/leads" + "/appointments" and offered
   * /admin/leads/appointments, a 404, for five of its rows.
   */
  tabsBase?: string;
};

/** Also the i18n keys under `admin.navGroups.*`. */
export type NavGroupKey =
  | "overview"
  | "sales"
  | "properties"
  | "content"
  | "growth"
  | "system";

export type NavGroup = {
  key: NavGroupKey;
  /** null = draw no heading. */
  labelKey: NavGroupKey | null;
  items: readonly NavItem[];
};

/* ── The menu ───────────────────────────────────────────────────────── */

export const ADMIN_NAV: readonly NavGroup[] = [
  {
    key: "overview",
    labelKey: null,
    items: [
      { key: "dashboard", href: "", icon: LayoutDashboard, roles: ROLE_SETS.EVERYONE },
    ],
  },

  {
    key: "sales",
    labelKey: "sales",
    items: [
      {
        /* Leads and their appointments, one row. The badge is still the
           unassigned-lead count and not the two backlogs added together:
           today's viewings are a real number but not one anybody acts on
           from the sidebar, and it rides the appointments *tab* instead
           (see leads/page.tsx). */
        key: "leads",
        href: "/leads",
        icon: Users,
        roles: ROLE_SETS.CRM,
        capability: "viewAllLeads",
        countKey: "newLeads",
        alias: ["/appointments"],
        tabs: NAV_TAB_GROUPS.leads,
        tabsBase: "",
      },
      {
        // A rep must be able to see the roster of the team they are on;
        // editing it stays with content people. Fixed in Phase 1 (P5).
        key: "salesTeam",
        href: "/sales-team",
        icon: Contact,
        roles: ROLE_SETS.CONTENT_AND_CRM,
      },
      {
        // Was minRole: SALES, which EDITOR cleared on the ladder and then
        // failed at the page's requireCapability("viewAllLeads") — P2.
        key: "mobileView",
        href: "/m",
        icon: Smartphone,
        roles: ROLE_SETS.CRM,
        capability: "viewAllLeads",
        mobileOnly: true,
      },
    ],
  },

  {
    key: "properties",
    labelKey: "properties",
    items: [
      {
        /* One row for everything about a property. "Progress" and
           "E-brochures" were separate rows for two screens that belong to
           a project — the per-project halves of both are tabs of the
           project workspace now, and the cross-project lists they also
           held are the strip below this item's own list page. The aliases
           keep this row lit at both of those addresses, which have not
           moved. */
        key: "projects",
        href: "/projects",
        icon: Building2,
        roles: ROLE_SETS.CONTENT,
        alias: ["/progress", "/e-brochures"],
        tabs: NAV_TAB_GROUPS.projects,
        tabsBase: "",
      },
    ],
  },

  {
    key: "content",
    labelKey: "content",
    items: [
      {
        /* One hub instead of eight links to the pieces of two pages.
           /admin/pages/home already knew about the home page's
           sections (lib/home-sections.ts); the links that edit them used
           to live in the sidebar, so ordering a section and writing it
           were two different places. `alias` keeps the old paths
           highlighting this row while the redirects in next.config.js send
           anybody's bookmarks here. */
        key: "pages",
        href: "/pages",
        icon: Files,
        roles: ROLE_SETS.CONTENT,
        alias: [
          "/home-builder",
          "/hero-banner",
          "/home-gallery",
          "/cta",
          "/corporate",
          "/why-us",
          "/mission",
          "/awards",
          "/milestones",
          "/faqs",
          /* Phase 4: two settings groups that were editing this hub's
             pages all along — the About story and the contact details. */
          "/settings/company",
          "/settings/contact",
        ],
        tabs: NAV_TAB_GROUPS.pages,
      },
      { key: "news", href: "/news", icon: Newspaper, roles: ROLE_SETS.CONTENT },
      /* No tabs here yet. The blueprint gives events an "All | Registrations"
         strip, but registrations are per-event — the route is
         events/[id]/registrations — so a sibling /events/registrations tab
         would point at nothing. It belongs with the event workspace, not
         with the list. */
      { key: "events", href: "/events", icon: CalendarDays, roles: ROLE_SETS.CONTENT },
      { key: "media", href: "/media", icon: LibraryBig, roles: ROLE_SETS.CONTENT },
      {
        key: "publishing",
        href: "/publishing",
        icon: FileCheck2,
        roles: ROLE_SETS.CONTENT,
        /* Still the review queue alone. Rolling the translation gaps into
           this number would make one badge mean two unrelated backlogs,
           and the one that needs a person today is the review queue. */
        countKey: "reviewQueue",
        alias: ["/seo/translations"],
        tabs: NAV_TAB_GROUPS.publishing,
      },
    ],
  },

  {
    /* Growth is not administration. SEO and the analytics reports used to
       sit in one list with user accounts and the audit log, which put
       "how is the site doing" beside "who deleted that" — two jobs, two
       people, one heading. */
    key: "growth",
    labelKey: "growth",
    items: [
      {
        key: "seo",
        href: "/seo",
        icon: Search,
        roles: ROLE_SETS.ADMIN_UP,
        alias: ["/settings/seo"],
        tabs: NAV_TAB_GROUPS.seo,
      },
      {
        // requireAdmin(locale, Role.ADMIN) — the (growth) zone's ordinary
        // floor, no exception needed here (see that layout's header).
        key: "analytics",
        href: "/analytics",
        icon: BarChart3,
        roles: ROLE_SETS.ADMIN_UP,
      },
    ],
  },

  {
    /* What the word actually covers: how the system behaves, not what the
       website says. Three groups left this one for a hub of their own
       (see the file header) and two more moved to `growth`. */
    key: "system",
    labelKey: "system",
    items: [
      { key: "settings", href: "/settings", icon: Settings, roles: ROLE_SETS.ADMIN_UP },
      {
        key: "users",
        href: "/users",
        icon: ShieldCheck,
        roles: ROLE_SETS.OWNER_ONLY,
        capability: "manageUsers",
      },
      {
        key: "activity",
        href: "/activity",
        icon: History,
        roles: ROLE_SETS.OWNER_ONLY,
        capability: "viewAuditLog",
      },
    ],
  },
] as const;

/* ── Helpers ────────────────────────────────────────────────────────── */

/** May this role see this node? roles AND capability. */
export function canSee(role: Role | null | undefined, node: Gated): boolean {
  if (!role) return false;
  if (!node.roles.includes(role)) return false;
  if (node.capability && !can(role, node.capability)) return false;
  return true;
}

/**
 * May this role see one named sidebar item?
 *
 * For the case where a page wants to offer a shortcut into another part of
 * the back office — the dashboard's "see the full reports" link into
 * /admin/analytics — and must not draw it for a role the destination
 * refuses. Asking canSee() about the real item is what keeps that answer
 * from drifting: the alternative is a second hand-written role list beside
 * the link, which is exactly the shape of the "Mobile view" defect this
 * file's header describes.
 */
export function canSeeItem(role: Role | null | undefined, key: string): boolean {
  const item = ADMIN_NAV.flatMap((group) => group.items).find((i) => i.key === key);
  return item ? canSee(role, item) : false;
}

/**
 * Groups and items left after filtering. An emptied group takes its
 * heading with it.
 *
 * `surface` is where the result will be drawn. The rail drops `mobileOnly`
 * rows; the drawer keeps them and floats them to the top of their group,
 * because on a phone the phone layout is the first thing a rep wants and
 * the last thing they should have to scroll for. Everything else — ⌘K, any
 * future consumer — asks for "all" and gets the whole menu, which is why
 * the parameter defaults to that rather than to either surface.
 */
export function visibleNav(
  role: Role | null | undefined,
  surface: "all" | "rail" | "drawer" = "all",
): NavGroup[] {
  return ADMIN_NAV.map((group) => {
    let items = group.items.filter((item) => canSee(role, item));

    if (surface === "rail") items = items.filter((item) => !item.mobileOnly);
    if (surface === "drawer") {
      items = [...items].sort((a, b) => Number(!!b.mobileOnly) - Number(!!a.mobileOnly));
    }

    return { ...group, items };
  }).filter((group) => group.items.length > 0);
}

/**
 * The tabs this role sees on one page.
 *
 * `key` is either a sidebar item ("pages") or one of the standalone strips
 * in NAV_TAB_GROUPS ("pagesAbout"). Both are looked up here so PageTabs
 * takes one prop and does not need to know which kind it was handed.
 */
export function visibleTabs(role: Role | null | undefined, key: string): NavTab[] {
  const item = ADMIN_NAV.flatMap((group) => group.items).find((i) => i.key === key);
  const tabs = item?.tabs ?? NAV_TAB_GROUPS[key as keyof typeof NAV_TAB_GROUPS];
  return tabs?.filter((tab) => canSee(role, tab)) ?? [];
}

/**
 * What a named strip's segments hang off, under `/{locale}/admin`.
 *
 * null for a strip that is not a sidebar item's own (pagesAbout) — that
 * one lives inside a page that knows its own path, so the caller supplies
 * it. Everything else is answered from the config, so
 * PageTabs and visibleTabRows cannot disagree about where a tab points.
 */
export function tabBase(key: string): string | null {
  const item = ADMIN_NAV.flatMap((group) => group.items).find((i) => i.key === key);
  if (!item) return null;
  return item.tabsBase ?? item.href;
}

export type NavTabRow = {
  /** The sidebar item the tab belongs to — labels the row's parent. */
  itemKey: string;
  tabKey: string;
  /** Appended to `/${locale}/admin`, like NavItem.href. */
  href: string;
};

/**
 * Every in-page tab this role can open, flattened.
 *
 * ⌘K reads the sidebar's items, which stopped being the whole menu the
 * moment rows started becoming tabs: "Translations" was a row anyone could
 * search for and is now a tab inside Review & publish, and the palette
 * would simply have stopped finding it — a search box that quietly covers
 * less of the product than it used to is worse than one that never covered
 * it, because people stop trusting the answer "no results".
 *
 * The index tab (segment "") is skipped: its href is the item's own, which
 * the palette already lists, and two rows pointing at one page is the kind
 * of duplicate the tabs exist to remove.
 *
 * Only tabs an item owns. The second-level strip in NAV_TAB_GROUPS
 * (pagesAbout) is deliberately absent — it carries no base path of its
 * own, so there is nothing here to build an href from without hardcoding
 * one beside the config it would have to agree with.
 */
export function visibleTabRows(role: Role | null | undefined): NavTabRow[] {
  const rows: NavTabRow[] = [];

  for (const group of ADMIN_NAV) {
    for (const item of group.items) {
      if (!item.tabs || !canSee(role, item)) continue;

      for (const tab of item.tabs) {
        if (tab.segment === "" || !canSee(role, tab)) continue;
        rows.push({
          itemKey: item.key,
          tabKey: tab.key,
          href: `${tabBase(item.key) ?? item.href}${tab.segment}`,
        });
      }
    }
  }

  return rows;
}

/**
 * Which item to highlight for the current pathname.
 *
 * Longest match wins, which is the whole point. A plain startsWith made
 * "/admin/media" light up "Mobile view", because "/admin/m" is a prefix of
 * it — the sidebar carried a hand-written special case for exactly that.
 * Comparing every candidate and keeping the longest handles it as a rule
 * instead of an exception, and keeps handling it when the next short href
 * is added.
 */
export function activeItemKey(pathname: string, base: string): string | null {
  let best: { key: string; length: number } | null = null;

  for (const item of ADMIN_NAV.flatMap((group) => group.items)) {
    for (const href of [item.href, ...(item.alias ?? [])]) {
      const full = `${base}${href}`;

      // The dashboard is `base` itself, so it only ever matches exactly —
      // as a prefix it would match every page in the back office.
      const hit =
        href === "" ? pathname === full : pathname === full || pathname.startsWith(`${full}/`);

      if (hit && (!best || full.length > best.length)) best = { key: item.key, length: full.length };
    }
  }

  return best?.key ?? null;
}
