/**
 * tests/reports/google-origin.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The rule the monthly report's only meaningful number rests on.
 *
 * "Clicks from Google ÷ leads from Google" is a rate. "Clicks from Google ÷
 * every lead we got" is not, and shipping the second one under the first
 * one's label is the specific mistake this rule exists to prevent — so the
 * cases below are the ones that decide which population a lead falls in,
 * not a tour of the happy path.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it } from "vitest";
import {
  isGoogleOrigin,
  landingBucket,
  projectOfLandingPath,
  type LeadOrigin,
} from "@/lib/reports/google-origin";

function lead(overrides: Partial<LeadOrigin> = {}): LeadOrigin {
  return {
    landingReferrer: null,
    landingPath: null,
    utmMedium: null,
    ...overrides,
  };
}

describe("isGoogleOrigin", () => {
  it("counts the country domains the client's visitors actually use", () => {
    for (const host of [
      "google.com",
      "www.google.com",
      "www.google.co.th",
      "google.co.th",
      "google.com.au",
      "google.ru",
      "www.google.de",
    ]) {
      expect(isGoogleOrigin(lead({ landingReferrer: host })), host).toBe(true);
    }
  });

  it("does not count a host that merely contains the word", () => {
    // The reason the pattern is anchored: these are the shapes a
    // substring test would wrongly credit to organic search.
    for (const host of [
      "notgoogle.com",
      "google.com.evil.example",
      "mygoogle.example.com",
      "googleusercontent.com",
      "fakegoogle.co.th",
    ]) {
      expect(isGoogleOrigin(lead({ landingReferrer: host })), host).toBe(false);
    }
  });

  it("excludes a tagged link even when Google referred it", () => {
    // utm_medium=cpc on a google referrer is the paid ad. Counting ads
    // inside an organic figure is the same cross-base error in miniature,
    // and the two cost very different amounts.
    expect(
      isGoogleOrigin(
        lead({ landingReferrer: "www.google.co.th", utmMedium: "cpc" }),
      ),
    ).toBe(false);
  });

  it("treats an empty utm_medium as no utm at all", () => {
    // A form that posts "" rather than omitting the field must not turn a
    // real organic lead into an untracked one.
    expect(
      isGoogleOrigin(
        lead({ landingReferrer: "www.google.co.th", utmMedium: "" }),
      ),
    ).toBe(true);
    expect(
      isGoogleOrigin(
        lead({ landingReferrer: "www.google.co.th", utmMedium: "   " }),
      ),
    ).toBe(true);
  });

  it("is false for every lead that predates landing capture", () => {
    // Not "unknown" and not an error: a null landing is a lead from before
    // the columns existed, and the report says so with a start date rather
    // than by guessing.
    expect(isGoogleOrigin(lead())).toBe(false);
    expect(isGoogleOrigin(lead({ landingReferrer: "" }))).toBe(false);
  });

  it("is false for the other channels, which is the entire point", () => {
    for (const host of [
      "line.me",
      "m.facebook.com",
      "bing.com",
      "duckduckgo.com",
    ]) {
      expect(isGoogleOrigin(lead({ landingReferrer: host })), host).toBe(false);
    }
  });

  it("reads a full URL as well as a bare host", () => {
    // landingReferrer is written as a host, but a row from an older client
    // or a hand edit would otherwise be silently filed as "not Google".
    expect(
      isGoogleOrigin(
        lead({ landingReferrer: "https://www.google.co.th/search?q=x" }),
      ),
    ).toBe(true);
    expect(isGoogleOrigin(lead({ landingReferrer: "google.co.th:443" }))).toBe(
      true,
    );
  });

  it("is case-insensitive", () => {
    expect(isGoogleOrigin(lead({ landingReferrer: "WWW.Google.CO.TH" }))).toBe(
      true,
    );
  });
});

describe("projectOfLandingPath", () => {
  const slugs = new Map([
    ["victory", "p-victory"],
    ["victory-villas", "p-victory-villas"],
    ["trinity-village", "p-trinity"],
  ]);

  it("matches on the whole slug segment, not a prefix", () => {
    // The case a startsWith() test gets wrong: /projects/victory-villas
    // would be credited to "victory", whose slug is a prefix of it.
    expect(projectOfLandingPath("/projects/victory-villas", slugs)).toBe(
      "p-victory-villas",
    );
    expect(projectOfLandingPath("/projects/victory", slugs)).toBe("p-victory");
  });

  it("ignores a query string and a fragment", () => {
    expect(
      projectOfLandingPath("/projects/trinity-village?utm_x=1", slugs),
    ).toBe("p-trinity");
    expect(projectOfLandingPath("/projects/trinity-village#units", slugs)).toBe(
      "p-trinity",
    );
  });

  it("returns null for a path that is not a project page", () => {
    for (const path of [
      "/",
      "/contact",
      "/news/some-article",
      "/projects",
      "/about",
    ]) {
      expect(projectOfLandingPath(path, slugs), path).toBeNull();
    }
  });

  it("returns null for an unknown slug rather than inventing a row", () => {
    expect(projectOfLandingPath("/projects/deleted-one", slugs)).toBeNull();
  });

  it("returns null when there is no landing at all", () => {
    expect(projectOfLandingPath(null, slugs)).toBeNull();
  });
});

describe("landingBucket", () => {
  const slugs = new Map([["trinity-village", "p-trinity"]]);

  it("files a project landing under that project", () => {
    expect(landingBucket("/projects/trinity-village", slugs)).toEqual({
      kind: "project",
      projectId: "p-trinity",
    });
  });

  it("files any article under one news row", () => {
    expect(landingBucket("/news/why-phuket", slugs)).toEqual({ kind: "news" });
  });

  it("gives the rest of the site no row", () => {
    // A lead that landed on /contact did not arrive through a development
    // page, and a row for it would pad the table without saying what to do.
    for (const path of ["/", "/contact", "/about", null]) {
      expect(landingBucket(path, slugs), String(path)).toBeNull();
    }
  });
});
