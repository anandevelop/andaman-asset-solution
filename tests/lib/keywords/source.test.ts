/**
 * tests/lib/keywords/source.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * csvRankSource() is the CSV-backed implementation of the ranking-source
 * seam (lib/keywords/source.ts's header) — pure parsing, no database, so
 * every row-level boundary is exercised directly here rather than through
 * a mocked Prisma client.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it } from "vitest";
import { csvRankSource } from "@/lib/keywords/source";

describe("csvRankSource", () => {
  it("parses a well-formed row", async () => {
    const csv = "query,impressions,clicks,position\nbeachfront villas phuket,1200,45,3";
    const { observations, errors } = await csvRankSource(csv).fetchRankUpdates();
    expect(errors).toEqual([]);
    expect(observations).toEqual([
      { query: "beachfront villas phuket", position: 3, impressions: 1200, clicks: 45 },
    ]);
  });

  it("accepts columns in any order", async () => {
    const csv = "position,query\n5,phuket condos";
    const { observations } = await csvRankSource(csv).fetchRankUpdates();
    expect(observations).toEqual([{ query: "phuket condos", position: 5, impressions: null, clicks: null }]);
  });

  it("treats blank impressions/clicks as null, not an error", async () => {
    const csv = "query,impressions,clicks,position\nphuket condos,,,7";
    const { observations, errors } = await csvRankSource(csv).fetchRankUpdates();
    expect(errors).toEqual([]);
    expect(observations[0]).toMatchObject({ impressions: null, clicks: null });
  });

  it("reports a missing query with its line number", async () => {
    const csv = "query,position\n,4";
    const { observations, errors } = await csvRankSource(csv).fetchRankUpdates();
    expect(observations).toEqual([]);
    expect(errors).toEqual([{ line: 2, reason: "MISSING_QUERY" }]);
  });

  it("reports a non-numeric or zero position with its line number and query", async () => {
    const csv = "query,position\nphuket villas,not-a-number\nphuket condos,0";
    const { errors } = await csvRankSource(csv).fetchRankUpdates();
    expect(errors).toEqual([
      { line: 2, query: "phuket villas", reason: "BAD_POSITION" },
      { line: 3, query: "phuket condos", reason: "BAD_POSITION" },
    ]);
  });

  it("skips a trailing blank line without reporting it", async () => {
    const csv = "query,position\nphuket villas,3\n";
    const { observations, errors } = await csvRankSource(csv).fetchRankUpdates();
    expect(errors).toEqual([]);
    expect(observations).toHaveLength(1);
  });

  it("reports missing required columns instead of guessing", async () => {
    const csv = "impressions,clicks\n100,5";
    const { observations, errors } = await csvRankSource(csv).fetchRankUpdates();
    expect(observations).toEqual([]);
    expect(errors).toEqual([{ reason: "MISSING_COLUMNS:query,position" }]);
  });

  it("reports a fully empty file", async () => {
    const { observations, errors } = await csvRankSource("").fetchRankUpdates();
    expect(observations).toEqual([]);
    expect(errors).toEqual([{ reason: "EMPTY_FILE" }]);
  });
});
