/**
 * tests/breadcrumbs.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Every public page except the home page carries a trail, and it is the
 * same trail twice.
 *
 * Two things this catches. A page added later without one — the breadcrumb
 * is the sort of chrome nobody remembers on page fifteen, and its absence
 * looks like a rendering bug rather than an omission. And the older
 * failure this replaced: a page that hand-built its JSON-LD
 * BreadcrumbList separately from its visible trail, so the two could say
 * different things and only Google would ever notice.
 *
 * Structural, reading source rather than rendering: these are async Server
 * Components that talk to a database, and the cheap check is the one that
 * greps them — the same reasoning as tests/offline-notice.test.ts.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const SITE_DIR = join(process.cwd(), "app", "[locale]", "(site)");

function pages(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) pages(path, found);
    else if (entry.name === "page.tsx") found.push(path);
  }
  return found;
}

const read = (file: string) => readFileSync(file, "utf8");

/** "contact", "projects/[slug]", or "" for the home page. */
const routeOf = (file: string) =>
  relative(SITE_DIR, file).replace(`${sep}page.tsx`, "").replace(/\\/g, "/").replace("page.tsx", "");

const all = pages(SITE_DIR);

/** The home page is where the trail starts, so it has nothing to show. */
const shouldHaveTrail = all.filter((file) => routeOf(file) !== "");

describe("public pages", () => {
  it("finds the pages it is supposed to be checking", () => {
    expect(shouldHaveTrail.length).toBeGreaterThan(10);
  });

  it("all render a breadcrumb except the home page", () => {
    const missing = shouldHaveTrail
      .filter((file) => !read(file).includes("<Breadcrumb"))
      .map(routeOf);

    expect(missing).toEqual([]);
  });

  it("never renders one without building the trail through trailFor", () => {
    // A hand-rolled array would be a second answer to "where am I", and
    // the JSON-LD below it would still be reading the first one.
    const handRolled = shouldHaveTrail
      .filter((file) => {
        const source = read(file);
        return source.includes("<Breadcrumb") && !source.includes("trailFor(");
      })
      .map(routeOf);

    expect(handRolled).toEqual([]);
  });

  it("feeds the same trail to the JSON-LD breadcrumb", () => {
    const drifting = shouldHaveTrail
      .filter((file) => {
        const source = read(file);
        if (!source.includes("breadcrumbList(")) return false;
        // The whole point: one variable, both consumers.
        return !source.includes("breadcrumbList(trail)");
      })
      .map(routeOf);

    expect(drifting).toEqual([]);
  });

  it("gives every page a JSON-LD breadcrumb too", () => {
    const missing = shouldHaveTrail
      .filter((file) => !read(file).includes("breadcrumbList("))
      .map(routeOf);

    expect(missing).toEqual([]);
  });

  it("leaves the home page alone", () => {
    const home = all.find((file) => routeOf(file) === "");
    expect(home).toBeDefined();
    expect(read(home!)).not.toContain("<Breadcrumb");
  });
});
