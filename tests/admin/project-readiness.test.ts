/**
 * tests/admin/project-readiness.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The readiness panel is advice, and every row of it has somewhere to go.
 *
 * Two things worth pinning, both of which would fail silently:
 *
 *  1. It must not become a publish gate. lib/publishing-gate.ts decides
 *     what may go live, from `contentStatus`; if this file ever grew a
 *     caller there, a project would stop publishing because nobody had
 *     written its Russian tagline — which is exactly the kind of rule that
 *     gets added for a good local reason and discovered on a launch day.
 *
 *  2. Every check points at a tab that exists, and the panel's map of
 *     tab → path agrees with ProjectHubTabs'. Two hand-written path maps
 *     for one tab bar is the defect NavItem.tabsBase was introduced to
 *     remove one layer up; here the map is small enough to keep, so this
 *     is what keeps it honest.
 *
 * Read from source, like the rest of tests/admin/: the lib is
 * `server-only` and opens a database connection, and what is asserted is
 * structural.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const CATALOG = join(ROOT, "app", "[locale]", "admin", "(catalog)");

const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const read = (...parts: string[]) => stripComments(readFileSync(join(ROOT, ...parts), "utf8"));

/** Every .ts/.tsx under app/, components/ and lib/. */
function sourceFiles(root: string, found: string[] = []): string[] {
  for (const dir of ["app", "components", "lib"]) {
    walk(join(root, dir), found);
  }
  return found;
}

function walk(dir: string, found: string[]): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, found);
    else if (/\.tsx?$/.test(path)) found.push(path);
  }
}

const lib = read("lib", "admin", "project-readiness.ts");
const panel = read("components", "admin", "ProjectReadinessPanel.tsx");
const hubTabs = read("components", "admin", "ProjectHubTabs.tsx");

describe("project readiness", () => {
  it("is not consulted by the publish gate", () => {
    const gate = read("lib", "publishing-gate.ts");

    expect(gate).not.toContain("project-readiness");
    expect(gate).not.toContain("getProjectReadiness");
  });

  it("is read by the Overview tab, and the list's cards in one batch", () => {
    /* A new caller is the moment to ask whether it needs its own query
       shape. The project list did: a card per project, read per project,
       would be a page of round trips. It calls getProjectReadinessFor
       with every id on the page instead — the same single query. Naming
       the expected callers makes the failure say which file appeared. */
    const callersOf = (needle: string) =>
      sourceFiles(ROOT)
        .filter((file) => !file.endsWith(join("lib", "admin", "project-readiness.ts")))
        .filter((file) => stripComments(readFileSync(file, "utf8")).includes(needle))
        .map((file) => file.slice(ROOT.length + 1));

    expect(callersOf("getProjectReadiness(")).toEqual([
      join("app", "[locale]", "admin", "(catalog)", "projects", "[id]", "edit", "page.tsx"),
    ]);
    expect(callersOf("getProjectReadinessFor(")).toEqual([
      join("app", "[locale]", "admin", "(catalog)", "projects", "page.tsx"),
    ]);
  });

  it("stays one query", () => {
    // The panel renders on a page that already runs a full project fetch.
    // Five round trips to tell you what you could learn by clicking would
    // be a worse trade than the clicking.
    const fetches = [...lib.matchAll(/prisma\.\w+\.(findFirst|findMany|count|groupBy)/g)];

    expect(fetches).toHaveLength(1);
    expect(lib).toContain("_count");
  });

  it("degrades rather than throwing when the database blinks", () => {
    // Same rule as every other admin read — see lib/db.ts.
    expect(lib).toContain("safeQuery");
  });

  it("treats a video-led project as having its hero", () => {
    /* heroImageUrl alone reports a VIDEO project as missing a hero it
       does have; Project.heroMediaType is what decides which field
       counts. */
    expect(lib).toContain('row.heroMediaType === "VIDEO"');
    expect(lib).toContain("filled(row.heroVideoUrl)");
  });

  it("requires both halves of a locale's SEO", () => {
    // A title with no description still truncates to the page's own first
    // paragraph in a result, which is what the SEO tab exists to stop.
    expect(lib).toContain("filled(entry.metaTitle) && filled(entry.metaDescription)");
  });
});

describe("the panel's links", () => {
  it("send every check to a route that exists", () => {
    const segments = [...panel.matchAll(/^\s+(\w+): "(\/[\w-]+)",$/gm)].map((m) => m[2]);

    expect(segments.length).toBeGreaterThan(4);
    for (const segment of segments) {
      expect(
        existsSync(join(CATALOG, "projects", "[id]", segment.slice(1), "page.tsx")),
        segment,
      ).toBe(true);
    }
  });

  it("agree with ProjectHubTabs about where house types are edited", () => {
    /* House types have their own tab since v4; the "no house types yet"
       check must open that tab, not the unit tiles. */
    expect(panel).toContain('unitTypes: "/unit-types"');
    expect(hubTabs).toContain("href: `${base}/unit-types`");
  });
});
