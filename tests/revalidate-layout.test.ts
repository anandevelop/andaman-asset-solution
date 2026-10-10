/**
 * tests/revalidate-layout.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * No action may purge the public site with `revalidatePath(\`/${locale}\`,
 * "layout")`.
 *
 * With type "layout" Next matches the route's folder pattern
 * (`/[locale]/layout`), not a URL, so a literal "/th" purges nothing. Eight
 * actions did exactly that — the closing CTA, the sales strip, the About
 * sections, the home gallery, the manual "clear cache" button — and every
 * one of those edits stayed off the production site until the page's own
 * revalidate window ran out. `next dev` renders fresh on every request, so
 * nothing looked wrong locally. Use revalidatePublicSite()
 * (lib/revalidate-site.ts) instead.
 *
 * Structural, reading source, because the failure only shows in a
 * production build with a warm cache.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(path, found);
    else if (/\.tsx?$/.test(entry.name)) found.push(path);
  }
  return found;
}

/** `/${anything}` and nothing after it, purged as a layout. */
const LOCALE_ONLY_LAYOUT = /revalidatePath\(\s*`\/\$\{[^}]+\}`\s*,\s*["']layout["']\s*\)/;

describe("public-site purges", () => {
  it("never revalidate a bare locale path as a layout", () => {
    const offenders = ["app", "lib"]
      .flatMap((dir) => sourceFiles(join(process.cwd(), dir)))
      .filter((file) => LOCALE_ONLY_LAYOUT.test(readFileSync(file, "utf8")))
      .map((file) => file.replace(`${process.cwd()}/`, ""));
    expect(offenders).toEqual([]);
  });
});
