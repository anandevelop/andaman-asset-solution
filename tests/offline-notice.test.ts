/**
 * tests/offline-notice.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * A page that reads Postgres through safeQuery degrades to an empty state
 * when the database is unreachable. An empty state means two very different
 * things — "nothing here yet" and "we cannot see anything right now" — and
 * a page that does not say which one invites the worse reading.
 *
 * /admin/progress was the one admin list page that did not say. During an
 * outage an editor saw zero projects with no explanation, which reads as
 * data loss rather than as an outage.
 *
 * Structural, reading source rather than rendering: these are async Server
 * Components that talk to a real database, and the cheap check is the one
 * that greps them — the same reasoning as the <h1> count in
 * tests/routes.test.ts.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const ADMIN_DIR = join(process.cwd(), "app", "[locale]", "admin");
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

/** "contact", "projects/[slug]", or "" for the section's index page. */
const routeOf = (file: string, root: string) =>
  relative(root, file).replace(`${sep}page.tsx`, "").replace(/\\/g, "/").replace("page.tsx", "");

describe("admin list pages", () => {
  const withSafeQuery = pages(ADMIN_DIR).filter((file) => read(file).includes("safeQuery("));

  it("finds the pages it is supposed to be checking", () => {
    // A glob that matched nothing would make the assertion below pass
    // without checking anything.
    expect(withSafeQuery.length).toBeGreaterThan(5);
  });

  it("gives every page that can render an empty list an offline signal", () => {
    const gaps = withSafeQuery
      .filter((file) => {
        const source = read(file);

        return !source.includes("isDatabaseOffline(") || !source.includes("common.offline");
      })
      .map((file) => routeOf(file, ADMIN_DIR));

    expect(gaps).toEqual([]);
  });
});

describe("public pages", () => {
  /*
    Exemptions, each with the reason it is exempt.

    Recording the reason is the point. A bare list of filenames is a list
    someone appends to in order to make this suite green; a list of reasons
    forces the next person to decide whether their page really is one of
    these two cases.
  */
  const EXEMPT: Record<string, string> = {
    contact:
      "settings-only — getSiteSettings() falls back to config/site.ts, so the page renders complete during an outage and has no empty state to explain",
    "privacy-policy": "static copy from content/, reads no table",
    terms: "static copy from content/, reads no table",
  };

  /** Any module under lib/ that returns rows. */
  const READS_DATABASE =
    /from "@\/lib\/(projects|news|events|awards|brochures|company|faqs|sales-team|hero-story|settings|project-filters)"/;

  const dataPages = pages(SITE_DIR).filter((file) => READS_DATABASE.test(read(file)));

  it("finds the pages it is supposed to be checking", () => {
    expect(dataPages.length).toBeGreaterThan(5);
  });

  it("makes every data-reading page account for an outage", () => {
    /*
      Two acceptable answers, not one:

        <DbOfflineNotice />          a listing renders its empty state and
                                     says why (development-only by design —
                                     visitors get the plain empty state).
        DatabaseUnavailableError     a detail page escalates instead, so
                                     app/[locale]/error.tsx can answer
                                     rather than serving a 404 for a page
                                     that exists.
    */
    const gaps = dataPages
      .filter((file) => {
        const route = routeOf(file, SITE_DIR);
        if (route in EXEMPT) return false;

        const source = read(file);

        return (
          !source.includes("<DbOfflineNotice") &&
          !source.includes("new DatabaseUnavailableError")
        );
      })
      .map((file) => routeOf(file, SITE_DIR));

    expect(gaps).toEqual([]);
  });

  it("exempts nothing that no longer exists", () => {
    // An exemption for a deleted or renamed page is a stale excuse that
    // would silently cover a future page of the same name.
    const routes = pages(SITE_DIR).map((file) => routeOf(file, SITE_DIR));

    expect(Object.keys(EXEMPT).filter((route) => !routes.includes(route))).toEqual([]);
  });
});
