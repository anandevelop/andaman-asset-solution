/**
 * tests/analytics/live-visit.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The parts of the realtime counter that decide something.
 *
 * The visit hash is the one with a privacy claim attached, so it is the one
 * tested hardest: the same visitor has to hash the same way for a row to be
 * updated rather than duplicated, a different visitor must not, and the
 * address must not be recoverable from the result.
 *
 * `summariseVisits` is separated from the query for the same reason the
 * rules in lib/seo are separated from the runner — the arithmetic is where
 * a median turns into a mean and nobody notices.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { summariseVisits, visitHash, type LiveVisitRow } from "@/lib/analytics/live-visit";
import { isCountablePublicPath } from "@/lib/public-paths";
import { localeOf } from "@/lib/analytics/locale-of";

const ORIGINAL = process.env;

beforeEach(() => {
  process.env = { ...ORIGINAL, ANALYTICS_SALT: "test-salt" } as NodeJS.ProcessEnv;
});

afterEach(() => {
  process.env = ORIGINAL;
});

function row(over: Partial<LiveVisitRow> = {}): LiveVisitRow {
  return {
    path: "/projects/victory",
    locale: "th",
    startedAt: new Date("2026-01-01T10:00:00Z"),
    lastSeenAt: new Date("2026-01-01T10:05:00Z"),
    dwellMs: 60_000,
    ...over,
  };
}

describe("visitHash", () => {
  it("is stable for the same visitor, so their row is updated not duplicated", () => {
    expect(visitHash("1.2.3.4", "Mozilla/5.0")).toBe(visitHash("1.2.3.4", "Mozilla/5.0"));
  });

  it("differs for a different address", () => {
    expect(visitHash("1.2.3.4", "Mozilla/5.0")).not.toBe(visitHash("1.2.3.5", "Mozilla/5.0"));
  });

  it("differs for a different browser on the same address", () => {
    // Two people behind one office NAT are two visits, which is the best
    // this can do without storing anything more identifying.
    expect(visitHash("1.2.3.4", "Mozilla/5.0")).not.toBe(visitHash("1.2.3.4", "Safari/17"));
  });

  it("does not contain the address it was made from", () => {
    const hash = visitHash("203.0.113.42", "Mozilla/5.0");
    expect(hash).not.toContain("203");
    expect(hash).not.toContain("113");
    expect(hash).toMatch(/^[0-9a-f]{32}$/);
  });

  it("changes with the salt, so the stored value is not reproducible without it", () => {
    const withTestSalt = visitHash("1.2.3.4", "Mozilla/5.0");
    process.env.ANALYTICS_SALT = "a-different-salt";
    expect(visitHash("1.2.3.4", "Mozilla/5.0")).not.toBe(withTestSalt);
  });

  it("still hashes when no salt is configured", () => {
    // Falls back to a per-process random value rather than to none — the
    // failure mode is "visits stop matching across a restart", not
    // "anyone can confirm an IP was here by hashing it themselves".
    delete process.env.ANALYTICS_SALT;
    const hash = visitHash("1.2.3.4", "Mozilla/5.0");
    expect(hash).toMatch(/^[0-9a-f]{32}$/);
    expect(hash).toBe(visitHash("1.2.3.4", "Mozilla/5.0"));
  });
});

describe("summariseVisits", () => {
  it("counts an empty window as nobody here", () => {
    expect(summariseVisits([])).toMatchObject({ activeCount: 0, pages: [], byLocale: [] });
  });

  it("groups by page, busiest first", () => {
    const summary = summariseVisits([
      row({ path: "/projects/victory" }),
      row({ path: "/news/flow" }),
      row({ path: "/projects/victory" }),
    ]);

    expect(summary.activeCount).toBe(3);
    expect(summary.pages[0]).toMatchObject({ path: "/projects/victory", count: 2 });
    expect(summary.pages[1]).toMatchObject({ path: "/news/flow", count: 1 });
  });

  it("groups by locale", () => {
    const summary = summariseVisits([row({ locale: "th" }), row({ locale: "th" }), row({ locale: "en" })]);
    expect(summary.byLocale).toEqual([
      { locale: "th", count: 2 },
      { locale: "en", count: 1 },
    ]);
  });

  it("reports the median dwell, not the mean", () => {
    // The reason: one tab left open overnight drags a mean into
    // uselessness, and this number is read as "how long people stay".
    const summary = summariseVisits([
      row({ dwellMs: 10_000 }),
      row({ dwellMs: 20_000 }),
      row({ dwellMs: 9_000_000 }),
    ]);

    expect(summary.pages[0].medianDwellMs).toBe(20_000);
  });

  it("averages the middle pair for an even count", () => {
    const summary = summariseVisits([row({ dwellMs: 10_000 }), row({ dwellMs: 30_000 })]);
    expect(summary.pages[0].medianDwellMs).toBe(20_000);
  });
});

describe("which paths are counted", () => {
  it.each(["/", "/contact", "/projects", "/news", "/privacy-policy"])("counts the static page %s", (path) => {
    expect(isCountablePublicPath(path)).toBe(true);
  });

  it.each(["/projects/victory", "/news/flow-into-living", "/events/open-house", "/e-brochure/villa"])(
    "counts the content page %s",
    (path) => {
      expect(isCountablePublicPath(path)).toBe(true);
    },
  );

  it.each(["/admin", "/admin/news", "/login", "/api/leads"])("ignores %s", (path) => {
    expect(isCountablePublicPath(path)).toBe(false);
  });

  it("ignores a path a crawler invented", () => {
    // The reason the list exists at all: without it, path_hit_days grows a
    // row per day for every URL anybody ever probes.
    expect(isCountablePublicPath("/wp-login.php")).toBe(false);
    expect(isCountablePublicPath("/some/made/up/thing")).toBe(false);
  });

  it("does not count a section prefix with no slug as a content page", () => {
    // "/projects" is countable because it is a real listing page, not
    // because it is a prefix — "/projects/" with nothing after it is not a
    // second page.
    expect(isCountablePublicPath("/projects/")).toBe(false);
  });
});

describe("localeOf", () => {
  it.each([
    ["/th/projects/victory", "th"],
    ["/en/news/flow", "en"],
    ["/zh/", "zh"],
    ["/ru", "ru"],
  ])("reads %s as %s", (path, expected) => {
    expect(localeOf(path)).toBe(expected);
  });

  it("falls back to the default locale for an unprefixed path", () => {
    expect(localeOf("/contact")).toBe("th");
  });

  it("ignores a query string", () => {
    expect(localeOf("/en/contact?utm_source=x")).toBe("en");
  });
});
