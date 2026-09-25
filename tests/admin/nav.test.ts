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
      expect(refused, `${item.key} lists ${refused.join(", ")} but its capability refuses them`)
        .toEqual([]);
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
    expect(activeItemKey("/th/admin/projects/abc123/units", base)).toBe("projects");
    expect(activeItemKey("/th/admin/settings/company", base)).toBe("settings");
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
    expect(activeItemKey("/th/admin/pages/about/milestones", base)).toBe("pages");
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

    expect(seen.map((group) => group.key)).toEqual(ADMIN_NAV.map((group) => group.key));
    expect(seen.flatMap((group) => group.items.map((item) => item.key))).toEqual(
      items.map((item) => item.key),
    );
  });
});

describe("the Pages hub", () => {
  it("offers a tab for every section route that exists", () => {
    /* Each tab's segment has to resolve to a real folder under
       app/[locale]/admin/pages. A tab pointing at a 404 is the same defect
       as a menu row pointing at a denied page — which is why `contact` is
       not in this strip yet: its screen is Phase 4's. */
    const hub = ADMIN_NAV.flatMap((group) => group.items).find((item) => item.key === "pages");

    expect(hub?.tabs?.map((tab) => tab.segment)).toEqual(["/home", "/about", "/faq"]);
    expect(visibleTabs(Role.EDITOR, "pagesHome").map((tab) => tab.segment)).toEqual([
      "/sections",
      "/hero",
      "/gallery",
      "/cta",
    ]);
    expect(visibleTabs(Role.EDITOR, "pagesAbout").map((tab) => tab.segment)).toEqual([
      "/corporate",
      "/why-us",
      "/mission",
      "/awards",
      "/milestones",
    ]);
  });

  it("aliases exactly the paths next.config.js redirects", () => {
    // Two lists that have to agree: one lights the menu, the other moves
    // the browser. A path in only one of them is a half-finished move.
    const hub = ADMIN_NAV.flatMap((group) => group.items).find((item) => item.key === "pages");

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
        "/why-us",
      ].sort(),
    );
  });
});

describe("the publishing hub", () => {
  it("offers the review queue and the translation report as tabs", () => {
    expect(visibleTabs(Role.EDITOR, "publishing").map((tab) => tab.segment)).toEqual([
      "",
      "/translations",
    ]);
  });

  it("hides the translations tab from VIEWER, who the page would refuse", () => {
    /* The queue is a read and VIEWER may have it; the translation report
       calls requireAdmin(locale, Role.EDITOR) with no read floor under it.
       Offering the tab anyway is the "Mobile view" defect in miniature. */
    expect(visibleTabs(Role.VIEWER, "publishing").map((tab) => tab.key)).toEqual(["queue"]);
    expect(canSeeItem(Role.VIEWER, "publishing")).toBe(true);
  });

  it("no longer has a sidebar row of its own for translations", () => {
    const keys = ADMIN_NAV.flatMap((group) => group.items).map((item) => item.key);

    expect(keys).not.toContain("seoTranslations");
  });

  it("keeps the old SEO path highlighting this row", () => {
    expect(activeItemKey("/th/admin/seo/translations", "/th/admin")).toBe("publishing");

    // And has not swallowed the SEO hub it used to live under.
    expect(activeItemKey("/th/admin/seo", "/th/admin")).toBe("seo");
    expect(activeItemKey("/th/admin/seo/keywords", "/th/admin")).toBe("seo");
  });
});

describe("the SEO hub", () => {
  it("offers all five screens as tabs", () => {
    /* Three of these had no reliable way in: keywords and links were only
       reachable from two buttons in the overview's header, and /seo/urls
       from nowhere at all once settings stopped linking to it. */
    expect(visibleTabs(Role.ADMIN, "seo").map((tab) => tab.segment)).toEqual([
      "",
      "/keywords",
      "/links",
      "/urls",
      "/defaults",
    ]);
  });

  it("keeps the settings path highlighting this row", () => {
    expect(activeItemKey("/th/admin/settings/seo", "/th/admin")).toBe("seo");

    // Without the alias being longest-match, "/settings" would win it.
    expect(activeItemKey("/th/admin/settings/privacy", "/th/admin")).toBe("settings");
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

  it("gives every row a label key in both namespaces", () => {
    // The palette renders "admin.nav.<itemKey> · admin.tabs.<itemKey>.
    // <tabKey>". A row whose two halves do not both resolve renders a raw
    // key in the one place people look when they are lost.
    const messages = JSON.parse(readFileSync(join(process.cwd(), "messages", "en.json"), "utf8"));

    for (const row of visibleTabRows(Role.SUPER_ADMIN)) {
      expect(messages.admin.nav[row.itemKey], `nav.${row.itemKey}`).toBeTruthy();
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

  const adminRedirectSources = [...config.matchAll(/source:\s*"\/:locale\/admin([^"]*)"/g)]
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
