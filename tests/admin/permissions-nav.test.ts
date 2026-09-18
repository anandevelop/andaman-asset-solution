/**
 * tests/admin/permissions-nav.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The sidebar and the guards have to agree, and the permissions table has
 * to describe something the application actually checks.
 *
 * Both halves exist because of failures that shipped. A "Mobile view" link
 * was shown to every content editor and refused them on arrival, because
 * the sidebar asked "does this role outrank SALES?" while the page asked
 * "may this role read leads?" — two different questions with two different
 * answers for EDITOR. And `viewContent` was drawn on the Users &
 * Permissions screen as a right that VIEWER held, while no guard anywhere
 * consulted it.
 *
 * The menu is imported — lib/admin/nav.ts is plain data with no
 * `server-only` in its import graph, which is the point of it living there
 * rather than inside the component. The guards are read from source
 * instead: the pages are async Server Components that talk to a database,
 * so greping them is the cheap check — the same reasoning as
 * tests/breadcrumbs.test.ts and tests/offline-notice.test.ts.
 *
 * Until Phase 2 the menu was parsed out of AdminSidebar.tsx with a regex.
 * That is what this test was for, and it stopped being necessary the
 * moment the config moved to a file a test can just import.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Role } from "@prisma/client";
import { CAPABILITIES, can, ROLE_ORDER, type Capability } from "@/lib/permissions";
import { hasRole } from "@/lib/role-rank";
import { ADMIN_NAV, canSee } from "@/lib/admin/nav";

const ROOT = process.cwd();
const ADMIN_DIR = join(ROOT, "app", "[locale]", "admin");

/* ROLE_ORDER and hasRole rather than the rank table itself, which
   lib/role-rank.ts keeps private on purpose — a test is not a reason to
   widen a module's API. */
const ALL_ROLES: Role[] = ROLE_ORDER;

/** Guard source still needs its comments stripped before matching. */
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const items = ADMIN_NAV.flatMap((group) => group.items);

/** Which roles the sidebar shows an item to — canSee, unmodified, because
 *  it is the same function the component calls. */
const rolesSeeingItem = (item: (typeof items)[number]) =>
  ALL_ROLES.filter((role) => canSee(role, item));

// ── The guard on the page each item points at ────────────────────────────

/** Route-group folders under admin/ — "(crm)", "(catalog)", and so on.
 *  Read from disk rather than hardcoded, so a renamed or added zone cannot
 *  drift out of sync with this list the way a hand-copied one would. */
const ZONE_DIRS = readdirSync(ADMIN_DIR).filter(
  (entry) => /^\(.+\)$/.test(entry) && statSync(join(ADMIN_DIR, entry)).isDirectory(),
);

/** The zone folder a top-level route segment lives under, or null for one
 *  that stays directly under admin/ — the dashboard, account. An empty
 *  segment (the dashboard's own href) never matches: every zone folder
 *  technically "exists" under that join, which would otherwise resolve it
 *  to whichever zone happens to be first in ZONE_DIRS. */
function zoneOf(firstSegment: string): string | null {
  if (!firstSegment) return null;
  return ZONE_DIRS.find((zone) => existsSync(join(ADMIN_DIR, zone, firstSegment))) ?? null;
}

/** `/leads` → app/[locale]/admin/(crm)/leads; "" → the dashboard's own
 *  folder, which sits outside every zone. */
