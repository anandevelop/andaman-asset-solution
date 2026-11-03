/**
 * tests/open-graph-pages.test.ts
 *
 * Every public page that declares a canonical also declares og:url
 * (Ahrefs "Open Graph tags incomplete"): a page's openGraph replaces the
 * layout's, and the layout cannot know the path.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openGraphFor } from "@/lib/seo";

const SITE = join(process.cwd(), "app", "[locale]", "(site)");

function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return pages(full);
    return name === "page.tsx" ? [full] : [];
  });
}

describe("og:url on public pages", () => {
  const withCanonical = pages(SITE).filter((file) => readFileSync(file, "utf8").includes("localizedAlternates("));

  it.each(withCanonical.map((file) => [file.slice(SITE.length)]))("%s sets openGraph with a url", (rel) => {
    const source = readFileSync(join(SITE, rel), "utf8");
    expect(/openGraphFor\(|openGraph:\s*\{[^}]*\burl:/.test(source)).toBe(true);
  });

  it("openGraphFor names the canonical URL and the site-wide fields", () => {
    expect(openGraphFor("th", "/progress")).toMatchObject({
      url: "https://andamanassetsolution.com/th/progress",
      siteName: "Andaman Asset Solution",
      locale: "th_TH",
      type: "website",
    });
    expect(openGraphFor("en", "").url).toBe("https://andamanassetsolution.com/en");
  });
});
