/**
 * tests/routes.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Structural checks on routing and SEO surfaces.
 *
 * These catch the class of bug that no type or lint rule can see: a nav
 * item pointing at a page that does not exist, or a page that exists but
 * never reaches the sitemap. Both shipped in this project before — /progress
 * was a 404 in the primary navigation for five phases.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { siteConfig } from "@/config/site";
import { locales, defaultLocale } from "@/i18n";

const SITE_DIR = join(process.cwd(), "app", "[locale]", "(site)");
const sitemapSource = readFileSync(join(process.cwd(), "app", "sitemap.ts"), "utf8");

/** Static paths passed to localized() in app/sitemap.ts. */
const sitemapPaths = [...sitemapSource.matchAll(/localized\("([^"]*)"/g)].map(
  (m) => m[1],
);

describe("navigation", () => {
  it.each(siteConfig.nav.main.map((item) => [item.key, item.href]))(
    "nav item %s → %s has a page",
    (_key, href) => {
      const dir = href === "/" ? SITE_DIR : join(SITE_DIR, href);

      expect(existsSync(join(dir, "page.tsx")), `${href} has no page.tsx`).toBe(true);
    },
  );

  it("has no duplicate hrefs", () => {
    const hrefs = siteConfig.nav.main.map((item) => item.href);

    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});

describe("sitemap", () => {
  it("includes every navigable page", () => {
    const missing = siteConfig.nav.main
      .map((item) => (item.href === "/" ? "" : item.href))
      // Detail routes are added dynamically from the database, so only the
      // static list is compared here.
      .filter((path) => !sitemapPaths.includes(path));

    expect(missing).toEqual([]);
  });

  it("lists no static path that is not in the navigation", () => {
    // siteConfig is `as const`, so mapping over it narrows to a literal
    // union that `.includes()` will not accept an arbitrary string against.
    const navPaths: string[] = siteConfig.nav.main.map((item) =>
      item.href === "/" ? "" : item.href,
    );
    const orphans = sitemapPaths.filter(
      (path) => !navPaths.includes(path) && !path.includes("${"),
    );

    expect(orphans).toEqual([]);
  });

  it("excludes admin, login and the privacy policy", () => {
    for (const path of ["/admin", "/login", "/privacy-policy"]) {
      expect(sitemapPaths).not.toContain(path);
    }
  });
});

describe("navbar active-state matching", () => {
  /** Mirrors the isActive helper in components/Navbar.tsx. */
  const isActive = (href: string, pathname: string, locale: string) => {
    const target = `/${locale}${href === "/" ? "" : href}`;

    if (href === "/") return pathname === `/${locale}` || pathname === target;

    return pathname === target || pathname.startsWith(`${target}/`);
  };

  const hrefs = siteConfig.nav.main.map((item) => item.href);
  const activeFor = (pathname: string, locale = defaultLocale) =>
    hrefs.filter((href) => isActive(href, pathname, locale));

  it.each(locales)("marks home active on /%s only", (locale) => {
    expect(activeFor(`/${locale}`, locale)).toEqual(["/"]);
  });

  it("keeps a parent lit on its detail pages", () => {
    expect(activeFor("/th/projects/trinity-village")).toEqual(["/projects"]);
    expect(activeFor("/th/news/an-article")).toEqual(["/news"]);
    expect(activeFor("/th/events/open-house")).toEqual(["/events"]);
  });

  it("never marks home active on a sub-page", () => {
    // Every path starts with the locale prefix, so a naive prefix test
    // would light up Home everywhere.
    expect(isActive("/", "/th/projects", "th")).toBe(false);
    expect(isActive("/", "/th/about", "th")).toBe(false);
  });

  it("marks exactly one item per top-level page", () => {
    for (const href of hrefs) {
      const pathname = `/th${href === "/" ? "" : href}`;

      expect(activeFor(pathname), pathname).toHaveLength(1);
    }
  });

  it("does not match a path that merely shares a prefix", () => {
    expect(isActive("/projects", "/th/projects-archive", "th")).toBe(false);
  });

  it("marks nothing on pages outside the navigation", () => {
    for (const path of ["/th/privacy-policy", "/th/admin", "/th/login"]) {
      expect(activeFor(path), path).toEqual([]);
    }
  });
});

describe("site configuration", () => {
  it("uses an absolute https site URL with no trailing slash", () => {
    expect(siteConfig.url).toMatch(/^https:\/\//);
    expect(siteConfig.url.endsWith("/")).toBe(false);
  });

  it("declares the default locale among the supported locales", () => {
    expect(locales).toContain(siteConfig.defaultLocale);
  });

  it("has an og:image path that will resolve from the site root", () => {
    expect(siteConfig.seo.ogImage.startsWith("/")).toBe(true);
    expect(existsSync(join(process.cwd(), "public", siteConfig.seo.ogImage))).toBe(true);
  });
});
