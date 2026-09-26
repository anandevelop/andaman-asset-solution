/**
 * tests/admin/nav.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The nav config's own invariants — the blueprint's §7.1, plus the active
 * -item rule the sidebar used to carry as a hand-written special case.
 *
 * Distinct from tests/admin/permissions-nav.test.ts next door, which reads
 * source files and compares this config against the guards on the pages it
 * points at. This one only checks the config against itself, and can
 * import it directly: lib/admin/nav.ts is deliberately free of anything
 * `server-only`, because a client component pulls it in.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Role } from "@prisma/client";
import {
  ADMIN_NAV,
  activeItemKey,
  canSee,
  canSeeItem,
  visibleNav,
  visibleTabRows,
  visibleTabs,
} from "@/lib/admin/nav";

const ALL_ROLES = Object.values(Role);
const items = ADMIN_NAV.flatMap((group) => group.items);

describe("admin nav config", () => {
  it("has no duplicate keys", () => {
    // Keys are the i18n lookup and the active-item identity; two items
    // sharing one would highlight both and label them the same.
    const keys = items.map((item) => item.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("shows every item to at least one role", () => {
    for (const item of items) {
      expect(
        ALL_ROLES.some((role) => canSee(role, item)),
        `${item.key} is visible to nobody`,
      ).toBe(true);
    }
  });

  it("never lists a role its capability then refuses", () => {
    /* The one that would have caught the Mobile view bug. A role written
       into `roles` is a promise that the menu is theirs; if the capability
       AND-ed on top removes them again, the config is arguing with itself
       and the page will do the refusing instead. */
    for (const item of items) {
      if (!item.capability) continue;

      const refused = item.roles.filter((role) => !canSee(role, item));
      expect(
        refused,
        `${item.key} lists ${refused.join(", ")} but its capability refuses them`,
      ).toEqual([]);
    }
  });

  it("applies the same rule to tabs", () => {
    // Same invariant as the items above, for the strips inside a hub.
    for (const item of items) {
      for (const tab of item.tabs ?? []) {
        expect(
          ALL_ROLES.some((role) => canSee(role, tab)),
          `${item.key}/${tab.key} is visible to nobody`,
        ).toBe(true);

        if (!tab.capability) continue;
        expect(
          tab.roles.filter((role) => !canSee(role, tab)),
          `${item.key}/${tab.key}`,
        ).toEqual([]);
      }
    }
  });
});

describe("activeItemKey", () => {
  const base = "/th/admin";

  it("does not let /m swallow /media", () => {
    /* The reason the rule is "longest match wins" rather than the first
       startsWith that hits: "/th/admin/m" is a prefix of "/th/admin/media",
       so the mobile item matched the media library and the sidebar
       highlighted the wrong row. The old code worked around it with a
       comment and an extra boundary check; this is the rule doing it. */
    expect(activeItemKey("/th/admin/media", base)).toBe("media");
    expect(activeItemKey("/th/admin/m", base)).toBe("mobileView");
  });

  it("matches a child route to its item", () => {
    expect(activeItemKey("/th/admin/projects/abc123/units", base)).toBe(
      "projects",
    );
    expect(activeItemKey("/th/admin/settings/notifications", base)).toBe(
      "settings",
    );
  });

  it("gives the dashboard only its own path", () => {
    // "" as a prefix would match every page in the back office.
    expect(activeItemKey("/th/admin", base)).toBe("dashboard");
    expect(activeItemKey("/th/admin/news", base)).toBe("news");
  });

  it("returns null for a path no item owns", () => {
    expect(activeItemKey("/th/admin/account", base)).toBeNull();
  });

  it("keeps the old section paths highlighting the Pages hub", () => {
    /* The eight section editors moved under /pages in Phase 3 and
       next.config.js redirects the old paths. `alias` is what keeps the
       rail lit during the hop, and — more usefully — keeps a stale link
       from anywhere else pointing at something that looks right. */
    for (const old of [
      "/th/admin/home-builder",
      "/th/admin/hero-banner",
      "/th/admin/home-gallery",
      "/th/admin/cta",
      "/th/admin/corporate",
      "/th/admin/why-us",
      "/th/admin/mission",
      "/th/admin/awards",
      "/th/admin/milestones",
      "/th/admin/faqs",
    ]) {
      expect(activeItemKey(old, base), old).toBe("pages");
    }
  });

  it("highlights the hub from anywhere inside it", () => {
    expect(activeItemKey("/th/admin/pages", base)).toBe("pages");
    expect(activeItemKey("/th/admin/pages/home/sections", base)).toBe("pages");
    expect(activeItemKey("/th/admin/pages/about/milestones", base)).toBe(
      "pages",
    );
  });

  it("works for every locale prefix", () => {
    expect(activeItemKey("/en/admin/media", "/en/admin")).toBe("media");
    expect(activeItemKey("/ru/admin/m", "/ru/admin")).toBe("mobileView");
  });
});

