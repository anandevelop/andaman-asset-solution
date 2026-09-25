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

describe("public pages prerender nothing at build", () => {
  /*
    The Docker build has no database, so a page prerendered at build time
    bakes its safeQuery fallback into the image: every deploy shipped the
    "database offline" homepage and kept it until `revalidate` expired.
    Nothing may prerender data-backed content at build — but that is not the
    same as having no generateStaticParams, and the difference is invisible
    in review. Measured on a built server:

      returns the locales or the slugs   prerendered at build → the stale
                                         fallback above
      deleted outright                   not registered for ISR: served
                                         `Cache-Control: no-store`, no
                                         x-nextjs-cache header, a database
                                         query per visitor, `revalidate`
                                         ignored
      returns []                         renders on the first request
                                         against the live database, then
                                         MISS → HIT with the page's own
                                         s-maxage

    So a cacheable page has to keep the function and it has to return [].

    Two kinds of file are the exception, in opposite directions:

      • A page that reads searchParams (or cookies()/headers()) must NOT
        have one. Registered for ISR it fails with DYNAMIC_SERVER_USAGE —
        /projects and /news returned 500 when a layout-level [] registered
        them. Left alone they stay dynamic.
      • The root layout must not have one either. Its params flow down to
        every page beneath it: a list prerenders all of them, and [] does to
        the searchParams pages what is described above.

    privacy-policy and terms read no data, so prerendering them is the
    point, and they are exempt.

    The checks read source, as the neighbouring blocks do: nothing else sees
    this, because every one of these states builds and renders green
    against a database that is reachable.
  */
  const LOCALE_DIR = join(process.cwd(), "app", "[locale]");
  const STATIC_PAGES = ["privacy-policy", "terms"];

  /** Source with comments removed, so prose that mentions
   *  generateStaticParams or searchParams is not read as code.
   *
   *  Line comments go first. A glob such as `public/gallery/**` inside one
   *  contains `/*`, which the block-comment pass would take as an opening
   *  and follow to the next `*` + `/` — swallowing real code on the way.
   *  achievements/page.tsx does exactly that, and the first version of this
   *  helper reported its function as missing. */
  const code = (source: string) =>
    source.replace(/(^|\s)\/\/.*$/gm, "$1").replace(/\/\*[\s\S]*?\*\//g, "");

  const definesStaticParams = (source: string) =>
    /\bgenerateStaticParams\b/.test(code(source));

  /** The body of `generateStaticParams`, whitespace collapsed — or null when
   *  it is not a plain function declaration. Braces are counted rather than
   *  matched non-greedily, so `({ locale })` inside a body cannot end it
   *  early. */
  const staticParamsBody = (source: string): string | null => {
    const text = code(source);
    const head = text.match(
      /export\s+(?:async\s+)?function\s+generateStaticParams\s*\([^)]*\)[^{]*\{/,
    );

    if (!head || head.index === undefined) return null;

    const bodyStart = head.index + head[0].length;
    let depth = 1;
    let end = bodyStart;

    for (; end < text.length && depth > 0; end++) {
      if (text[end] === "{") depth++;
      else if (text[end] === "}") depth--;
    }

    return text.slice(bodyStart, end - 1).replace(/\s+/g, " ").trim();
  };

  const readsRequestData = (source: string) =>
    /\bsearchParams\b|\bcookies\(\)|\bheaders\(\)/.test(code(source));

  const EMPTY_LIST = /^return \[\];?$/;

  const relative = (path: string) => path.replace(`${process.cwd()}/`, "");
  const isStaticPage = (path: string) =>
    STATIC_PAGES.some((dir) => path.includes(`/${dir}/`));

  const sourceFiles: string[] = [];

  const collect = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);

      if (entry.isDirectory()) collect(path);
      else if (/\.tsx?$/.test(entry.name)) sourceFiles.push(path);
    }
  };

  collect(LOCALE_DIR);

  const pages = sourceFiles.filter(
    (path) => path.startsWith(SITE_DIR) && path.endsWith("/page.tsx") && !isStaticPage(path),
  );
  const read = (path: string) => readFileSync(path, "utf8");
  const cacheablePages = pages.filter((path) => !readsRequestData(read(path)));
  const requestDataPages = pages.filter((path) => readsRequestData(read(path)));

  it("finds the pages it is guarding", () => {
    // Guards the guard: an empty list would pass every assertion below
    // while checking nothing. Ten public pages are cacheable today
    // (home, about, achievements, contact, progress, and the events and
    // e-brochure lists plus the four [slug] pages), and /projects and
    // /news are the two that read searchParams.
    expect(cacheablePages.length).toBeGreaterThanOrEqual(10);
    expect(requestDataPages.length).toBeGreaterThanOrEqual(2);

    // A typo in the exemption list would exempt nothing and quietly start
    // demanding a function of pages that should keep prerendering.
    for (const dir of STATIC_PAGES) {
      expect(existsSync(join(SITE_DIR, dir, "page.tsx")), dir).toBe(true);
    }
  });

  it.each(
    sourceFiles
      .filter((path) => !isStaticPage(path) && definesStaticParams(read(path)))
      .map((path) => [relative(path)]),
  )("%s returns [] from generateStaticParams, so nothing prerenders at build", (path) => {
    expect(staticParamsBody(read(join(process.cwd(), path))) ?? "(not a plain function)").toMatch(
      EMPTY_LIST,
    );
  });

  it.each(cacheablePages.map((path) => [relative(path)]))(
    "%s keeps generateStaticParams — deleting it turns ISR off",
    (path) => {
      const source = read(join(process.cwd(), path));

      expect(definesStaticParams(source)).toBe(true);
      expect(staticParamsBody(source)).toMatch(EMPTY_LIST);
    },
  );

  it.each(requestDataPages.map((path) => [relative(path)]))(
    "%s reads request data, so it must not define generateStaticParams",
    (path) => {
      expect(definesStaticParams(read(join(process.cwd(), path)))).toBe(false);
    },
  );

  it("keeps generateStaticParams out of the root layout", () => {
    expect(definesStaticParams(read(join(LOCALE_DIR, "layout.tsx")))).toBe(false);
  });

  describe("the checks themselves", () => {
    // What the checks are asked to tell apart, on inline sources — so a
    // regression in a regex is caught here rather than by a real page
    // happening to keep passing.
    it("reads an empty list as prerendering nothing", () => {
      const source = `export function generateStaticParams() {\n  return [];\n}`;

      expect(staticParamsBody(source)).toMatch(EMPTY_LIST);
    });

    it("rejects the locale list and the slug list", () => {
      const locales = `export async function generateStaticParams() {\n  return locales.map((locale) => ({ locale }));\n}`;
      const slugs = `export async function generateStaticParams() {\n  const slugs = await getPublishedProjectSlugs();\n  return slugs.map((slug) => ({ slug }));\n}`;

      // The nested `{ locale }` must not end the body early and leave a
      // fragment that happens to look harmless.
      expect(staticParamsBody(locales)).toBe("return locales.map((locale) => ({ locale }));");
      expect(staticParamsBody(locales)).not.toMatch(EMPTY_LIST);
      expect(staticParamsBody(slugs)).not.toMatch(EMPTY_LIST);
    });

    it("sees a deleted function as not defined", () => {
      expect(definesStaticParams(`export const revalidate = 3600;`)).toBe(false);
      expect(staticParamsBody(`export const revalidate = 3600;`)).toBeNull();
    });

    it("does not mistake a comment for a definition", () => {
      const source = [
        "/* generateStaticParams() used to live here */",
        "// return [] from generateStaticParams",
        "export const revalidate = 3600;",
      ].join("\n");

      expect(definesStaticParams(source)).toBe(false);
    });

    it("is not fooled by a glob inside a line comment", () => {
      // The shape that broke the first version: `/*` inside a `//` comment
      // must not open a block comment that eats the function below it.
      const source = [
        "// Real development photography (public/gallery/**), not stock imagery",
        "export const revalidate = 3600;",
        "export function generateStaticParams() {",
        "  return [];",
        "}",
        "/* a genuine block comment */",
      ].join("\n");

      expect(definesStaticParams(source)).toBe(true);
      expect(staticParamsBody(source)).toMatch(EMPTY_LIST);
    });

    it("flags a definition that is not a plain function", () => {
      const source = `export const generateStaticParams = () => [];`;

      expect(definesStaticParams(source)).toBe(true);
      expect(staticParamsBody(source)).toBeNull();
    });

    it("spots a page that reads request data, and ignores prose about it", () => {
      expect(readsRequestData(`const sp = await props.searchParams;`)).toBe(true);
      expect(readsRequestData(`const jar = await cookies();`)).toBe(true);
      expect(readsRequestData(`const h = await headers();`)).toBe(true);
      expect(readsRequestData(`/* reads searchParams */\nexport const revalidate = 1;`)).toBe(false);
    });
  });
});
