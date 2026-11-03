/**
 * tests/admin/admin-href-prefix.test.ts
 *
 * Hrefs that a page prefixes with `/${locale}/admin` must not carry
 * "/admin" themselves — that produced /en/admin/admin/seo/urls (the SEO
 * overview's Critical button) and /en/admin/admin/news/ID/edit (Cmd-K).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

/** Producers whose hrefs reach a `/${locale}/admin${href}` link. */
const PRODUCERS = [
  "lib/seo-audit.ts", // SEO overview issues → seo/page.tsx
  "app/[locale]/admin/command-search-actions.ts", // Cmd-K hits → CommandK.tsx
];

describe("admin-relative hrefs", () => {
  it.each(PRODUCERS)("%s writes hrefs without /admin", (file) => {
    const source = readFileSync(join(ROOT, file), "utf8");
    expect(source).not.toMatch(/href:\s*["'`]\/admin\b/);
  });

  it("the consumers do add /admin", () => {
    const seo = readFileSync(join(ROOT, "app/[locale]/admin/(growth)/seo/page.tsx"), "utf8");
    const cmdk = readFileSync(join(ROOT, "components/admin/CommandK.tsx"), "utf8");
    expect(seo).toContain("/admin${issue.href}");
    expect(cmdk).toContain("/admin${hit.href}");
  });
});
