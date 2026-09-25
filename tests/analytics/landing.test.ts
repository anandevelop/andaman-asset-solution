/**
 * @vitest-environment jsdom
 */
/**
 * tests/analytics/landing.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Where a visit started, and whether that counts as search.
 *
 * Both halves are read back into a database column against a named person's
 * phone number, so both are parsed defensively: sessionStorage is a value
 * anybody with devtools can write, and `isSearchReferrer` decides a number
 * that will be reported to the business as "leads from Google".
 * ─────────────────────────────────────────────────────────────────────────
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  EMPTY_LANDING,
  LANDING_STORAGE_KEY,
  isSearchReferrer,
  readLanding,
} from "@/lib/analytics/landing";

beforeEach(() => window.sessionStorage.clear());

function store(value: unknown) {
  window.sessionStorage.setItem(LANDING_STORAGE_KEY, JSON.stringify(value));
}

describe("readLanding", () => {
  it("reads back what the beacon stored", () => {
    store({ path: "/th/news/flow", referrer: "www.google.co.th" });
    expect(readLanding()).toEqual({ path: "/th/news/flow", referrer: "www.google.co.th" });
  });

  it("is empty when nothing was stored", () => {
    expect(readLanding()).toEqual(EMPTY_LANDING);
  });

  it("treats unparseable storage as absent rather than trusting it", () => {
    window.sessionStorage.setItem(LANDING_STORAGE_KEY, "not json");
    expect(readLanding()).toEqual(EMPTY_LANDING);
  });

  it("refuses a stored value of the wrong shape", () => {
    store({ path: 42 });
    expect(readLanding()).toEqual(EMPTY_LANDING);
  });

  it("tolerates a missing referrer — a direct visit has none", () => {
    store({ path: "/th/contact" });
    expect(readLanding()).toEqual({ path: "/th/contact", referrer: "" });
  });

  it("truncates rather than passing an unbounded string to a column", () => {
    store({ path: "/x".repeat(600), referrer: "a".repeat(400) });
    const landing = readLanding();
    expect(landing.path.length).toBeLessThanOrEqual(500);
    expect(landing.referrer.length).toBeLessThanOrEqual(255);
  });
});

describe("isSearchReferrer", () => {
  it.each([
    "google.com",
    "www.google.com",
    "www.google.co.th",
    "news.google.com",
    "www.bing.com",
    "duckduckgo.com",
    "search.yahoo.com",
    "yandex.ru",
    "www.baidu.com",
  ])("counts %s as search", (host) => {
    expect(isSearchReferrer(host)).toBe(true);
  });

  it.each(["", "  ", "www.facebook.com", "l.line.me", "t.co", "andamanassetsolution.com"])(
    "does not count %j as search",
    (host) => {
      expect(isSearchReferrer(host)).toBe(false);
    },
  );

  it("is not fooled by a host that merely contains the word", () => {
    // A report that counted this would be wrong in the direction that
    // flatters the channel being measured, which is the worst direction.
    expect(isSearchReferrer("google.evil.test")).toBe(false);
    expect(isSearchReferrer("notgoogle.com")).toBe(false);
    expect(isSearchReferrer("mybing.com.co")).toBe(false);
  });

  it("ignores case and surrounding space", () => {
    expect(isSearchReferrer("  WWW.Google.CO.TH ")).toBe(true);
  });
});