describe("visibleNav", () => {
  it("drops a group once nothing in it is visible", () => {
    // An empty heading is worse than no heading.
    for (const group of visibleNav(Role.VIEWER)) {
      expect(group.items.length).toBeGreaterThan(0);
    }
  });

  it("shows nothing at all to a signed-out reader", () => {
    expect(visibleNav(null)).toEqual([]);
    expect(visibleTabs(null, "settings")).toEqual([]);
  });

  it("keeps the groups and items in their declared order", () => {
    /* The rail is read top to bottom and people navigate it by muscle
       memory; filtering must remove rows, never reorder them. */
    const seen = visibleNav(Role.SUPER_ADMIN);

    expect(seen.map((group) => group.key)).toEqual(
      ADMIN_NAV.map((group) => group.key),
    );
    expect(
      seen.flatMap((group) => group.items.map((item) => item.key)),
    ).toEqual(items.map((item) => item.key));
  });
});

describe("the Pages hub", () => {
  it("offers a tab for every section route that exists", () => {
    /* Each tab's segment has to resolve to a real folder under
       app/[locale]/admin/pages. A tab pointing at a 404 is the same defect
       as a menu row pointing at a denied page — which is what kept
       `contact` out of this strip until its screen was built. */
    const hub = ADMIN_NAV.flatMap((group) => group.items).find(
      (item) => item.key === "pages",
    );

    expect(hub?.tabs?.map((tab) => tab.segment)).toEqual([
      "/home",
      "/about",
      "/contact",
      "/faq",
    ]);
    /* Home has no strip: it drew an order list and three editors as peers,
       which is what kept the order list from being a picture of the page.
       /admin/pages/home is that picture now — see lib/home-outline.ts. */
    expect(visibleTabs(Role.EDITOR, "pagesHome")).toEqual([]);
    expect(
      visibleTabs(Role.EDITOR, "pagesAbout").map((tab) => tab.segment),
    ).toEqual([
      "/story",
      "/corporate",
      "/why-us",
      "/mission",
      "/awards",
      "/milestones",
    ]);
  });

  it("aliases every path next.config.js redirects into it", () => {
    // Two lists that have to agree: one lights the menu, the other moves
    // the browser. A path in only one of them is a half-finished move.
    const hub = ADMIN_NAV.flatMap((group) => group.items).find(
      (item) => item.key === "pages",
    );

    expect([...(hub?.alias ?? [])].sort()).toEqual(
      [
        "/awards",
        "/corporate",
        "/cta",
        "/faqs",
        "/hero-banner",
        "/home-builder",
        "/home-gallery",
        "/milestones",
        "/mission",
        "/settings/company",
        "/settings/contact",
        "/why-us",
      ].sort(),
    );
  });
});

describe("the publishing hub", () => {
  it("offers the review queue and the translation report as tabs", () => {
    expect(
      visibleTabs(Role.EDITOR, "publishing").map((tab) => tab.segment),
    ).toEqual(["", "/translations"]);
  });

  it("hides the translations tab from VIEWER, who the page would refuse", () => {
    /* The queue is a read and VIEWER may have it; the translation report
       calls requireAdmin(locale, Role.EDITOR) with no read floor under it.
       Offering the tab anyway is the "Mobile view" defect in miniature. */
    expect(
      visibleTabs(Role.VIEWER, "publishing").map((tab) => tab.key),
    ).toEqual(["queue"]);
    expect(canSeeItem(Role.VIEWER, "publishing")).toBe(true);
  });

  it("no longer has a sidebar row of its own for translations", () => {
    const keys = ADMIN_NAV.flatMap((group) => group.items).map(
      (item) => item.key,
    );

    expect(keys).not.toContain("seoTranslations");
  });

  it("keeps the old SEO path highlighting this row", () => {
    expect(activeItemKey("/th/admin/seo/translations", "/th/admin")).toBe(
      "publishing",
    );

    // And has not swallowed the SEO hub it used to live under.
    expect(activeItemKey("/th/admin/seo", "/th/admin")).toBe("seo");
    expect(activeItemKey("/th/admin/seo/keywords", "/th/admin")).toBe("seo");
  });
});

