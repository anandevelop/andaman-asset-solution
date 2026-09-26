/**
 * tests/seo/search-console.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The Search Console client, driven by fixtures.
 *
 * Nothing here touches the network or a credential. That is not only
 * convenience: this deployment's Search Console property has never been
 * crawled — it is the staging host, which disallows crawling — so the live
 * API returns zero rows and cannot exercise any of the behaviour that
 * matters. Pagination past 25,000 rows, the filter shape, and the fact
 * that a breakdown adds up to less than the total are all things that can
 * only be tested this way until a property with traffic is connected.
 *
 * The failures these guard against are silent by construction: a report
 * missing its tail, a filter that was never sent, a headline number that
 * quietly under-counts.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  earliestAvailable,
  HISTORY_MONTHS,
  latestSettled,
  PAGE_SIZE,
  querySearchAnalytics,
  queryWithTotals,
  type SearchDimension,
  type SearchRow,
} from "@/lib/seo/search-console";
import { resetTokenCache } from "@/lib/seo/google-client";

const ORIGINAL = process.env;

/*
  A key that signs, so getAccessToken gets past its own checks and the
  token exchange is the only thing left to stub.
*/
const { privateKey } = await import("node:crypto").then((crypto) =>
  crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  }),
);

/** Stands in for both the token endpoint and the API. */
function fakeFetch(pages: unknown[]): { impl: typeof fetch; bodies: Record<string, unknown>[] } {
  const bodies: Record<string, unknown>[] = [];
  let page = 0;

  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    const href = String(url);

    if (href.includes("oauth2.googleapis.com")) {
      return new Response(JSON.stringify({ access_token: "test-token", expires_in: 3600 }), {
        status: 200,
      });
    }

    bodies.push(JSON.parse(String(init?.body ?? "{}")));
    const body = pages[Math.min(page, pages.length - 1)];
    page += 1;

    return new Response(JSON.stringify(body), { status: 200 });
  }) as unknown as typeof fetch;

  return { impl, bodies };
}

function rows(count: number, clicks = 1): SearchRow[] {
  return Array.from({ length: count }, (_, index) => ({
    keys: [`query-${index}`],
    clicks,
    impressions: clicks * 10,
    ctr: 0.1,
    position: 5,
  }));
}

beforeEach(() => {
  process.env = {
    ...ORIGINAL,
    GOOGLE_SA_EMAIL: "svc@example.com",
    GOOGLE_SA_PRIVATE_KEY: privateKey.replace(/\n/g, "\\n"),
  };
  resetTokenCache();
  vi.stubGlobal("fetch", fakeFetch([{ rows: [] }]).impl);
});

afterEach(() => {
  process.env = ORIGINAL;
  vi.unstubAllGlobals();
});

const base = {
  siteUrl: "https://example.com/",
  startDate: "2026-08-01",
  endDate: "2026-08-31",
  dimensions: ["query"] as SearchDimension[],
};

