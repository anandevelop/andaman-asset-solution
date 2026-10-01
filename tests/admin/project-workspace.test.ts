/**
 * tests/admin/project-workspace.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Everything about one project lives under /admin/projects/[id], and the
 * Overview form does not touch the SEO tab's fields.
 *
 * Two defects this pins, both of which shipped:
 *
 *  1. The "Progress" tab of the project workspace navigated out of the
 *     project workspace, to /admin/progress/[projectId]. The tab bar stayed
 *     on screen while the sidebar highlight moved to a different row and
 *     the URL said somewhere else.
 *
 *  2. ProjectForm carried metaTitle, metaDescription and noIndex as hidden
 *     inputs holding whatever they were when the page rendered, so that
 *     saving Overview "preserved" them. What it actually did was write back
 *     a snapshot: an Overview save from a tab opened before an SEO edit
 *     silently reverted that edit, with nothing on screen mentioning SEO.
 *
 * Read from source, like the rest of tests/admin/: these are Server
 * Components and "use server" modules.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const CATALOG = join(ROOT, "app", "[locale]", "admin", "(catalog)");

const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const read = (...parts: string[]) => stripComments(readFileSync(join(...parts), "utf8"));

describe("the workspace tabs", () => {
  const tabs = read(ROOT, "components", "admin", "ProjectHubTabs.tsx");

  it("all point under /projects/[id]", () => {
    // Every href is built from `base`, which is that prefix. A literal
    // path anywhere in here is a tab that leaves the workspace.
    const hrefs = [...tabs.matchAll(/href: `([^`]+)`/g)].map((m) => m[1]);

    expect(hrefs.length).toBeGreaterThan(5);
    for (const href of hrefs) {
      expect(href, href).toMatch(/^\$\{base\}\//);
    }

    expect(tabs).toContain("const base = `/${locale}/admin/projects/${projectId}`");
  });

  it("has a route behind every one of them", () => {
    // A tab pointing at a 404 is the defect the whole restructure removes.
    for (const segment of [
      "edit",
      "content",
      "seo",
      "unit-types",
      "units",
      "site-plan",
      "facilities",
      "progress",
      "brochures",
    ]) {
      expect(
        existsSync(join(CATALOG, "projects", "[id]", segment, "page.tsx")),
        segment,
      ).toBe(true);
    }
  });

  it("keeps the site plan reachable from the units tab", () => {
    /* The site plan once had no tab and no link from anywhere in the back
       office — the only way in was to type the URL. The tab used to land
       on it for that reason. The v4 tab lands on the unit tiles instead,
       so the rule is now stated directly: the plan is a step of that tab
       (the segmented control under the strip), and the units page links
       to it from its rail. Dropping either would bring the defect back. */
    expect(tabs).toContain('{ key: "sitePlan", segment: "/site-plan"');
    expect(tabs).toContain('sitePlan: "unitsPlan"');
    const units = read(CATALOG, "projects", "[id]", "units", "page.tsx");
    expect(units).toContain("/site-plan`");
  });

  it("reads its own labels instead of taking them as a prop", () => {
    // Seven callers each passing the same object meant adding a tab was a
    // seven-file change, and one copy was always stale.
    expect(tabs).toContain("getTranslations");
    expect(tabs).not.toContain("labels:");
  });
});

describe("the two-route tabs", () => {
  const tabs = read(ROOT, "components", "admin", "ProjectHubTabs.tsx");

  it("draw both routes in the segmented control", () => {
    for (const segment of ["/content", "/seo", "/units", "/site-plan"]) {
      expect(tabs, segment).toContain(`segment: "${segment}"`);
    }
  });

  it("are each opened by the page that is that step", () => {
    for (const [dir, step] of [
      ["content", "content"],
      ["seo", "seo"],
      ["units", "units"],
      ["site-plan", "sitePlan"],
      ["unit-types", "unitTypes"],
    ] as const) {
      const page = read(CATALOG, "projects", "[id]", dir, "page.tsx");
      expect(page, dir).toMatch(new RegExp(`<ProjectHubTabs[^>]*active="${step}"`));
    }
  });
});

describe("the Overview form", () => {
  const form = read(ROOT, "components", "admin", "ProjectForm.tsx");
  const actions = read(CATALOG, "projects", "actions.ts");

  it("sends no SEO field at all", () => {
    for (const name of ["metaTitle", "metaDescription", "noIndex"]) {
      expect(form, name).not.toContain(`name="${name}"`);
    }
  });

  it("and the action leaves a field it was not sent alone", () => {
    /* `has`, not "is it empty": the SEO tab must still be able to clear a
       meta description, and an empty box there is a real edit. Absent and
       empty are different answers, and collapsing them would swap one
       silent data loss for another. */
    expect(actions).toContain('formData.has("metaTitle")');
    expect(actions).toContain("seoSubmitted ? { metaTitle, metaDescription, noIndex } : {}");
  });
});

describe("the per-project progress page", () => {
  it("lives in the workspace", () => {
    expect(existsSync(join(CATALOG, "projects", "[id]", "progress", "page.tsx"))).toBe(true);
    expect(existsSync(join(CATALOG, "progress", "[projectId]"))).toBe(false);
  });

  it("leaves the cross-project list where it was", () => {
    // Nothing about that list is per-project, so moving it would have been
    // a rename for its own sake — and it is a tab of /admin/projects now.
    expect(existsSync(join(CATALOG, "progress", "page.tsx"))).toBe(true);
  });

  it("shares the write path rather than copying it", () => {
    const page = read(CATALOG, "projects", "[id]", "progress", "page.tsx");

    expect(page).toContain('from "@/app/[locale]/admin/(catalog)/progress/actions"');
    expect(existsSync(join(CATALOG, "projects", "[id]", "progress", "actions.ts"))).toBe(false);
  });

  it("is purged at its new path after a save", () => {
    const actions = read(CATALOG, "progress", "actions.ts");

    expect(actions).toContain("/admin/projects/${projectId}/progress");
  });
});

describe("links that pointed at the old address", () => {
  it("were all repointed", () => {
    /* The general rule for every route this restructure moves: grep the
       old path across app/, components/ and lib/ afterwards. A hardcoded
       link left behind survives the redirect but costs a round trip and,
       for a `Link`, prefetches the wrong thing. */
    for (const [file, expected] of [
      [join(ROOT, "components", "admin", "ProjectsTable.tsx"), "/admin/projects/${row.id}/progress"],
      [join(ROOT, "lib", "media-usage.ts"), "/admin/projects/${p.projectId}/progress"],
      [join(CATALOG, "progress", "page.tsx"), "/admin/projects/${project.id}/progress"],
    ] as const) {
      const source = read(file);

      expect(source, file).toContain(expected);
      expect(source, file).not.toMatch(/\/admin\/progress\/\$\{/);
    }
  });
});
