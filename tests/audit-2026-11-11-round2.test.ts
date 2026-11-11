/**
 * tests/audit-2026-11-11-round2.test.ts
 * Regression tests for the second batch of 2026-11-11 audit fixes.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  seoQueryStat: { findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

beforeEach(() => vi.clearAllMocks());

describe("pickLocale (#18)", () => {
  it("falls back to the other language when the asked-for one is blank", async () => {
    const { pickLocale } = await import("@/lib/locale");
    expect(pickLocale("th", "", "The Victory")).toBe("The Victory");
    expect(pickLocale("th", "  ", "The Victory")).toBe("The Victory");
    expect(pickLocale("en", "", "")).toBe("");
    expect(pickLocale("th", "เดอะ วิคตอรี่", "The Victory")).toBe("เดอะ วิคตอรี่");
  });
});

describe("Buddhist-era years (#23)", () => {
  it("reads 2568 as 2025 and leaves CE years alone", async () => {
    const { toCeYear, awardSchema } = await import("@/lib/validations");
    expect(toCeYear(2568)).toBe(2025);
    expect(toCeYear(2025)).toBe(2025);
    const parsed = awardSchema.safeParse({ year: "2568" });
    if (!parsed.success) {
      expect(parsed.error.issues.some((i) => i.path[0] === "year")).toBe(false);
    }
  });
});

describe("impression-weighted keyword position (#16)", () => {
  it("weights each row by its impressions", async () => {
    prismaMock.seoQueryStat.findMany.mockResolvedValue([
      { query: "Pool Villa Phuket", impressions: 1, position: 3 },
      { query: "pool villa phuket", impressions: 399, position: 30 },
      { query: "nothing", impressions: 0, position: 5 },
    ]);
    const { weightedPositions } = await import("@/lib/seo/weighted-position");
    const map = await weightedPositions({});
    expect(map.get("pool villa phuket")).toBeCloseTo((3 + 399 * 30) / 400);
    expect(map.has("nothing")).toBe(false);
  });
});
