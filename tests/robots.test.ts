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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* robots.txt reads the request's Host: only the canonical host is crawlable
   (staging and production share one container). */
let requestHost: string | null = "andamanassetsolution.com";
vi.mock("next/headers", () => ({
  headers: async () => new Headers(requestHost ? { host: requestHost } : {}),
}));

import robotsFile from "@/app/robots";
import { isCanonicalHost, isSiteIndexable, robotsMetadata } from "@/lib/indexing";

const robots = robotsFile as unknown as () => Promise<Awaited<ReturnType<typeof robotsFile>>>;

const ORIGINAL = process.env;

beforeEach(() => {
  process.env = { ...ORIGINAL, NEXT_PUBLIC_SITE_URL: "https://andamanassetsolution.com" };
  requestHost = "andamanassetsolution.com";
});

afterEach(() => {
  process.env = ORIGINAL;
});

/** Every rule in the result, flattened — the shape differs between the
 *  blocked and allowed branches. */
function rulesOf(result: Awaited<ReturnType<typeof robots>>) {
  return Array.isArray(result.rules) ? result.rules : [result.rules];
}

describe("isSiteIndexable", () => {
  it("is true only for the exact string 'true'", async () => {
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

  it("is false when unset", async () => {
    delete process.env.SITE_INDEXABLE;
    expect(isSiteIndexable()).toBe(false);
  });
});

describe("robots.txt — the canonical site", () => {
  beforeEach(() => {
    process.env.SITE_INDEXABLE = "true";
  });

  it("allows crawling", async () => {
    const rules = rulesOf(await robots());
    expect(rules.some((rule) => rule.allow === "/")).toBe(true);
  });

  it("still keeps crawlers out of the admin and the API", async () => {
    const rules = rulesOf(await robots());
    const disallowed = rules.flatMap((rule) =>
      Array.isArray(rule.disallow) ? rule.disallow : rule.disallow ? [rule.disallow] : [],
    );

    expect(disallowed).toContain("/admin");
    expect(disallowed).toContain("/login");
    expect(disallowed).toContain("/api/");
  });

  it("points at the sitemap", async () => {
    expect((await robots()).sitemap).toMatch(/\/sitemap\.xml$/);
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
    process.env = { ...rest, NODE_ENV: "production", NEXT_PUBLIC_SITE_URL: "https://andamanassetsolution.com" } as NodeJS.ProcessEnv;
  });

  it("disallows everything", async () => {
    const rules = rulesOf(await robots());
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({ userAgent: "*", disallow: "/" });
  });

  it("allows nothing at all", async () => {
    const rules = rulesOf(await robots());
    expect(rules.some((rule) => rule.allow)).toBe(false);
  });

  it("advertises no sitemap, so there is nothing to crawl from", async () => {
    expect((await robots()).sitemap).toBeUndefined();
  });

  it("is not rescued by NODE_ENV alone", async () => {
    // The regression this file exists for: NODE_ENV=production was enough
    // before, and must never be enough again.
    expect(rulesOf(await robots())[0]).toMatchObject({ disallow: "/" });
  });

  it("is not rescued by VERCEL_ENV either", async () => {
    process.env.VERCEL_ENV = "production";
    expect(rulesOf(await robots())[0]).toMatchObject({ disallow: "/" });
  });
});

describe("robots.txt — the staging host on the production container", () => {
  beforeEach(() => {
    process.env.SITE_INDEXABLE = "true";
  });

  it("disallows everything at the sslip.io address", async () => {
    requestHost = "168-144-240-9.sslip.io";
    expect(rulesOf(await robots())[0]).toMatchObject({ userAgent: "*", disallow: "/" });
  });

  it("disallows everything with no Host at all", async () => {
    requestHost = null;
    expect(rulesOf(await robots())[0]).toMatchObject({ disallow: "/" });
  });

  it("allows the canonical host, with or without a port", async () => {
    requestHost = "andamanassetsolution.com:443";
    expect(rulesOf(await robots()).some((rule) => rule.allow === "/")).toBe(true);
  });
});

describe("isCanonicalHost", () => {
  it.each([
    ["andamanassetsolution.com", true],
    ["AndamanAssetSolution.com", true],
    ["168-144-240-9.sslip.io", false],
    ["www.andamanassetsolution.com", false],
    ["andamanassetsolution.com.evil.example", false],
    ["", false],
  ])("%j → %s", (host, expected) => {
    expect(isCanonicalHost(host)).toBe(expected);
  });
});

describe("robots.txt — a deployment that said nothing", () => {
  it("is blocked, because the default has to be the safe one", async () => {
    // Forgetting the variable on the real site costs pages missing from
    // Google until someone notices. Forgetting it on staging, under the old
    // rule, cost removal requests and a wait for recrawls. Only one of
    // those is recoverable by setting a variable.
    const { SITE_INDEXABLE: _s, NODE_ENV: _n, VERCEL_ENV: _v, ...rest } = ORIGINAL;
    process.env = { ...rest, NEXT_PUBLIC_SITE_URL: "https://andamanassetsolution.com" } as unknown as NodeJS.ProcessEnv;

    expect(rulesOf(await robots())[0]).toMatchObject({ userAgent: "*", disallow: "/" });
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
  it("honours the page on a site that may be indexed", async () => {
    process.env.SITE_INDEXABLE = "true";
    expect(robotsMetadata({ index: true })).toEqual({ index: true, follow: true });
  });

  it("keeps a page's own noindex, and still lets its links be followed", async () => {
    // A filtered listing or an article marked noIndex is excluded on its
    // own merits; there is no reason to stop crawling out of it.
    process.env.SITE_INDEXABLE = "true";
    expect(robotsMetadata({ index: false })).toEqual({ index: false, follow: true });
  });

  it("overrides a page that asks to be indexed on a deployment that may not be", async () => {
    delete process.env.SITE_INDEXABLE;
    expect(robotsMetadata({ index: true })).toEqual({ index: false, follow: false });
  });

  it("drops follow as well off the canonical site, matching X-Robots-Tag", async () => {
    delete process.env.SITE_INDEXABLE;
    expect(robotsMetadata({ index: true, follow: true })).toEqual({
      index: false,
      follow: false,
    });
  });
});
