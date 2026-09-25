/**
 * tests/admin/home-outline.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The home page's outline describes the home page, and every row it draws
 * goes somewhere real.
 *
 * lib/home-outline.ts is a static table of facts about two other route
 * trees — which admin screen writes the copy each band of the home page
 * renders. That cannot be derived, so it can drift: a screen moves, and a
 * row that used to be a helpful "edit in About → Awards" becomes a link to
 * a 404. That is the defect this entire restructure has been removing, and
 * this outline is a new place for it to reappear, so it is checked here the
 * way lib/admin/nav.ts is checked next door.
 *
 * The other half is coverage in both directions against HOME_SECTION_KEYS.
 * A key the outline does not describe renders a raw i18n key on screen; a
 * key the outline describes that no longer exists renders a row that can
 * never be reordered because there is no HomeSection row behind it.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { HOME_SECTION_KEYS } from "@/lib/home-sections";
import {
  CTA_ROW,
  HERO_ROW,
  HOME_OUTLINE,
  OUTLINE_MANAGED_KEYS,
  outlineCoversEverySection,
} from "@/lib/home-outline";

const ROOT = process.cwd();
const ADMIN = join(ROOT, "app", "[locale]", "admin");

/** Route groups under admin/, read off disk so a renamed zone cannot
 *  silently break this the way a hardcoded list would. */
const ZONES = ["(catalog)", "(content)", "(crm)", "(growth)", "(system)"];

function routeExists(href: string): boolean {
  const relative = href.replace(/^\//, "");
  const zone = ZONES.find((z) => existsSync(join(ADMIN, z, relative.split("/")[0])));
  const dir = zone ? join(ADMIN, zone, relative) : join(ADMIN, relative);
  return existsSync(join(dir, "page.tsx"));
}

describe("the home outline", () => {
  it("covers every reorderable section, and nothing else", () => {
    expect(outlineCoversEverySection()).toBe(true);
    expect([...OUTLINE_MANAGED_KEYS].sort()).toEqual([...HOME_SECTION_KEYS].sort());
  });

  it("opens with the banner and closes with the CTA", () => {
    /* Render order, not HOME_SECTION_KEYS order. These two are the bands
       that were tabs *beside* the order list rather than rows *in* it,
       which is why the list was not a picture of the page. */
    expect(HERO_ROW.key).toBe("HERO");
    expect(CTA_ROW.key).toBe("CTA");
    expect(HERO_ROW.managed).toBe(false);
    expect(CTA_ROW.managed).toBe(false);
  });

  it("points every editor link at a route that exists", () => {
    const dead = HOME_OUTLINE.flatMap((row) => row.editors)
      .map((editor) => editor.href)
      .filter((href) => !routeExists(href));

    expect(dead, "outline links to a page that is not there").toEqual([]);
  });

  it("gives an automatic row an explanation instead of a link", () => {
    // Those sections could never be edited here and nothing used to say
    // why — an inert row with no reason is read as a broken one.
    for (const row of HOME_OUTLINE) {
      if (row.editors.length === 0) {
        expect(row.autoKey, `${row.key} has no editor and no explanation`).toBeTruthy();
      } else {
        expect(row.autoKey, `${row.key} has both an editor and an auto note`).toBeUndefined();
      }
    }
  });

  it("labels every row and every editor in all four locales", () => {
    // next-intl throws at render time for a missing key, so a row added
    // without its copy takes the page down rather than degrading.
    for (const locale of ["en", "th", "zh", "ru"]) {
      const messages = JSON.parse(readFileSync(join(ROOT, "messages", `${locale}.json`), "utf8"));
      const hb = messages.admin.homeBuilder;

      for (const row of HOME_OUTLINE) {
        expect(hb.sections[row.labelKey], `${locale}: sections.${row.labelKey}`).toBeTruthy();

        if (row.autoKey) {
          expect(hb.auto?.[row.autoKey], `${locale}: auto.${row.autoKey}`).toBeTruthy();
        }
        for (const editor of row.editors) {
          expect(hb.editor?.[editor.labelKey], `${locale}: editor.${editor.labelKey}`).toBeTruthy();
        }
      }
    }
  });

  it("names two owners for the intro, which is why the table exists", () => {
    /* "Who we are" takes its words from the About page's story and its
       photographs from a screen under Home. One row, two places, and
       nothing on screen said either before this. */
    const intro = HOME_OUTLINE.find((row) => row.key === "COMPANY_INTRO");

    expect(intro?.editors.map((editor) => editor.href)).toEqual([
      "/pages/about/story",
      "/pages/home/gallery",
    ]);
  });
});

describe("the Home tab", () => {
  const stripComments = (source: string) =>
    source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("is the outline itself, not a redirect to a sub-tab", () => {
    const page = stripComments(
      readFileSync(join(ADMIN, "(content)", "pages", "home", "page.tsx"), "utf8"),
    );

    expect(page).toContain('from "@/lib/home-outline"');
    expect(page).not.toContain("redirect(");
  });

  it("keeps the three editor routes it links to", () => {
    // Linked from their rows rather than duplicated inline — see the
    // page's header and docs/ADMIN_HOME_BUILDER_PLAN.md.
    for (const segment of ["hero", "gallery", "cta"]) {
      expect(
        existsSync(join(ADMIN, "(content)", "pages", "home", segment, "page.tsx")),
        segment,
      ).toBe(true);
    }
  });

  it("still reaches the reorder actions it moved away from", () => {
    const page = stripComments(
      readFileSync(join(ADMIN, "(content)", "pages", "home", "page.tsx"), "utf8"),
    );

    expect(page).toContain('from "./sections/actions"');
  });
});
