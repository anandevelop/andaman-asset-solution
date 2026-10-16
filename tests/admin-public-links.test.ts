/**
 * Every link from the admin to a public page names a route that exists.
 *
 * The project hub's brochure tab linked "view on site" to
 * /{locale}/e-brochures/{slug}, plural, while the public route is
 * app/[locale]/(site)/e-brochure, singular. The admin's own section is
 * /admin/e-brochures, plural, which is how the slip happened, and the
 * link was a 404 on every published brochure. Nothing in the type system
 * sees a path inside a template string, so this reads the source.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SITE = path.join(ROOT, "app", "[locale]", "(site)");

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sources(full);
    return /\.tsx?$/.test(name) ? [full] : [];
  });
}

describe("admin links to public pages", () => {
  it("point at a public route that exists", () => {
    const routes = new Set(readdirSync(SITE).filter((name) => statSync(path.join(SITE, name)).isDirectory()));
    const broken: string[] = [];

    for (const file of [...sources(path.join(ROOT, "app", "[locale]", "admin")), ...sources(path.join(ROOT, "components", "admin"))]) {
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(/`\/\$\{locale\}\/([a-z][a-z0-9-]*)/g)) {
        const segment = match[1];
        if (segment === "admin" || segment === "login") continue;
        if (!routes.has(segment)) broken.push(`${path.relative(ROOT, file)}: /${segment}`);
      }
    }

    expect(broken).toEqual([]);
  });
});
