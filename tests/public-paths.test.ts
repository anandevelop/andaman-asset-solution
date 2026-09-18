/**
 * tests/public-paths.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * lib/public-paths.ts decides whether a URL on this site is real. Two
 * things can make it wrong, and both are checked here.
 *
 * The first is drift: STATIC_PATHS is a hand-written list of the pages
 * with no dynamic segment, and a new page added without touching it turns
 * a live URL into a "broken link" on the admin screen, or a real 404 into
 * a "one typo away" suggestion pointing at nothing. The first test reads
 * the route folder and fails with the name of the page that was added.
 *
 * The second is the typo matcher being too eager. A suggestion is a button
 * that rewrites a URL for Google, so "close enough" has to mean close, and
 * the cases below are the ones that decide it.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  STATIC_PATHS,
  SYSTEM_PATHS,
  closestPath,
  editDistance,
  looksLikeBotProbe,
  looksLikeFile,
  slugOf,
  slugPrefixOf,
  stripLocale,
} from "@/lib/public-paths";

const SITE_DIR = join(process.cwd(), "app", "[locale]", "(site)");

/** Every folder under (site) that holds a page and no dynamic segment. */
function staticRouteFolders(dir: string, prefix = ""): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    // "[slug]" is a dynamic segment; "(group)" adds nothing to the URL.
    if (entry.name.startsWith("[")) continue;

    const segment = entry.name.startsWith("(") ? prefix : `${prefix}/${entry.name}`;
    const child = join(dir, entry.name);

    if (existsSync(join(child, "page.tsx"))) found.push(segment || "/");
    found.push(...staticRouteFolders(child, segment));
  }

  return found;
}

describe("STATIC_PATHS", () => {
  it("lists exactly the pages the route folder has", () => {
    const onDisk = new Set(staticRouteFolders(SITE_DIR));
    // The (site) group's own page.tsx is the home page.
    if (existsSync(join(SITE_DIR, "page.tsx"))) onDisk.add("/");

    expect([...onDisk].sort()).toEqual([...STATIC_PATHS].sort());
  });
});

describe("SYSTEM_PATHS", () => {
  it("is a subset of STATIC_PATHS, so the two can't drift apart", () => {
    for (const path of SYSTEM_PATHS) expect(STATIC_PATHS).toContain(path);
  });
});

describe("stripLocale", () => {
  it("removes a locale prefix", () => {
    expect(stripLocale("/th/projects/villa")).toBe("/projects/villa");
    expect(stripLocale("/ru/about")).toBe("/about");
  });

  it("leaves a path that has no locale alone", () => {
    expect(stripLocale("/projects/villa")).toBe("/projects/villa");
  });

  it("does not mistake a slug for a locale", () => {
    // "then-and-now" starts with "th" but is not the Thai prefix.
    expect(stripLocale("/news/then-and-now")).toBe("/news/then-and-now");
  });

  it("drops the query and the hash, which no row is keyed on", () => {
    expect(stripLocale("/th/projects/villa?utm_source=line#gallery")).toBe("/projects/villa");
  });

  it("treats a trailing slash as the same page", () => {
    expect(stripLocale("/th/projects/")).toBe("/projects");
    expect(stripLocale("/th/")).toBe("/");
  });
});

describe("slugPrefixOf", () => {
  it("finds the content type a path belongs to", () => {
    expect(slugPrefixOf("/projects/villa")).toBe("/projects");
    expect(slugPrefixOf("/e-brochure/2026")).toBe("/e-brochure");
  });

  it("is null for the index page itself, which has no slug", () => {
    expect(slugPrefixOf("/projects")).toBeNull();
    expect(slugPrefixOf("/projects/")).toBeNull();
  });

  it("is null for a section it does not own", () => {
    expect(slugPrefixOf("/about")).toBeNull();
  });

  it("reads the slug back out", () => {
    expect(slugOf("/projects/andaman-bay-villa", "/projects")).toBe("andaman-bay-villa");
  });
});

describe("looksLikeFile", () => {
  it("recognises a document", () => {
    expect(looksLikeFile("/media/floorplan.pdf")).toBe(true);
    expect(looksLikeFile("/img/hero.webp")).toBe(true);
  });

  it("does not call a slug with a dot in it a file", () => {
    expect(looksLikeFile("/projects/villa-3.5-bedroom")).toBe(false);
  });

  it("leaves ordinary pages alone", () => {
    expect(looksLikeFile("/projects/andaman-bay")).toBe(false);
  });
});

describe("looksLikeBotProbe", () => {
  it("knows the usual suspects", () => {
    expect(looksLikeBotProbe("/wp-login.php")).toBe(true);
    expect(looksLikeBotProbe("/sitemap_index.xml")).toBe(true);
    expect(looksLikeBotProbe("/.env")).toBe(true);
  });

  it("does not write off a real mistyped page as a bot", () => {
    expect(looksLikeBotProbe("/porjects")).toBe(false);
    expect(looksLikeBotProbe("/en/contact-us")).toBe(false);
  });

  it("leaves this site's own sitemap alone", () => {
    // /sitemap.xml is served by app/sitemap.ts and never 404s, but the
    // pattern must not be so broad that it would swallow it if it did.
    expect(looksLikeBotProbe("/projects/sitemap-villa")).toBe(false);
  });
});

describe("editDistance", () => {
  it("counts single edits", () => {
    expect(editDistance("/contact", "/contacts")).toBe(1);
    expect(editDistance("/contect", "/contact")).toBe(1);
  });

  it("counts a transposition as one edit, not two", () => {
    // The case the whole typo suggestion rests on — see the comment on
    // editDistance. Plain Levenshtein answers 2 here and the suggestion
    // never appears.
    expect(editDistance("/porjects", "/projects")).toBe(1);
  });

  it("still counts two unrelated wrong letters as two", () => {
    expect(editDistance("/prxjeqts", "/projects")).toBe(2);
  });

  it("stops counting past the cap instead of measuring exactly", () => {
    expect(editDistance("/a", "/completely-different", 3)).toBeGreaterThan(3);
  });
});

describe("closestPath", () => {
  const live = ["/", "/about", "/contact", "/news", "/projects", "/projects/andaman-bay-villa"];

  it("offers the obvious fix for a transposition", () => {
    expect(closestPath("/porjects", live)).toBe("/projects");
  });

  it("offers nothing when nothing is close", () => {
    expect(closestPath("/promo", live)).toBeNull();
    expect(closestPath("/qr-brochure", live)).toBeNull();
  });

  it("will not suggest a page that merely has the same length", () => {
    // "/contact" and "/projects" are both plausible-looking, but only one
    // is one edit from "/contect".
    expect(closestPath("/contect", live)).toBe("/contact");
  });

  it("holds a long slug to a proportionally tighter standard", () => {
    expect(closestPath("/projects/andaman-bay-vila", live)).toBe("/projects/andaman-bay-villa");
    expect(closestPath("/projects/andaman-bay-house", live)).toBeNull();
  });

  it("returns the path itself when it is already live", () => {
    expect(closestPath("/about", live)).toBe("/about");
  });
});