function routeDir(href: string): string {
  const relative = href.replace(/^\//, "");
  const zone = zoneOf(relative.split("/")[0] ?? "");
  return zone ? join(ADMIN_DIR, zone, relative) : join(ADMIN_DIR, relative);
}

function readGuard(file: string): Role[] | null {
  let source: string;
  try {
    source = stripComments(readFileSync(file, "utf8"));
  } catch {
    return null;
  }

  const capability = source.match(/requireCapability\(\s*locale\s*,\s*"(\w+)"/)?.[1] as
    | Capability
    | undefined;
  if (capability) return ALL_ROLES.filter((role) => can(role, capability));

  const explicit = source.match(/requireAdmin\(\s*locale\s*,\s*Role\.(\w+)/)?.[1] as
    | Role
    | undefined;
  if (explicit) return ALL_ROLES.filter((role) => hasRole(role, explicit));

  // requireAdmin(locale) — the default minimum is EDITOR.
  if (/requireAdmin\(\s*locale\s*\)/.test(source)) {
    return ALL_ROLES.filter((role) => hasRole(role, Role.EDITOR));
  }

  return null;
}

/**
 * Who may open the route a nav item points at.
 *
 * The page first, then the layout beside it. /admin/settings is the reason:
 * its page.tsx only redirects to the first settings group, and the ADMIN
 * guard that actually protects the section sits on settings/layout.tsx —
 * which is a perfectly ordinary place for it, since a layout wraps every
 * route beneath it.
 *
 * Then intersected with the zone layout above *that* — Phase 4's route
 * groups. A zone floor can be stricter than the page's own guard read in
 * isolation, and that used to go uncaught here: (crm)/layout.tsx briefly
 * guarded on the `viewAllLeads` capability, which is false for EDITOR,
 * while sales-team/page.tsx's own Role.SALES check admits them (EDITOR
 * outranks SALES on the rank ladder) — the zone silently overruling one
 * page inside it in a stricter direction than that page ever asked for.
 * Reading only the page, as before, would have kept reporting "EDITOR may
 * open this" right up to the redirect. A zone layout the regex above
 * cannot parse — (growth)'s minimum is chosen at request time from a
 * pathname header, not a literal `Role.X` — contributes nothing rather
 * than false-narrowing the result to nobody; every route inside it today
 * carries its own literal, readable guard regardless.
 */
function rolesAdmittedByRoute(href: string): Role[] | null {
  const dir = routeDir(href);
  const own = readGuard(join(dir, "page.tsx")) ?? readGuard(join(dir, "layout.tsx"));

  const zone = zoneOf(href.replace(/^\//, "").split("/")[0] ?? "");
  const zoneRoles = zone ? readGuard(join(ADMIN_DIR, zone, "layout.tsx")) : null;

  if (!own) return zoneRoles;
  if (!zoneRoles) return own;
  return own.filter((role) => zoneRoles.includes(role));
}

// ── Dead capabilities ────────────────────────────────────────────────────

/**
 * Capabilities the matrix defines that nothing consults yet.
 *
 * Each one is a promise the Users & Permissions screen makes on the
 * application's behalf and cannot keep, so the list is short, named, and
 * checked in both directions: a new dead capability fails the test, and so
 * does leaving a name here after it has been wired up.
 *
 * viewContent closed in Phase 4: (catalog)/layout.tsx and
 * (content)/layout.tsx now guard with requireCapability(locale,
 * "viewContent") rather than a bare rank, so the string is genuinely
 * consulted and the row it describes is genuinely enforced.
 *
 * · editContent    — enforced by the EDITOR rank default on every content
 *                    page rather than by a capability check. The row
 *                    already matches what happens, so it misleads nobody.
 * · manageProjects — SALES's "unitStatusOnly" narrowing is enforced in
 *                    units/actions.ts by rank, not through can().
 */
const KNOWN_UNENFORCED: Capability[] = ["editContent", "manageProjects"];

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) sourceFiles(path, found);
    else if (/\.tsx?$/.test(path)) found.push(path);
  }
  return found;
}

const referencesOutsideTheTable = (() => {
  const files = ["app", "components", "lib"]
    .flatMap((dir) => sourceFiles(join(ROOT, dir)))
    .filter((file) => !file.endsWith(join("lib", "permissions.ts")));

  const seen = new Set<string>();

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    for (const capability of CAPABILITIES) {
      if (source.includes(`"${capability}"`)) seen.add(capability);
    }
  }

  return seen;
})();

describe("permission capabilities", () => {
  it("are each consulted somewhere outside the table that defines them", () => {
    // A capability nothing checks is a row the Users & Permissions page
    // draws for a rule the application does not run.
    const dead = CAPABILITIES.filter(
      (capability) =>
        !referencesOutsideTheTable.has(capability) && !KNOWN_UNENFORCED.includes(capability),
    );

    expect(dead).toEqual([]);
  });

  it("has no stale entries in the unenforced list", () => {
    // Wiring one up should delete its line here, not leave a permanent
    // exemption behind.
    const wiredUp = KNOWN_UNENFORCED.filter((capability) =>
      referencesOutsideTheTable.has(capability),
    );

    expect(wiredUp).toEqual([]);
  });
});

// ── The sidebar ──────────────────────────────────────────────────────────

describe("admin sidebar", () => {
  it("finds the nav items it is supposed to be checking", () => {
    expect(items.length).toBeGreaterThan(15);
    expect(items.map((item) => item.key)).toContain("mobileView");
  });

  it("shows every item to at least one role", () => {
    // A capability and a rank that no role satisfies together is a menu
    // entry nobody will ever see — dead UI rather than a security hole,
    // but still not what anyone meant to write.
    const invisible = items.filter((item) => rolesSeeingItem(item).length === 0);

    expect(invisible.map((item) => item.key)).toEqual([]);
  });

  it("never shows a link to a role the destination refuses", () => {
    /* The one that would have caught the Mobile view bug: EDITOR passed
       the sidebar's `minRole: SALES` and failed the page's
       requireCapability(…, "viewAllLeads"). */
    const mismatches: string[] = [];

    for (const item of items) {
      const admitted = rolesAdmittedByRoute(item.href);
      if (!admitted) continue;

      const refused = rolesSeeingItem(item).filter((role) => !admitted.includes(role));
      if (refused.length > 0) {
        mismatches.push(`${item.key} (${item.href || "/"}) → shown to ${refused.join(", ")}`);
      }
    }

    expect(mismatches).toEqual([]);
  });

  it("reads a guard from every page it links to", () => {
    // If this starts failing, the guard-parsing above has gone blind and
    // the check before it is quietly passing on nothing.
    const unreadable = items.filter((item) => rolesAdmittedByRoute(item.href) === null);

    expect(unreadable.map((item) => item.key)).toEqual([]);
  });
});

describe("the route manifest", () => {
  it("has a real page for every path the nav links to", () => {
    /*
      Next only ever registers a route at a segment that has its own
      page.tsx — a layout alone (settings/layout.tsx, any zone layout)
      wraps children without becoming navigable at that path itself. That
      makes a page.tsx's presence the build-independent proxy for "this
      href is in the route manifest after `next build`": CI's unit-test job
      (.github/workflows/ci.yml) never runs a build before `npm test`, so a
      check against .next/app-path-routes-manifest.json directly would pass
      on a machine with a stale build sitting in .next/ and fail there
      every single time — the opposite of what a regression test is for.

      routeDir() is exactly what Phase 4's move needs this to survive: a
      route group renamed or a page moved to a different zone folder is
      still found here the same way rolesAdmittedByRoute() finds its guard,
      because both read the same zone map off disk rather than a hardcoded
      path.
    */
    const missing = items
      .map((item) => item.href)
      .filter((href) => !existsSync(join(routeDir(href), "page.tsx")));

    expect(missing).toEqual([]);
  });
});
