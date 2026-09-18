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

import { describe, expect, it } from "vitest";
import { Role } from "@prisma/client";
import { ADMIN_NAV, activeItemKey, canSee, visibleNav, visibleTabs } from "@/lib/admin/nav";

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