describe("querySearchAnalytics", () => {
  it("sends the dates, dimensions and page size Google expects", async () => {
    const { impl, bodies } = fakeFetch([{ rows: rows(3) }]);
    vi.stubGlobal("fetch", impl);

    await querySearchAnalytics({ ...base, dimensions: ["query", "page"] }, impl);

    expect(bodies[0]).toMatchObject({
      startDate: "2026-08-01",
      endDate: "2026-08-31",
      dimensions: ["query", "page"],
      rowLimit: PAGE_SIZE,
      startRow: 0,
    });
  });

  it("follows pagination past the 25,000-row cap", async () => {
    /*
      The API caps a response and says nothing about there being more. A
      client that stops at one page loses the long tail — which is the
      part anybody reads this report to find.
    */
    const { impl, bodies } = fakeFetch([
      { rows: rows(PAGE_SIZE) },
      { rows: rows(PAGE_SIZE) },
      { rows: rows(120) },
    ]);
    vi.stubGlobal("fetch", impl);

    const result = await querySearchAnalytics(base, impl);

    expect(result.ok && result.rows).toHaveLength(PAGE_SIZE * 2 + 120);
    expect(bodies.map((body) => body.startRow)).toEqual([0, PAGE_SIZE, PAGE_SIZE * 2]);
  });

  it("stops at the first short page", async () => {
    // A short page is the only signal there is no next one.
    const { impl, bodies } = fakeFetch([{ rows: rows(10) }, { rows: rows(PAGE_SIZE) }]);
    vi.stubGlobal("fetch", impl);

    const result = await querySearchAnalytics(base, impl);

    expect(result.ok && result.rows).toHaveLength(10);
    expect(bodies).toHaveLength(1);
  });

  it("honours a row cap without asking for more than it needs", async () => {
    const { impl, bodies } = fakeFetch([{ rows: rows(100) }]);
    vi.stubGlobal("fetch", impl);

    const result = await querySearchAnalytics({ ...base, maxRows: 100 }, impl);

    expect(bodies[0].rowLimit).toBe(100);
    expect(result.ok && result.truncated).toBe(true);
  });

  it("sends filters as one AND group", async () => {
    const { impl, bodies } = fakeFetch([{ rows: [] }]);
    vi.stubGlobal("fetch", impl);

    await querySearchAnalytics(
      {
        ...base,
        filters: [
          { dimension: "country", expression: "tha" },
          { dimension: "page", operator: "contains", expression: "/projects/" },
        ],
      },
      impl,
    );

    expect(bodies[0].dimensionFilterGroups).toEqual([
      {
        groupType: "and",
        filters: [
          { dimension: "country", operator: "equals", expression: "tha" },
          { dimension: "page", operator: "contains", expression: "/projects/" },
        ],
      },
    ]);
  });

  it("omits the filter block entirely when there are none", async () => {
    // An empty group is not the same as no group: Google treats it as a
    // filter that matches nothing.
    const { impl, bodies } = fakeFetch([{ rows: [] }]);
    vi.stubGlobal("fetch", impl);

    await querySearchAnalytics({ ...base, filters: [] }, impl);

    expect(bodies[0]).not.toHaveProperty("dimensionFilterGroups");
  });

  it("passes dataState through for hourly data", async () => {
    // HOURLY_ALL is the only way to get the hour dimension at all.
    const { impl, bodies } = fakeFetch([{ rows: [] }]);
    vi.stubGlobal("fetch", impl);

    await querySearchAnalytics(
      { ...base, dimensions: ["hour"], dataState: "HOURLY_ALL" },
      impl,
    );

    expect(bodies[0]).toMatchObject({ dimensions: ["hour"], dataState: "HOURLY_ALL" });
  });

  it("returns Google's own words on a refusal", async () => {
    /*
      403 here is almost always "the property is not shared with this
      service account" or "that URL is outside the property" — two very
      different fixes, and only Google's message says which.
    */
    const impl = (async (url: string | URL | Request) => {
      if (String(url).includes("oauth2")) {
        return new Response(JSON.stringify({ access_token: "t", expires_in: 3600 }), { status: 200 });
      }
      return new Response(
        JSON.stringify({ error: { message: "User does not have sufficient permission for site" } }),
        { status: 403 },
      );
    }) as unknown as typeof fetch;

    const result = await querySearchAnalytics(base, impl);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("403");
    expect(result.ok === false && result.error).toContain("sufficient permission");
  });

  it("reports a missing credential rather than calling anything", async () => {
    delete process.env.GOOGLE_SA_EMAIL;
    resetTokenCache();

    const result = await querySearchAnalytics(base);
    expect(result).toEqual({ ok: false, error: "NOT_CONFIGURED" });
  });
});

describe("queryWithTotals", () => {
  it("reports the clicks Google counted but would not name", async () => {
    /*
      The behaviour every breakdown screen has to explain. Google drops
      queries searched by very few people, so the rows add up to less than
      the property total — and the difference is real traffic, not an
      error.
    */
    const impl = (async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).includes("oauth2")) {
        return new Response(JSON.stringify({ access_token: "t", expires_in: 3600 }), { status: 200 });
      }

      const body = JSON.parse(String(init?.body ?? "{}"));
      const totalsCall = (body.dimensions ?? []).length === 0;

      return new Response(
        JSON.stringify(
          totalsCall
            ? { rows: [{ keys: [], clicks: 500, impressions: 9000, ctr: 0.05, position: 8 }] }
            : { rows: rows(3, 100) },
        ),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const result = await queryWithTotals(base, impl);

    expect(result.ok && result.totals.clicks).toBe(500);
    expect(result.ok && result.rows).toHaveLength(3);
    expect(result.ok && result.withheldClicks).toBe(200);
  });

  it("never reports negative withholding", async () => {
    // The two calls can land either side of Google finishing its own
    // counting; a negative "withheld" on screen is worse than a zero.
    const impl = (async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).includes("oauth2")) {
        return new Response(JSON.stringify({ access_token: "t", expires_in: 3600 }), { status: 200 });
      }
      const body = JSON.parse(String(init?.body ?? "{}"));
      const totalsCall = (body.dimensions ?? []).length === 0;

      return new Response(
        JSON.stringify(
          totalsCall
            ? { rows: [{ keys: [], clicks: 10, impressions: 100, ctr: 0.1, position: 3 }] }
            : { rows: rows(3, 100) },
        ),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const result = await queryWithTotals(base, impl);
    expect(result.ok && result.withheldClicks).toBe(0);
  });
});

describe("the window Search Console can answer for", () => {
  it("reaches back exactly sixteen months", () => {
    // Asking for more is not an error — it silently returns what it has,
    // which makes a first run look complete and quietly sets the baseline
    // every later comparison is measured against.
    expect(HISTORY_MONTHS).toBe(16);
    expect(earliestAvailable(new Date("2026-09-26T00:00:00Z"))).toBe("2025-05-26");
  });

  it("treats the last three days as not yet settled", () => {
    expect(latestSettled(new Date("2026-09-26T00:00:00Z"))).toBe("2026-09-23");
  });
});
