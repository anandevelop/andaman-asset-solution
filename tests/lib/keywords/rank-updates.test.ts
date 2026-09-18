/**
 * tests/lib/keywords/rank-updates.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * applyRankUpdates() is the shared write path both the CSV importer and a
 * future Search Console sync go through (lib/keywords/source.ts's header)
 * — Prisma mocked, per this codebase's convention that DB-touching
 * orchestration isn't exercised against a real database in a unit test.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RankSourceResult } from "@/lib/keywords/source";

const { findMany, update, createMany, transaction } = vi.hoisted(() => ({
  findMany: vi.fn(),
  update: vi.fn(),
  createMany: vi.fn(),
  transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    keyword: { findMany, update, createMany },
    $transaction: transaction,
  },
}));

function result(observations: RankSourceResult["observations"], errors: RankSourceResult["errors"] = []): RankSourceResult {
  return { observations, errors };
}

beforeEach(() => {
  findMany.mockReset().mockResolvedValue([]);
  update.mockReset().mockResolvedValue({});
  createMany.mockReset().mockResolvedValue({ count: 0 });
  transaction.mockClear();
});

describe("applyRankUpdates — new keywords", () => {
  it("creates a keyword not seen before, with a one-point trend", async () => {
    const { applyRankUpdates } = await import("@/lib/keywords/rank-updates");

    const summary = await applyRankUpdates(
      result([{ query: "beachfront villas phuket", position: 4, impressions: 100, clicks: 3 }]),
      "en",
    );

    expect(summary).toEqual({ created: 1, updated: 0, errors: [] });
    expect(createMany).toHaveBeenCalledWith({
      data: [
        {
          phrase: "beachfront villas phuket",
          locale: "en",
          currentRank: 4,
          previousRank: null,
          rankCheckedAt: expect.any(Date),
          trend: [{ w: 1, rank: 4 }],
        },
      ],
    });
  });
});

describe("applyRankUpdates — existing keywords", () => {
  it("updates rank, shifts previousRank, and appends to the trend", async () => {
    findMany.mockResolvedValue([
      { id: "kw-1", phrase: "phuket condos", locale: "en", currentRank: 6, trend: [{ w: 1, rank: 6 }] },
    ]);

    const { applyRankUpdates } = await import("@/lib/keywords/rank-updates");
    const summary = await applyRankUpdates(result([{ query: "Phuket Condos", position: 3, impressions: null, clicks: null }]), "en");

    expect(summary).toEqual({ created: 0, updated: 1, errors: [] });
    expect(update).toHaveBeenCalledWith({
      where: { id: "kw-1" },
      data: {
        previousRank: 6,
        currentRank: 3,
        rankCheckedAt: expect.any(Date),
        trend: [
          { w: 1, rank: 6 },
          { w: 2, rank: 3 },
        ],
      },
    });
  });

  it("drops the oldest trend point once there are more than 12", async () => {
    const twelvePoints = Array.from({ length: 12 }, (_, i) => ({ w: i + 1, rank: 10 }));
    findMany.mockResolvedValue([{ id: "kw-1", phrase: "phuket condos", locale: "en", currentRank: 10, trend: twelvePoints }]);

    const { applyRankUpdates } = await import("@/lib/keywords/rank-updates");
    await applyRankUpdates(result([{ query: "phuket condos", position: 8, impressions: null, clicks: null }]), "en");

    const written = update.mock.calls[0][0].data.trend;
    expect(written).toHaveLength(12);
    expect(written[0]).toEqual({ w: 2, rank: 10 }); // w:1 dropped
    expect(written.at(-1)).toEqual({ w: 13, rank: 8 });
  });

  it("flags a same-phrase-different-locale collision instead of writing to it", async () => {
    findMany.mockResolvedValue([{ id: "kw-1", phrase: "phuket condos", locale: "th", currentRank: 6, trend: [] }]);

    const { applyRankUpdates } = await import("@/lib/keywords/rank-updates");
    const summary = await applyRankUpdates(result([{ query: "phuket condos", position: 3, impressions: null, clicks: null }]), "en");

    expect(summary).toEqual({
      created: 0,
      updated: 0,
      errors: [{ line: undefined, query: "phuket condos", reason: "PHRASE_TRACKED_IN_ANOTHER_LOCALE" }],
    });
    expect(update).not.toHaveBeenCalled();
    expect(createMany).not.toHaveBeenCalled();
  });
});

describe("applyRankUpdates — batch de-duplication", () => {
  it("flags a duplicate query within the same file, case-insensitively", async () => {
    const { applyRankUpdates } = await import("@/lib/keywords/rank-updates");

    const summary = await applyRankUpdates(
      result([
        { query: "phuket condos", position: 3, impressions: null, clicks: null },
        { query: "Phuket Condos", position: 5, impressions: null, clicks: null },
      ]),
      "en",
    );

    expect(summary.created).toBe(1);
    expect(summary.errors).toEqual([{ line: undefined, query: "Phuket Condos", reason: "DUPLICATE_IN_FILE" }]);
  });
});

describe("applyRankUpdates — passthrough of source-level errors", () => {
  it("carries a parse error through to the final result unchanged", async () => {
    const { applyRankUpdates } = await import("@/lib/keywords/rank-updates");

    const summary = await applyRankUpdates(result([], [{ line: 4, reason: "MISSING_QUERY" }]), "en");

    expect(summary).toEqual({ created: 0, updated: 0, errors: [{ line: 4, query: "", reason: "MISSING_QUERY" }] });
    expect(transaction).not.toHaveBeenCalled();
  });
});
