/**
 * tests/seo/url-inspection.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The rotation and the quota, which are the whole of this feature.
 *
 * URL Inspection allows 2,000 calls a day per property. The site has 80
 * audited URLs, so nothing here is load-bearing today — and that is
 * exactly why it is worth testing now. A site that grows past the cap
 * without a rotation does not fail loudly: the sweep runs out partway
 * through, the same head of the list is checked every night, and the tail
 * is never looked at again. Nobody notices, because the screen fills with
 * data either way.
 *
 * Fixture-driven. The live property for this deployment has never been
 * crawled, so it answers "URL is unknown to Google" for everything and
 * cannot exercise a single branch below.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";
import {
  DAILY_QUOTA,
  inspectUrl,
  inspectionUrlFor,
  QUOTA_RESERVE,
  selectForInspection,
  sweepInspections,
} from "@/lib/seo/url-inspection";
import { resetTokenCache } from "@/lib/seo/google-client";

const ORIGINAL = process.env;

const { privateKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

beforeEach(() => {
  process.env = {
    ...ORIGINAL,
    GOOGLE_SA_EMAIL: "svc@example.com",
    GOOGLE_SA_PRIVATE_KEY: privateKey.replace(/\n/g, "\\n"),
  };
  resetTokenCache();
});

afterEach(() => {
  process.env = ORIGINAL;
  vi.unstubAllGlobals();
});

/**
 * Answers the token endpoint, then whatever the test wants.
 *
 * Installed globally as well as returned: getAccessToken reaches for the
 * global fetch rather than the injected one — it has no API surface of its
 * own to inject through — so a test that only passes the stub down still
 * sends a real request to Google's token endpoint and fails on the
 * network.
 */
function responder(handler: (body: Record<string, unknown>) => Response): typeof fetch {
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url).includes("oauth2.googleapis.com")) {
      return new Response(JSON.stringify({ access_token: "t", expires_in: 3600 }), { status: 200 });
    }
    return handler(JSON.parse(String(init?.body ?? "{}")));
  }) as unknown as typeof fetch;

  vi.stubGlobal("fetch", impl);
  return impl;
}

const indexed = (url: string) =>
  new Response(
    JSON.stringify({
      inspectionResult: {
        indexStatusResult: {
          verdict: "PASS",
          coverageState: "Submitted and indexed",
          googleCanonical: url,
          lastCrawlTime: "2026-09-20T04:00:00Z",
          robotsTxtState: "ALLOWED",
          indexingState: "INDEXING_ALLOWED",
        },
      },
    }),
    { status: 200 },
  );

describe("selectForInspection", () => {
  const at = (iso: string | null) => (iso ? new Date(iso) : null);

  it("puts never-inspected URLs first", () => {
    // A page Google has never been asked about is the one most likely to
    // be missing.
    const picked = selectForInspection([
      { url: "/a", inspectedAt: at("2026-09-25T00:00:00Z") },
      { url: "/b", inspectedAt: null },
      { url: "/c", inspectedAt: at("2026-09-01T00:00:00Z") },
    ]);

    expect(picked.map((p) => p.url)).toEqual(["/b", "/c", "/a"]);
  });

  it("rotates oldest first, so everything is reached eventually", () => {
    const picked = selectForInspection(
      [
        { url: "/newest", inspectedAt: at("2026-09-26T00:00:00Z") },
        { url: "/oldest", inspectedAt: at("2026-01-01T00:00:00Z") },
        { url: "/middle", inspectedAt: at("2026-06-01T00:00:00Z") },
      ],
      2,
    );

    expect(picked.map((p) => p.url)).toEqual(["/oldest", "/middle"]);
  });

  it("keeps input order for ties, so a stable list stays stable", () => {
    const same = at("2026-09-01T00:00:00Z");
    const picked = selectForInspection([
      { url: "/a", inspectedAt: same },
      { url: "/b", inspectedAt: same },
      { url: "/c", inspectedAt: same },
    ]);

    expect(picked.map((p) => p.url)).toEqual(["/a", "/b", "/c"]);
  });

  it("never spends the whole quota", () => {
    /*
      The reserve is what leaves a person clicking "Test live URL" in
      Search Console able to do so. Spending it nightly turns their click
      into a quota error they cannot explain.
    */
    const many = Array.from({ length: 5_000 }, (_, i) => ({ url: `/p${i}`, inspectedAt: null }));

    expect(selectForInspection(many)).toHaveLength(DAILY_QUOTA - QUOTA_RESERVE);
    expect(QUOTA_RESERVE).toBeGreaterThan(0);
  });

  it("does not mutate what it was given", () => {
    const input = [
      { url: "/a", inspectedAt: at("2026-09-26T00:00:00Z") },
      { url: "/b", inspectedAt: null },
    ];
    selectForInspection(input);
    expect(input.map((p) => p.url)).toEqual(["/a", "/b"]);
  });

  it("selects nothing when there is no budget", () => {
    expect(selectForInspection([{ url: "/a", inspectedAt: null }], 0)).toEqual([]);
  });
});