describe("the sidebar each role gets", () => {
  /**
   * The whole point of the restructure, written down.
   *
   * Nineteen rows became fourteen by turning rows that were really views
   * of something else into tabs of that something — a change that is easy
   * to undo one row at a time, each time for a locally reasonable reason,
   * which is how it got to nineteen. An exact list rather than a count:
   * a count passes when a row is added and another removed in the same
   * change, which is exactly when somebody should be made to look.
   *
   * The desktop rail, so `mobileOnly` is excluded — see that field's note.
   */
  const EXPECTED: Record<Role, string[]> = {
    SUPER_ADMIN: [
      "dashboard",
      "leads",
      "salesTeam",
      "projects",
      "pages",
      "news",
      "events",
      "media",
      "publishing",
      "seo",
      "analytics",
      "reports",
      "settings",
      "users",
      "activity",
    ],
    // No users or activity: both are OWNER_ONLY.
    ADMIN: [
      "dashboard",
      "leads",
      "salesTeam",
      "projects",
      "pages",
      "news",
      "events",
      "media",
      "publishing",
      "seo",
      "analytics",
      "reports",
      "settings",
    ],
    // Content only. No CRM (viewAllLeads is false for EDITOR — the PDPA
    // fix), no SEO, no analytics, no settings.
    EDITOR: [
      "dashboard",
      "salesTeam",
      "projects",
      "pages",
      "news",
      "events",
      "media",
      "publishing",
    ],
    // CRM plus the roster they are on. salesTeam is in CONTENT_AND_CRM.
    SALES: ["dashboard", "leads", "salesTeam"],
    // Read-only: everything the (catalog) and (content) zones admit them
    // to, and nothing else. Not salesTeam — CONTENT_AND_CRM leaves VIEWER
    // out because that page's own guard is a Role.SALES rank they do not
    // meet; see the note on that set in lib/admin/nav.ts.
    VIEWER: [
      "dashboard",
      "projects",
      "pages",
      "news",
      "events",
      "media",
      "publishing",
    ],
  };

  for (const [role, expected] of Object.entries(EXPECTED) as [
    Role,
    string[],
  ][]) {
    it(`${role} sees ${expected.length} rows`, () => {
      const seen = visibleNav(role, "rail").flatMap((group) =>
        group.items.map((i) => i.key),
      );

      expect(seen).toEqual(expected);
    });
  }

  it("is fifteen rows for the owner", () => {
    // The number the restructure was aiming at, stated once so a diff that
    // changes it has to change this line too. Fourteen until the monthly
    // report joined `growth` — which is the kind of change this assertion
    // exists to make somebody look at.
    expect(EXPECTED.SUPER_ADMIN).toHaveLength(15);
  });

  it("groups them by job, not by department", () => {
    const groups = visibleNav(Role.SUPER_ADMIN, "rail").map(
      (group) => group.key,
    );

    expect(groups).toEqual([
      "overview",
      "sales",
      "properties",
      "content",
      "growth",
      "system",
    ]);
  });

  it("labels every group it draws", () => {
    // A heading key that does not resolve renders the raw key at the top
    // of a menu section. next-intl throws for a missing one, so this is
    // the cheaper failure.
    const messages = JSON.parse(
      readFileSync(join(process.cwd(), "messages", "en.json"), "utf8"),
    );

    for (const group of visibleNav(Role.SUPER_ADMIN, "rail")) {
      if (!group.labelKey) continue;
      expect(
        messages.admin.navGroups[group.labelKey],
        group.labelKey,
      ).toBeTruthy();
    }
  });
});

describe("leads and appointments", () => {
  it("are one sidebar row with two tabs", () => {
    const keys = ADMIN_NAV.flatMap((group) => group.items).map(
      (item) => item.key,
    );

    expect(keys).not.toContain("appointments");
    expect(visibleTabs(Role.SALES, "leads").map((tab) => tab.segment)).toEqual([
      "/leads",
      "/appointments",
    ]);
  });

  it("highlight the same row from either", () => {
    expect(activeItemKey("/th/admin/leads", "/th/admin")).toBe("leads");
    expect(activeItemKey("/th/admin/appointments", "/th/admin")).toBe("leads");
    expect(activeItemKey("/th/admin/leads/abc123", "/th/admin")).toBe("leads");
  });

  it("are hidden from a role the pages would refuse", () => {
    // Both screens guard on viewAllLeads, which EDITOR does not hold —
    // see lib/permissions.ts and the "Mobile view" note in nav.ts.
    expect(canSeeItem(Role.EDITOR, "leads")).toBe(false);
    expect(visibleTabs(Role.EDITOR, "leads")).toEqual([]);
  });
});

