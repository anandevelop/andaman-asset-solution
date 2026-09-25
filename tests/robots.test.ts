/**
 * tests/robots.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Who is allowed to index this deployment.
 *
 * This exists because the previous rule was wrong in the expensive
 * direction. app/robots.ts decided "is this production?" from
 * `VERCEL_ENV === "production"`, or `NODE_ENV === "production"` with no
 * VERCEL_ENV — which describes the canonical site and describes the staging
 * container exactly as well, since staging is the same Docker image with
 * NODE_ENV=production and no Vercel anywhere. Staging was serving
 * `Allow: /` and inviting Google to index a second copy of every page.
 *
 * Nothing in the type system or a review can catch that: the old condition
 * reads as obviously correct, and the only way to see it is to ask what the
 * staging container's environment actually looks like.
 *
 * So the three states that matter each get a case, and the one that matters
 * most is the third: a deployment that has said nothing must be blocked.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import robots from "@/app/robots";
import { isSiteIndexable, robotsMetadata } from "@/lib/indexing";

const ORIGINAL = process.env;

beforeEach(() => {
  process.env = { ...ORIGINAL };
});

afterEach(() => {
  process.env = ORIGINAL;
});

/** Every rule in the result, flattened — the shape differs between the
 *  blocked and allowed branches. */
function rulesOf(result: ReturnType<typeof robots>) {
  return Array.isArray(result.rules) ? result.rules : [result.rules];
}

describe("isSiteIndexable", () => {
  it("is true only for the exact string 'true'", () => {
    process.env.SITE_INDEXABLE = "true";
    expect(isSiteIndexable()).toBe(true);
  });

  it.each(["", "false", "1", "yes", "TRUE", " true "])(
    "is false for %j, so a typo blocks rather than exposes",
    (value) => {
      process.env.SITE_INDEXABLE = value;
      expect(isSiteIndexable()).toBe(false);
    },
  );

  it("is false when unset", () => {
    delete process.env.SITE_INDEXABLE;
    expect(isSiteIndexable()).toBe(false);
  });
});

describe("robots.txt — the canonical site", () => {
  beforeEach(() => {
    process.env.SITE_INDEXABLE = "true";
  });

  it("allows crawling", () => {
    const rules = rulesOf(robots());
    expect(rules.some((rule) => rule.allow === "/")).toBe(true);
  });

  it("still keeps crawlers out of the admin and the API", () => {
    const rules = rulesOf(robots());
    const disallowed = rules.flatMap((rule) =>
      Array.isArray(rule.disallow) ? rule.disallow : rule.disallow ? [rule.disallow] : [],
    );

    expect(disallowed).toContain("/admin");
    expect(disallowed).toContain("/login");
    expect(disallowed).toContain("/api/");
  });

  it("points at the sitemap", () => {
    expect(robots().sitemap).toMatch(/\/sitemap\.xml$/);
  });
});

describe("robots.txt — staging", () => {
  beforeEach(() => {
    // Exactly the staging container: a production build, no Vercel, and
    // nobody has declared it indexable. The old rule called this production.
    // Assigned wholesale rather than mutated because NODE_ENV is typed
    // read-only — the same reason tests/env.test.ts builds its environment
    // as an object.
    const { VERCEL_ENV: _v, SITE_INDEXABLE: _s, ...rest } = ORIGINAL;
    process.env = { ...rest, NODE_ENV: "production" } as NodeJS.ProcessEnv;
  });

  it("disallows everything", () => {
    const rules = rulesOf(robots());
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({ userAgent: "*", disallow: "/" });
  });

  it("allows nothing at all", () => {
    const rules = rulesOf(robots());
    expect(rules.some((rule) => rule.allow)).toBe(false);
  });

  it("advertises no sitemap, so there is nothing to crawl from", () => {
    expect(robots().sitemap).toBeUndefined();
  });

  it("is not rescued by NODE_ENV alone", () => {
    // The regression this file exists for: NODE_ENV=production was enough
    // before, and must never be enough again.
    expect(rulesOf(robots())[0]).toMatchObject({ disallow: "/" });
  });

  it("is not rescued by VERCEL_ENV either", () => {
    process.env.VERCEL_ENV = "production";
    expect(rulesOf(robots())[0]).toMatchObject({ disallow: "/" });
  });
});

describe("robots.txt — a deployment that said nothing", () => {
  it("is blocked, because the default has to be the safe one", () => {
    // Forgetting the variable on the real site costs pages missing from
    // Google until someone notices. Forgetting it on staging, under the old
    // rule, cost removal requests and a wait for recrawls. Only one of
    // those is recoverable by setting a variable.
    const { SITE_INDEXABLE: _s, NODE_ENV: _n, VERCEL_ENV: _v, ...rest } = ORIGINAL;
    process.env = rest as NodeJS.ProcessEnv;

    expect(rulesOf(robots())[0]).toMatchObject({ userAgent: "*", disallow: "/" });
  });
});

/*
  The meta tag, which is a separate hole from robots.txt.

  The root layout sets a site-wide default, but Next lets a page replace it
  outright — and six pages do, for their own reasons (a filtered listing, an
  article an editor marked noIndex, the legal pages that always want
  indexing). Every one of them was still saying `index: true` on staging,
  where robots.txt was meanwhile saying Disallow. Verified in a browser
  before this: /en/contact said noindex and /en/projects said index.
*/
describe("robotsMetadata — a page's own request, gated by the deployment", () => {
  it("honours the page on a site that may be indexed", () => {
    process.env.SITE_INDEXABLE = "true";
    expect(robotsMetadata({ index: true })).toEqual({ index: true, follow: true });
  });

  it("keeps a page's own noindex, and still lets its links be followed", () => {
    // A filtered listing or an article marked noIndex is excluded on its
    // own merits; there is no reason to stop crawling out of it.
    process.env.SITE_INDEXABLE = "true";
    expect(robotsMetadata({ index: false })).toEqual({ index: false, follow: true });
  });

  it("overrides a page that asks to be indexed on a deployment that may not be", () => {
    delete process.env.SITE_INDEXABLE;
    expect(robotsMetadata({ index: true })).toEqual({ index: false, follow: false });
  });

  it("drops follow as well off the canonical site, matching X-Robots-Tag", () => {
    delete process.env.SITE_INDEXABLE;
    expect(robotsMetadata({ index: true, follow: true })).toEqual({
      index: false,
      follow: false,
    });
  });
});
