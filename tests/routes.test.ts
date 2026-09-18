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

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { siteConfig } from "@/config/site";
import { locales, defaultLocale } from "@/i18n";

const SITE_DIR = join(process.cwd(), "app", "[locale]", "(site)");
const sitemapSource = readFileSync(join(process.cwd(), "app", "sitemap.ts"), "utf8");

/** Static paths passed to localized() in app/sitemap.ts. */
const sitemapPaths = [...sitemapSource.matchAll(/localized\("([^"]*)"/g)].map(
  (m) => m[1],
);

/**
 * Every navigable page, header or footer.
 *
 * siteConfig is `as const`, so mapping over it narrows to a literal union
 * that `.includes()` will not accept an arbitrary string against — hence
 * the explicit string[].
 */
const navItems = [...siteConfig.nav.main, ...siteConfig.nav.secondary];
const navPaths: string[] = navItems.map((item) => (item.href === "/" ? "" : item.href));

describe("navigation", () => {
  it.each(navItems.map((item) => [item.key, item.href]))(
    "nav item %s → %s has a page",
    (_key, href) => {
      const dir = href === "/" ? SITE_DIR : join(SITE_DIR, href);

      expect(existsSync(join(dir, "page.tsx")), `${href} has no page.tsx`).toBe(true);
    },
  );

  it("has no duplicate hrefs", () => {
    const hrefs = navItems.map((item) => item.href);

    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("keeps main and secondary disjoint", () => {
    // A page in both lists would render twice in the footer.
    const main = siteConfig.nav.main.map((item) => item.href) as string[];
    const secondary = siteConfig.nav.secondary.map((item) => item.href);

    expect(secondary.filter((href) => main.includes(href))).toEqual([]);
  });
});

describe("sitemap", () => {
  it("includes every navigable page", () => {
    // Detail routes are added dynamically from the database, so only the
    // static list is compared here.
    const missing = navPaths.filter((path) => !sitemapPaths.includes(path));

    expect(missing).toEqual([]);
  });

  it("lists no static path that is not in the navigation", () => {
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

/**
 * The other direction: a page that exists but is in no list at all.
 *
 * The checks above run nav → page and sitemap → nav. Neither can see a page
 * that is in neither, and /achievements was exactly that — fully built in
 * four locales, setting its own canonical and hreflang, reachable only from
 * a single button inside /about, and invisible to search engines. This is
 * the mirror image of the /progress bug the file was written for.
 */
describe("every static page reaches the sitemap", () => {
  /**
   * Walk app/[locale]/(site)/ and return the URL path of each static page.
   *
   * Two folder shapes are special:
   *   [slug]  a dynamic segment — its URLs come from the database branch of
   *           sitemap(), so there is nothing to enumerate here.
   *   (group) a route group — it contributes no path segment, so recurse
   *           without extending the prefix.
   */
  function staticSiteRoutes(dir: string = SITE_DIR, prefix = ""): string[] {
    const found = existsSync(join(dir, "page.tsx")) ? [prefix] : [];

    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith("[")) continue;

      const nested = entry.name.startsWith("(")
        ? staticSiteRoutes(join(dir, entry.name), prefix)
        : staticSiteRoutes(join(dir, entry.name), `${prefix}/${entry.name}`);

      found.push(...nested);
    }

    return found;
  }

  /*
    Deliberately unindexed, per the header of app/sitemap.ts: policy and
    legal pages have no business consuming crawl budget. Listed with the
    reason so that the next person to hit a failure here has to decide
    between "index it" and "it is policy", rather than silently appending a
    name to make the suite green.
  */
  const UNINDEXED = ["/privacy-policy", "/terms"];

  it("finds the pages it is supposed to be checking", () => {
    // A walker that returns nothing would make the assertion below pass
    // vacuously — the one failure mode this whole describe cannot afford.
    expect(staticSiteRoutes().length).toBeGreaterThan(5);
    expect(staticSiteRoutes()).toContain("/achievements");
  });

  it("leaves no page out of both the navigation and the sitemap", () => {
    const missing = staticSiteRoutes().filter(
      (path) => !UNINDEXED.includes(path) && !sitemapPaths.includes(path),
    );

    expect(missing).toEqual([]);
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

  /*
    Same check for the brand assets, which are now the fallback behind
    admin-editable settings rather than literals in the layout. A missing
    file here is the failure mode that made this describe block worth
    having: it 404s silently, and the only symptom is a browser tab with a
    blank page icon that nobody thinks to report.
  */
  it.each(Object.entries(siteConfig.branding))(
    "branding.%s exists in public/",
    (_name, path) => {
      expect(path.startsWith("/")).toBe(true);
      expect(existsSync(join(process.cwd(), "public", path))).toBe(true);
    },
  );
});

/**
 * Photography on rendered paths is this company's own.
 *
 * The homepage hero fallback, the /about story image and every unmatched
 * facility card used to be Unsplash URLs. The /about one rendered
 * unconditionally, so every visitor was shown a stranger's building as this
 * developer's work.
 *
 * prisma/ is deliberately out of scope. Seeded rows carrying old URLs are a
 * data question — `npm run media:legacy -- --host images.unsplash.com` —
 * not a code one, and the same is true of the remotePatterns and CSP
 * entries that keep those rows loading. See the uploads note in AGENTS.md.
 */
describe("photography", () => {
  const SOURCE_DIRS = ["app", "components", "config"];

  function sourceFiles(dir: string, found: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);

      if (entry.isDirectory()) sourceFiles(path, found);
      else if (/\.tsx?$/.test(entry.name)) found.push(path);
    }

    return found;
  }

  const files = SOURCE_DIRS.flatMap((dir) => sourceFiles(join(process.cwd(), dir)));
  const read = (file: string) => readFileSync(file, "utf8");

  it("references no stock-photography host from a rendered path", () => {
    const offenders = files.filter((file) => /images\.unsplash\.com/.test(read(file)));

    expect(offenders.map((f) => f.replace(`${process.cwd()}/`, ""))).toEqual([]);
  });

  /*
    The other half, and the reason this is not just a grep: a local path is
    a silent 404. A remote URL that 404s is at least visible in the network
    tab of whoever typed it; "/gallery/residence-prime/pool-terace.webp"
    renders as a blank card and nothing else in the suite would notice.
  */
  const LOCAL_ASSET = /"(\/[A-Za-z0-9_\-/. ]+\.(?:webp|jpg|jpeg|png|svg|avif|ico))"/g;

  const referenced = [
    ...new Set(files.flatMap((file) => [...read(file).matchAll(LOCAL_ASSET)].map((m) => m[1]))),
  ];

  it("finds the asset references it is supposed to be checking", () => {
    expect(referenced.length).toBeGreaterThan(10);
  });

  it.each(referenced)("%s exists in public/", (path) => {
    expect(existsSync(join(process.cwd(), "public", path))).toBe(true);
  });
});

/**
 * Exactly one <h1> on the home page.
 *
 * The home page composes its heading from several files, so no single
 * component can assert this about itself. It regressed twice already:
 * first the only <h1> lived in HeroCarousel's static fallback, which
 * renders on a fresh database but not once an admin configures hero
 * slides (the Carousel path sets its headline as a <p>) — so production
 * shipped with no <h1> at all. Then CompanyIntro added one, which would
 * have made two the moment anyone restored the old markup.
 *
 * Counted from source rather than a render because the pieces are async
 * Server Components reading the database.
 */
describe("home page headings", () => {
  const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), "utf8");

  /*
    Block comments are stripped first — /** … *\/ headers and {/* … *\/}
    JSX notes in these very files discuss <h1> in prose, and counting those
    made this test read 4 in a file with one real heading.
  */
  const countH1 = (source: string) =>
    (source.replace(/\/\*[\s\S]*?\*\//g, "").match(/<h1[\s>]/g) ?? []).length;

  it("puts the sole <h1> in CompanyIntro", () => {
    expect(countH1(read("components", "CompanyIntro.tsx"))).toBe(1);
  });

  it("keeps every other home-page component free of <h1>", () => {
    const others = [
      ["app", "[locale]", "(site)", "page.tsx"],
      ["components", "HeroCarousel.tsx"],
      ["components", "VisionMission.tsx"],
      ["components", "Corporate.tsx"],
      ["components", "AwardsSection.tsx"],
      ["components", "FeaturedProjectCard.tsx"],
      ["components", "FaqAccordion.tsx"],
    ];

    for (const parts of others) {
      expect(countH1(read(...parts)), parts.join("/")).toBe(0);
    }
  });
});

describe("static rendering: setRequestLocale", () => {
  /*
    Every public layout and page that touches next-intl has to call
    setRequestLocale before it does.

    This is not style. next-intl resolves the locale from the request
    headers when setRequestLocale has not run, and reading headers is a
    dynamic API — which a route carrying `export const revalidate` is not
    allowed to do. The render dies with DYNAMIC_SERVER_USAGE.

    It shipped that way and stayed invisible, because the failure only
    reaches a visitor on a page that has to be generated on demand. The
    Docker build has no database, so generateStaticParams() returns nothing
    for /projects/[slug], /news/[slug] and /events/[slug] — every one of
    those 500'd in production while `npm run dev`, `next build` and every
    prerendered page stayed green.

    Admin routes are excluded: they are authenticated and never statically
    rendered, so the constraint does not apply to them.
  */
  const routeFiles: string[] = [];

  const collect = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);

      if (entry.isDirectory()) collect(path);
      else if (entry.name === "page.tsx" || entry.name === "layout.tsx") {
        routeFiles.push(path);
      }
    }
  };

  collect(SITE_DIR);
  routeFiles.push(join(process.cwd(), "app", "[locale]", "layout.tsx"));

  const usesIntl = routeFiles
    .map((path) => [path, readFileSync(path, "utf8")] as const)
    .filter(([, source]) => source.includes("next-intl"));

  it("covers every public route file that uses next-intl", () => {
    // A guard on the guard: if the walk stops finding files, the assertion
    // below passes vacuously and stops protecting anything.
    expect(usesIntl.length).toBeGreaterThan(10);
  });

  it.each(usesIntl.map(([path]) => [path.replace(`${process.cwd()}/`, "")]))(
    "%s calls setRequestLocale",
    (relative) => {
      const [, source] = usesIntl.find(([path]) =>
        path.endsWith(relative),
      )!;

      expect(source).toContain("setRequestLocale(");
    },
  );
});

describe("no Suspense boundary above a notFound()", () => {
  /*
    A loading.tsx anywhere above a page that calls notFound() turns that
    page into a soft 404.

    loading.tsx is a Suspense boundary, and Next streams the shell the
    moment one exists — the `200 OK` is already on the wire before the page
    body runs, so notFound() can render the right page but can no longer
    set the status. Google treats the 200 as real content and indexes the
    not-found page.

    app/[locale]/loading.tsx did exactly this to all four public detail
    routes. It now lives at app/[locale]/admin/loading.tsx, where the pages
    are noindex and no crawler is affected.

    Checked by walking up from each page rather than by banning loading.tsx
    outright, so a skeleton can still be added anywhere that has no
    notFound() beneath it.
  */
  const APP_DIR = join(process.cwd(), "app");
  const pagesWithNotFound: string[] = [];

  const collect = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);

      if (entry.isDirectory()) collect(path);
      else if (
        entry.name === "page.tsx" &&
        readFileSync(path, "utf8").includes("notFound()")
      ) {
        pagesWithNotFound.push(path);
      }
    }
  };

  collect(SITE_DIR);

  it("finds the public pages that call notFound()", () => {
    // Guards the guard: an empty list would pass every assertion below
    // while checking nothing. /projects, /news, /events and /e-brochure
    // each have a [slug] page that 404s on an unknown slug.
    expect(pagesWithNotFound.length).toBeGreaterThanOrEqual(4);
  });

  it.each(pagesWithNotFound.map((path) => [path.replace(`${process.cwd()}/`, "")]))(
    "%s has no loading.tsx above it",
    (relative) => {
      const offenders: string[] = [];

      for (
        let dir = dirname(join(process.cwd(), relative));
        dir.startsWith(APP_DIR);
        dir = dirname(dir)
      ) {
        if (existsSync(join(dir, "loading.tsx"))) {
          offenders.push(join(dir, "loading.tsx").replace(`${process.cwd()}/`, ""));
        }
      }

      expect(offenders).toEqual([]);
    },
  );
});
