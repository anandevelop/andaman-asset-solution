/**
 * tests/lib/keyword-density.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Covers the zero-keyword edge case explicitly — a blank focus-keyword
 * field is the default state of a new article, and this must return
 * 0/0 rather than throw or divide by zero.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it } from "vitest";
import { getKeywordDensity } from "@/lib/keyword-density";

describe("getKeywordDensity", () => {
  it("returns 0/0 for an empty keyword", () => {
    expect(getKeywordDensity("some text here", "")).toEqual({ count: 0, density: 0 });
    expect(getKeywordDensity("some text here", "   ")).toEqual({ count: 0, density: 0 });
  });

  it("returns 0/0 for empty text", () => {
    expect(getKeywordDensity("", "villa")).toEqual({ count: 0, density: 0 });
  });

  it("counts a single-word keyword's occurrences", () => {
    const text = "villa villa house villa";
    const result = getKeywordDensity(text, "villa");
    expect(result.count).toBe(3);
  });

  it("weights density by the keyword's own word count", () => {
    const text = "beachfront villa in Phuket beachfront villa in Bangkok";
    // 8 words total, "beachfront villa" (2 words) appears twice.
    const result = getKeywordDensity(text, "beachfront villa");
    expect(result.count).toBe(2);
    expect(result.density).toBeCloseTo((2 * 2) / 8 * 100, 5);
  });

  it("matches regardless of case", () => {
    const result = getKeywordDensity("Villa villa VILLA", "villa");
    expect(result.count).toBe(3);
  });
});