describe("mobileOnly", () => {
  it("keeps the phone layout out of the desktop rail", () => {
    /* /admin/m is a phone layout for reps between viewings. In the rail it
       offered a worse version of the two rows directly above it to
       somebody at a monitor. */
    const rail = visibleNav(Role.SALES, "rail").flatMap((g) =>
      g.items.map((i) => i.key),
    );

    expect(rail).not.toContain("mobileView");
    expect(rail).toContain("leads");
    expect(rail).toContain("salesTeam");
  });

  it("puts it first in its group in the drawer", () => {
    const sales = visibleNav(Role.SALES, "drawer").find(
      (g) => g.key === "sales",
    );

    expect(sales?.items[0]?.key).toBe("mobileView");
  });

  it("leaves it in the unfiltered menu, which is what ⌘K reads", () => {
    // Hidden from one surface, not removed from the product: the route
    // stays and the palette still finds it.
    const all = visibleNav(Role.SALES).flatMap((g) =>
      g.items.map((i) => i.key),
    );

    expect(all).toContain("mobileView");
  });

  it("reorders without dropping or duplicating anything", () => {
    const rail = visibleNav(Role.SUPER_ADMIN, "rail").flatMap((g) =>
      g.items.map((i) => i.key),
    );
    const drawer = visibleNav(Role.SUPER_ADMIN, "drawer").flatMap((g) =>
      g.items.map((i) => i.key),
    );

    expect([...drawer].sort()).toEqual([...rail, "mobileView"].sort());
    expect(new Set(drawer).size).toBe(drawer.length);
  });
});

describe("the project workspace", () => {
  it("is one sidebar row, not three", () => {
    /* "Progress" and "E-brochures" were rows of their own for screens that
       belong to a project. Their per-project halves are tabs of the
       workspace; the cross-project lists are tabs of this row's list. */
    const keys = ADMIN_NAV.flatMap((group) => group.items).map(
      (item) => item.key,
    );

    expect(keys).not.toContain("progress");
    expect(keys).not.toContain("eBrochures");
    expect(keys).toContain("projects");
  });

  it("keeps both old addresses highlighting it", () => {
    for (const path of [
      "/th/admin/progress",
      "/th/admin/e-brochures",
      "/th/admin/e-brochures/abc123/edit",
      "/th/admin/projects/abc123/progress",
      "/th/admin/projects/abc123/brochures",
      "/th/admin/projects/abc123/site-plan",
    ]) {
      expect(activeItemKey(path, "/th/admin"), path).toBe("projects");
    }
  });

  it("offers the three cross-project lists as absolute segments", () => {
    /* The only strip whose segments are not under its parent's href —
       /admin/progress and /admin/e-brochures kept their addresses, so the
       three pages render PageTabs with baseHref="". A segment that lost
       its leading path here would resolve to /admin<segment> and 404. */
    expect(
      visibleTabs(Role.EDITOR, "projects").map((tab) => tab.segment),
    ).toEqual(["/projects", "/progress", "/e-brochures"]);
  });
});

describe("the SEO hub", () => {
  it("offers all six screens as tabs", () => {
    /* Three of these had no reliable way in: keywords and links were only
       reachable from two buttons in the overview's header, and /seo/urls
       from nowhere at all once settings stopped linking to it.

       /audit joined them with the on-page audit, second because it is
       where the overview's numbers link into — "70 pages missing a
       description" is only useful beside the list of which seventy. */
    expect(visibleTabs(Role.ADMIN, "seo").map((tab) => tab.segment)).toEqual([
      "",
      "/audit",
      "/keywords",
      "/links",
      "/urls",
      "/defaults",
    ]);
  });

  it("keeps the settings path highlighting this row", () => {
    expect(activeItemKey("/th/admin/settings/seo", "/th/admin")).toBe("seo");

    // Without the alias being longest-match, "/settings" would win it.
    expect(activeItemKey("/th/admin/settings/privacy", "/th/admin")).toBe(
      "settings",
    );
  });

  it("is invisible below ADMIN, tabs included", () => {
    expect(canSeeItem(Role.EDITOR, "seo")).toBe(false);
    expect(visibleTabs(Role.EDITOR, "seo")).toEqual([]);
  });
});

