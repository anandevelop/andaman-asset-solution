/**
 * tests/admin/moved-screens.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The screens that changed address, and the two things about them that
 * must not have changed with it: who may save, and which storage keys get
 * written.
 *
 * Moving a route is the cheapest way to accidentally re-grant something.
 * A page lifted out of /admin/settings lands in a zone with a different
 * floor — (content) admits VIEWER where (system) floors at ADMIN — so
 * "unchanged" is not the default outcome of a move, it is a thing each
 * page has to do on purpose with its own guard and its own `canWrite`.
 * That is what this file pins.
 *
 * Read from source: these are async Server Components that open a database
 * connection on their first line, and their actions are "use server"
 * modules. Same reasoning as tests/admin/permissions-nav.test.ts.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const ADMIN = join(ROOT, "app", "[locale]", "admin");

const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const read = (...parts: string[]) => stripComments(readFileSync(join(...parts), "utf8"));

describe("the About story tab", () => {
  const dir = join(ADMIN, "(content)", "pages", "about", "story");

  it("still requires ADMIN to save", () => {
    /* The other tabs in this hub admit EDITOR. This one did not before the
       move and must not start to because of it — opening the company's own
       description to every editor is a policy call, not a side effect. */
    expect(read(dir, "actions.ts")).toContain("requireAdminAction(Role.ADMIN)");
    expect(read(dir, "page.tsx")).toContain("hasRole(session.role, Role.ADMIN)");
  });

  it("lets the rest of the hub's readers open it", () => {
    expect(read(dir, "page.tsx")).toContain("requireAdmin(locale, Role.VIEWER)");
  });

  it("purges its own new path after a save", () => {
    // It purged /admin/settings/company, which nothing renders any more.
    const actions = read(dir, "actions.ts");

    expect(actions).toContain("/admin/pages/about/story");
    expect(actions).not.toContain("/admin/settings/company");
  });

  it("left nothing behind in settings", () => {
    expect(existsSync(join(ADMIN, "(system)", "settings", "company"))).toBe(false);
  });
});

describe("the Contact tab", () => {
  const page = read(ADMIN, "(content)", "pages", "contact", "page.tsx");

  it("still requires ADMIN to save", () => {
    expect(page).toContain("hasRole(session.role, Role.ADMIN)");
    expect(page).toContain("<fieldset disabled={!canWrite}");
  });

  it("binds the settings action rather than a copy of it", () => {
    /* A second write path to the same SiteSetting rows is a second place
       to forget a validator. The action's partial-update rule is also what
       makes one-language-at-a-time editing safe here. */
    expect(page).toContain('from "@/app/[locale]/admin/(system)/settings/actions"');
  });

  it("writes the same SiteSetting keys the settings page did", () => {
    // The move was a UI change. A renamed key would silently orphan the
    // value the public footer reads.
    for (const key of [
      "contact.phone",
      "contact.phoneDisplay",
      "contact.whatsapp",
      "contact.email",
      "contact.salesEmail",
      "contact.mapUrl",
      "social.facebook",
      "social.instagram",
      "social.youtube",
    ]) {
      expect(page, key).toContain(`"${key}"`);
    }

    // The eight per-locale keys are built from a suffix map rather than
    // written out, so check the map instead of the strings.
    expect(page).toContain('{ en: "En", th: "Th", zh: "Zh", ru: "Ru" }');
    expect(page).toContain("`contact.address${SUFFIX[l]}`");
    expect(page).toContain("`contact.officeHours${SUFFIX[l]}`");
  });

  it("left nothing behind in settings", () => {
    expect(existsSync(join(ADMIN, "(system)", "settings", "contact"))).toBe(false);
  });
});

describe("the SEO defaults tab", () => {
  const page = read(ADMIN, "(growth)", "seo", "defaults", "page.tsx");

  it("still requires ADMIN, which is also the zone's floor", () => {
    expect(page).toContain("requireAdmin(locale, Role.ADMIN)");
  });

  it("binds the settings action rather than a copy of it", () => {
    expect(page).toContain('from "@/app/[locale]/admin/(system)/settings/actions"');
  });

  it("left nothing behind in settings", () => {
    expect(existsSync(join(ADMIN, "(system)", "settings", "seo"))).toBe(false);
  });
});

describe("what settings has left", () => {
  it("is four groups, all of them actually settings", () => {
    /* company, contact and seo each edited a public page rather than the
       system's behaviour, which is why they left. If a fifth row appears
       here, the question to ask is which of the two it is. */
    const nav = stripComments(readFileSync(join(ROOT, "components", "admin", "SettingsNav.tsx"), "utf8"));
    const keys = [...nav.matchAll(/\{ key: "(\w+)", segment:/g)].map((m) => m[1]);

    expect(keys).toEqual(["notifications", "integrations", "privacy", "system"]);
  });

  it("sends the bare path to a group that still exists", () => {
    const index = read(ADMIN, "(system)", "settings", "page.tsx");

    expect(index).toContain("/admin/settings/notifications");
  });

  it("purges both hubs that took its screens", () => {
    const actions = read(ADMIN, "(system)", "settings", "actions.ts");

    expect(actions).toContain("admin/seo`, \"layout\"");
    expect(actions).toContain("admin/pages`, \"layout\"");
  });
});