describe("inspectionUrlFor", () => {
  it("joins without doubling the slash", () => {
    // Google treats "https://host//th" as a different URL and reports it
    // as unknown.
    expect(inspectionUrlFor("https://host/", "/th/about")).toBe("https://host/th/about");
    expect(inspectionUrlFor("https://host", "/th/about")).toBe("https://host/th/about");
    expect(inspectionUrlFor("https://host/", "th/about")).toBe("https://host/th/about");
  });
});

describe("inspectUrl", () => {
  it("asks about the URL within the property", async () => {
    let sent: Record<string, unknown> = {};
    const impl = responder((body) => {
      sent = body;
      return indexed("https://host/th");
    });

    await inspectUrl("https://host/", "https://host/th", impl);

    // Both halves matter: a URL outside siteUrl is answered 403, which is
    // indistinguishable from a permissions problem.
    expect(sent).toEqual({ inspectionUrl: "https://host/th", siteUrl: "https://host/" });
  });

  it("reads the fields the indexing screen needs", async () => {
    const outcome = await inspectUrl(
      "https://host/",
      "https://host/th",
      responder(() => indexed("https://host/th")),
    );

    expect(outcome.ok && outcome.result).toMatchObject({
      verdict: "PASS",
      coverageState: "Submitted and indexed",
      googleCanonical: "https://host/th",
      robotsTxtState: "ALLOWED",
    });
    expect(outcome.ok && outcome.result.lastCrawledAt?.toISOString()).toBe(
      "2026-09-20T04:00:00.000Z",
    );
  });

  it("survives a response with an empty result", async () => {
    // What the live property returns today for a URL Google has never
    // seen: a 200 with almost nothing in it.
    const outcome = await inspectUrl(
      "https://host/",
      "https://host/th",
      responder(() => new Response(JSON.stringify({ inspectionResult: {} }), { status: 200 })),
    );

    expect(outcome.ok && outcome.result.verdict).toBe("VERDICT_UNSPECIFIED");
    expect(outcome.ok && outcome.result.lastCrawledAt).toBeNull();
  });

  it("marks a quota refusal as its own kind of failure", async () => {
    const outcome = await inspectUrl(
      "https://host/",
      "https://host/th",
      responder(() =>
        new Response(
          JSON.stringify({ error: { status: "RESOURCE_EXHAUSTED", message: "Quota exceeded" } }),
          { status: 429 },
        ),
      ),
    );

    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.quotaExhausted).toBe(true);
  });

  it("does not mistake a permissions refusal for a quota one", async () => {
    // 403 means the property is wrong; retrying tomorrow will not help,
    // and stopping the sweep over it would hide every other URL's result.
    const outcome = await inspectUrl(
      "https://host/",
      "https://other.example/",
      responder(() =>
        new Response(
          JSON.stringify({ error: { message: "You do not own this site" } }),
          { status: 403 },
        ),
      ),
    );

    expect(outcome.ok === false && outcome.quotaExhausted).toBe(false);
    expect(outcome.ok === false && outcome.error).toContain("do not own");
  });
});

describe("sweepInspections", () => {
  it("stops the moment quota runs out", async () => {
    /*
      Without this the run turns into hundreds of pointless refused
      requests, and the log fills with identical errors that bury whatever
      else went wrong that night.
    */
    let calls = 0;
    const impl = responder(() => {
      calls += 1;
      return calls <= 2
        ? indexed("https://host/x")
        : new Response(JSON.stringify({ error: { status: "RESOURCE_EXHAUSTED" } }), { status: 429 });
    });

    const urls = Array.from({ length: 50 }, (_, i) => `https://host/p${i}`);
    const result = await sweepInspections("https://host/", urls, impl);

    expect(result.stoppedOnQuota).toBe(true);
    expect(result.inspected).toBe(2);
    expect(calls).toBe(3);
  });

  it("keeps going past a single URL's failure", async () => {
    // One bad URL must not cost the other seventy-nine their nightly check.
    let calls = 0;
    const impl = responder(() => {
      calls += 1;
      return calls === 2
        ? new Response(JSON.stringify({ error: { message: "nope" } }), { status: 403 })
        : indexed("https://host/x");
    });

    const result = await sweepInspections(
      "https://host/",
      ["https://host/a", "https://host/b", "https://host/c"],
      impl,
    );

    expect(result.stoppedOnQuota).toBe(false);
    expect(result.inspected).toBe(2);
    expect(result.failed).toBe(1);
  });
});