describe("visibleTabRows", () => {
  it("gives ⌘K a destination for every tab but the index", () => {
    /* The palette reads sidebar rows, and rows keep becoming tabs. Each
       move would otherwise take a destination out of the search box
       without anybody noticing — "no results" reads the same whether the
       thing is gone or was never there. */
    const hrefs = visibleTabRows(Role.EDITOR).map((row) => row.href);

    expect(hrefs).toContain("/publishing/translations");
    expect(hrefs).toContain("/pages/home");

    // The index tab is the item's own href, which the palette already has.
    expect(hrefs).not.toContain("/publishing");
  });

  it("drops a tab the role would be refused at", () => {
    const viewer = visibleTabRows(Role.VIEWER).map((row) => row.href);

    expect(viewer).not.toContain("/publishing/translations");
    expect(viewer).toContain("/pages/home");
  });

  it("points every row at a route that exists", () => {
    /*
      The one that caught the bug this check was written for. `segment` is
      relative to its parent's href for most strips and already absolute
      for two of them (projects, leads — their tabs point at paths that did
      not move when the rows above them were folded away). PageTabs was
      told which by a `baseHref` prop at each call site; visibleTabRows,
      the other reader of the same config, was not, so it concatenated
      anyway and offered ⌘K five destinations like
      /admin/leads/appointments. Every one a 404, and nothing rendered them
      — the palette is the only place those rows appear.

      NavItem.tabsBase is where that answer lives now, and this asserts the
      result rather than the mechanism: a real page.tsx behind every href.
    */
    const adminDir = join(process.cwd(), "app", "[locale]", "admin");
    const zones = readdirSync(adminDir).filter(
      (entry) =>
        /^\(.+\)$/.test(entry) && statSync(join(adminDir, entry)).isDirectory(),
    );

    const missing = visibleTabRows(Role.SUPER_ADMIN).filter((row) => {
      const relative = row.href.replace(/^\//, "");
      const zone = zones.find((z) =>
        existsSync(join(adminDir, z, relative.split("/")[0])),
      );
      const dir = zone
        ? join(adminDir, zone, relative)
        : join(adminDir, relative);
      return !existsSync(join(dir, "page.tsx"));
    });

    expect(missing.map((row) => row.href)).toEqual([]);
  });

  it("gives every row a label key in both namespaces", () => {
    // The palette renders "admin.nav.<itemKey> · admin.tabs.<itemKey>.
    // <tabKey>". A row whose two halves do not both resolve renders a raw
    // key in the one place people look when they are lost.
    const messages = JSON.parse(
      readFileSync(join(process.cwd(), "messages", "en.json"), "utf8"),
    );

    for (const row of visibleTabRows(Role.SUPER_ADMIN)) {
      expect(
        messages.admin.nav[row.itemKey],
        `nav.${row.itemKey}`,
      ).toBeTruthy();
      expect(
        messages.admin.tabs[row.itemKey]?.[row.tabKey],
        `tabs.${row.itemKey}.${row.tabKey}`,
      ).toBeTruthy();
    }
  });
});

describe("every admin redirect", () => {
  /*
    The rule the whole restructure runs on: a path that moves keeps
    working, and keeps lighting the row it moved into. next.config.js
    moves the browser; `alias` lights the rail. A redirect added without
    its alias leaves somebody mid-hop looking at a sidebar that has gone
    blank, and — more usefully — leaves every stale link elsewhere in the
    back office pointing at something that looks wrong on arrival.

    Read as source text rather than imported: next.config.js pulls in
    next-intl's and Sentry's plugins at module scope, which is a lot of
    machinery to boot for a list of strings, and the file is CommonJS.
    Same reasoning as tests/admin/permissions-nav.test.ts.
  */
  const config = readFileSync(join(process.cwd(), "next.config.js"), "utf8");

  const adminRedirectSources = [
    ...config.matchAll(/source:\s*"\/:locale\/admin([^"]*)"/g),
  ]
    .map((match) => match[1])
    // Dynamic segments cannot appear in an alias, which is a plain
    // prefix — "/progress/:projectId" is aliased as "/progress".
    .map((path) => path.split("/:")[0]);

  it("was found in next.config.js at all", () => {
    // If the regex above goes blind — the file is reformatted, the
    // redirects move — the check below would pass on an empty list.
    expect(adminRedirectSources.length).toBeGreaterThan(9);
  });

  it("still lights a sidebar row", () => {
    const dark = adminRedirectSources.filter(
      (path) => activeItemKey(`/th/admin${path}`, "/th/admin") === null,
    );

    expect(dark, "redirected from, but no nav item claims it").toEqual([]);
  });
});
