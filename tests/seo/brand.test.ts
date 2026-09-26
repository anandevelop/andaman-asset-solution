/**
 * tests/seo/brand.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The split that decides whether the headline number means anything.
 *
 * Brand searches come from people who already know the company. Counted
 * together with everyone else, a month of existing customers looking up
 * "trinity village" reads as the site being found by new people — which is
 * the one thing the figure is supposed to measure.
 *
 * The expensive failure is a term that matches too much, so that is what
 * most of these cover.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it } from "vitest";
import {
  brandTotals,
  isBrandQuery,
  MIN_TERM_LENGTH,
  parseBrandTerms,
  splitByBrand,
  unmatchedProjectQueries,
} from "@/lib/seo/brand";

describe("parseBrandTerms", () => {
  it("reads the comma-separated list a person types", () => {
    expect(parseBrandTerms("andaman, trinity village, the victory")).toEqual([
      "andaman",
      "trinity village",
      "the victory",
    ]);
  });

  it("survives the mess a real list acquires", () => {
    expect(parseBrandTerms("  Andaman ,, TRINITY  , andaman, ")).toEqual(["andaman", "trinity"]);
  });

  it("drops terms too short to mean anything", () => {
    expect(parseBrandTerms("at, ab, andaman")).toEqual(["andaman"]);
    expect(MIN_TERM_LENGTH).toBe(3);
  });

  it("drops the words that would file the whole internet under brand", () => {
    /*
      Length cannot catch these: "the" is three characters and so is a
      perfectly good three-letter brand. Somebody listing "The Victory,
      The Residence" can easily leave a bare "the" behind, and one such
      term zeroes the non-brand figure the whole split exists to protect.
    */
    expect(parseBrandTerms("the, and, for, andaman")).toEqual(["andaman"]);
  });

  it("still accepts a genuinely short brand", () => {
    expect(parseBrandTerms("aas, andaman")).toEqual(["aas", "andaman"]);
  });

  it("is empty when nothing is configured", () => {
    expect(parseBrandTerms(null)).toEqual([]);
    expect(parseBrandTerms("")).toEqual([]);
    expect(parseBrandTerms("   ")).toEqual([]);
  });
});

describe("isBrandQuery", () => {
  const terms = parseBrandTerms("andaman, trinity village, ทรินิตี้");

  it("matches however the searcher capitalised it", () => {
    expect(isBrandQuery("Andaman Asset Solution", terms)).toBe(true);
    expect(isBrandQuery("TRINITY VILLAGE phuket", terms)).toBe(true);
  });

  it("matches a Thai term, because that is the market", () => {
    // Left out of the list, this search counts as non-brand and overstates
    // the figure in the language most customers actually search in.
    expect(isBrandQuery("ทรินิตี้ วิลเลจ ภูเก็ต", terms)).toBe(true);
  });

  it("does not claim an ordinary search", () => {
    for (const query of ["pool villa phuket", "บ้านภูเก็ต", "luxury villa for sale"]) {
      expect(isBrandQuery(query, terms), query).toBe(false);
    }
  });

  it("claims nothing at all when no terms are configured", () => {
    // Everything non-brand is the honest default: the alternative would be
    // guessing at brand names and silently shrinking the number that
    // matters.
    expect(isBrandQuery("andaman asset", [])).toBe(false);
  });
});

describe("splitByBrand and brandTotals", () => {
  const terms = parseBrandTerms("andaman, trinity");

  const rows = [
    { query: "andaman asset solution", clicks: 100, impressions: 400 },
    { query: "trinity village phuket", clicks: 40, impressions: 200 },
    { query: "pool villa phuket", clicks: 10, impressions: 900 },
    { query: "villa for sale kamala", clicks: 5, impressions: 600 },
  ];

  it("keeps every row on exactly one side", () => {
    const { brand, nonBrand } = splitByBrand(rows, terms);
    expect(brand).toHaveLength(2);
    expect(nonBrand).toHaveLength(2);
    expect(brand.length + nonBrand.length).toBe(rows.length);
  });

  it("totals each side separately", () => {
    const totals = brandTotals(rows, terms);

    expect(totals.brand).toEqual({ clicks: 140, impressions: 600 });
    expect(totals.nonBrand).toEqual({ clicks: 15, impressions: 1500 });
  });

  it("shows why the split matters", () => {
    // 155 clicks looks like a good month. Fifteen of them came from
    // somebody who did not already know the company.
    const totals = brandTotals(rows, terms);
    const all = totals.brand.clicks + totals.nonBrand.clicks;

    expect(all).toBe(155);
    expect(totals.nonBrand.clicks).toBe(15);
  });
});

describe("unmatchedProjectQueries", () => {
  const projects = ["The Victory", "Trinity Village", "Residence Prime"];
  const terms = parseBrandTerms("trinity village");

  it("finds searches for a development the brand list does not cover", () => {
    const rows = [
      { query: "the victory phuket", clicks: 12 },
      { query: "trinity village", clicks: 30 },
      { query: "pool villa", clicks: 4 },
    ];

    // "the victory" is a project, is being searched for, and is filed as
    // non-brand — a gap somebody can close in ten seconds once they see it.
    expect(unmatchedProjectQueries(rows, projects, terms)).toEqual([
      { query: "the victory phuket", clicks: 12 },
    ]);
  });

  it("needs every significant word of the name, not just one", () => {
    // "residence" alone is a word half the property market uses; matching
    // on it would bury the real suggestions.
    const rows = [
      { query: "residence phuket", clicks: 50 },
      { query: "residence prime phuket", clicks: 3 },
    ];

    expect(unmatchedProjectQueries(rows, projects, terms).map((r) => r.query)).toEqual([
      "residence prime phuket",
    ]);
  });

  it("puts the busiest gap first", () => {
    const rows = [
      { query: "residence prime", clicks: 5 },
      { query: "the victory", clicks: 40 },
    ];

    expect(unmatchedProjectQueries(rows, projects, terms)[0].query).toBe("the victory");
  });

  it("suggests nothing when there are no projects to compare against", () => {
    expect(unmatchedProjectQueries([{ query: "x y", clicks: 1 }], [], terms)).toEqual([]);
  });
});
