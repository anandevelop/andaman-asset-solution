/**
 * tests/edit-mode.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Every "Edit" button on the public site goes somewhere real.
 *
 * lib/edit-mode.ts is a table of facts about two route trees, the same
 * kind of table as lib/home-outline.ts and with the same failure mode: an
 * admin screen moves and a pill that used to save an editor five clicks
 * becomes a link to a 404. Nothing renders these links in a unit test —
 * they only appear for a signed-in editor, after hydration — so this is
 * the only place a broken one would be noticed before a person clicks it.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ABOUT_SECTION_LINKS,
  HOME_AUTO_SECTION_LINKS,
  ITEM_EDIT_HREF,
  PAGE_EDIT_LINKS,
  SITE_CTA_LINKS,
  adminBaseFor,
  canSeeEditMode,
  pageEditLink,
  projectSectionLinks,
  type EditLink,
} from "@/lib/edit-mode";
import { HOME_OUTLINE } from "@/lib/home-outline";

const ROOT = process.cwd();
const ADMIN = join(ROOT, "app", "[locale]", "admin");
const SITE = join(ROOT, "app", "[locale]", "(site)");

/** Admin route groups, read off disk. */
const ZONES = readdirSync(ADMIN, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name.startsWith("("))
  .map((entry) => entry.name);

/** "/projects/ID/edit?x=1" → does app/[locale]/admin/(zone)/projects/[id]/edit/page.tsx exist? */
function adminRouteExists(href: string): boolean {
  const segments = href.split(/[?#]/)[0].replace(/^\//, "").split("/").filter(Boolean);

  const walk = (dir: string, rest: string[]): boolean => {
    if (rest.length === 0) return existsSync(join(dir, "page.tsx"));
    const [head, ...tail] = rest;
    if (existsSync(join(dir, head)) && walk(join(dir, head), tail)) return true;
    // A placeholder id stands for any dynamic segment.
    if (head === "ID") {
      return readdirSync(dir, { withFileTypes: true }).some(
        (entry) => entry.isDirectory() && /^\[[^.\]]+\]$/.test(entry.name) && walk(join(dir, entry.name), tail),
      );
    }
    return false;
  };

  return [ADMIN, ...ZONES.map((zone) => join(ADMIN, zone))].some((dir) => walk(dir, segments));
}

const ALL_LINKS: EditLink[] = [
  ...Object.values(PAGE_EDIT_LINKS),
  ...Object.values(ABOUT_SECTION_LINKS).flat(),
  ...Object.values(HOME_AUTO_SECTION_LINKS).flat(),
  ...Object.values(projectSectionLinks("ID")).flat(),
  ...SITE_CTA_LINKS,
  ...HOME_OUTLINE.flatMap((row) => row.editors),
];

describe("edit-mode links", () => {
  it.each(ALL_LINKS.map((link) => [link.href]))("%s is a real admin route", (href) => {
    expect(adminRouteExists(href)).toBe(true);
  });

  it.each(Object.entries(ITEM_EDIT_HREF))("item editor for %s is a real admin route", (_kind, build) => {
    expect(adminRouteExists(build("ID"))).toBe(true);
  });

  it("only maps public paths that exist", () => {
    for (const path of Object.keys(PAGE_EDIT_LINKS)) {
      const dir = path === "/" ? SITE : join(SITE, path.slice(1));
      expect(existsSync(join(dir, "page.tsx")), path).toBe(true);
    }
  });

  it("has a label for every link in every locale", () => {
    const keys = new Set([
      ...ALL_LINKS.map((link) => link.labelKey),
      // Used by <EditTarget> on the detail pages.
      "projectOverview",
      "article",
      "event",
      "brochure",
    ]);
    for (const locale of ["en", "th", "zh", "ru"]) {
      const messages = JSON.parse(readFileSync(join(ROOT, "messages", `${locale}.json`), "utf8"));
      for (const key of keys) {
        expect(messages.editMode.editors[key], `${locale}: editMode.editors.${key}`).toBeTruthy();
      }
    }
  });
});

describe("pageEditLink", () => {
  it("strips the locale and matches exactly", () => {
    expect(pageEditLink("/th")?.href).toBe("/pages/home");
    expect(pageEditLink("/zh/contact/")?.href).toBe("/pages/contact");
    // A detail page must mount <EditTarget>, not fall back to its list.
    expect(pageEditLink("/en/news/some-article")).toBeNull();
  });
});

describe("adminBaseFor", () => {
  it("keeps Thai and English, and sends the other locales to Thai", () => {
    expect(adminBaseFor("en")).toBe("/en/admin");
    expect(adminBaseFor("th")).toBe("/th/admin");
    expect(adminBaseFor("zh")).toBe("/th/admin");
    expect(adminBaseFor("ru")).toBe("/th/admin");
  });
});

describe("canSeeEditMode", () => {
  it("is for content editors and up", () => {
    expect(canSeeEditMode("SUPER_ADMIN")).toBe(true);
    expect(canSeeEditMode("ADMIN")).toBe(true);
    expect(canSeeEditMode("EDITOR")).toBe(true);
    expect(canSeeEditMode("SALES")).toBe(false);
    expect(canSeeEditMode("VIEWER")).toBe(false);
    expect(canSeeEditMode(null)).toBe(false);
  });
});
