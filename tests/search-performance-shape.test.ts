import { describe, expect, it } from "vitest";
import {
  fillDays,
  fillHours,
  groupBy,
  resolveRange,
  splitHourWindows,
  sumMetrics,
  toDimensionFilters,
} from "@/lib/seo/search-performance-shape";

const NOW = new Date("2026-10-16T05:00:00Z");

describe("resolveRange", () => {
  it("ends today and runs back inclusively", () => {
    expect(resolveRange("7d", NOW)).toMatchObject({ startDate: "2026-10-10", endDate: "2026-10-16", hourly: false });
    expect(resolveRange("28d", NOW)).toMatchObject({ startDate: "2026-09-19", endDate: "2026-10-16" });
    expect(resolveRange("3m", NOW)).toMatchObject({ startDate: "2026-07-16", endDate: "2026-10-16" });
  });

  it("compares with the period of the same length just before", () => {
    // 7 days ending the 16th; the 7 before end on the 9th.
    expect(resolveRange("7d", NOW).previous).toEqual({ startDate: "2026-10-03", endDate: "2026-10-09" });
  });

  it("has nothing to compare 16 months with, because Google keeps no more", () => {
    expect(resolveRange("16m", NOW).previous).toBeNull();
  });

  it("reads 24 hours as hourly rows over three days", () => {
    expect(resolveRange("24h", NOW)).toMatchObject({ startDate: "2026-10-13", endDate: "2026-10-16", hourly: true });
  });
});

describe("sumMetrics", () => {
  it("weights average position by impressions, as Search Console does", () => {
    const total = sumMetrics([
      { clicks: 10, impressions: 200, position: 3 },
      { clicks: 0, impressions: 1, position: 40 },
    ]);
    expect(total.clicks).toBe(10);
    expect(total.impressions).toBe(201);
    expect(total.ctr).toBeCloseTo(10 / 201);
    // A plain mean would be 21.5.
    expect(total.position).toBeCloseTo((3 * 200 + 40) / 201);
  });

  it("is zero, not NaN, with no impressions", () => {
    expect(sumMetrics([])).toEqual({ clicks: 0, impressions: 0, ctr: 0, position: 0 });
  });
});

describe("the last 24 hours", () => {
  const hour = (iso: string, clicks = 1) => ({ keys: [iso], clicks, impressions: 10, ctr: 0.1, position: 5 });

  it("keeps the 24 hours up to the newest, and the 24 before them apart", () => {
    const rows = [
      hour("2026-10-15T10:00:00-07:00"), // newest
      hour("2026-10-14T11:00:00-07:00"), // 23 hours earlier: inside
      hour("2026-10-14T10:00:00-07:00"), // 24 hours earlier: the previous window
      hour("2026-10-13T10:00:00-07:00"), // 48 hours earlier: neither
    ];
    const { current, previous, newest } = splitHourWindows(rows);
    expect(newest).toBe(Date.parse("2026-10-15T10:00:00-07:00"));
    expect(current.map((row) => row.keys[0])).toEqual(["2026-10-15T10:00:00-07:00", "2026-10-14T11:00:00-07:00"]);
    expect(previous.map((row) => row.keys[0])).toEqual(["2026-10-14T10:00:00-07:00"]);
  });

  it("draws every hour, with the empty ones at zero", () => {
    const newest = Date.parse("2026-10-15T17:00:00Z");
    const points = fillHours(newest, [{ key: "2026-10-15T10:00:00-07:00", clicks: 4, impressions: 9, ctr: 0, position: 2 }]);
    expect(points).toHaveLength(24);
    expect(points.at(-1)).toMatchObject({ clicks: 4 });
    expect(points.at(-2)).toMatchObject({ clicks: 0, impressions: 0 });
  });

  it("sums a query across the hours it appears in", () => {
    const rows = [
      { keys: ["2026-10-15T10:00:00-07:00", "villa"], clicks: 1, impressions: 10, position: 2 },
      { keys: ["2026-10-15T11:00:00-07:00", "villa"], clicks: 2, impressions: 30, position: 4 },
      { keys: ["2026-10-15T11:00:00-07:00", "phuket"], clicks: 0, impressions: 5, position: 9 },
    ];
    const grouped = groupBy(rows, 1);
    expect(grouped.find((row) => row.key === "villa")).toMatchObject({ clicks: 3, impressions: 40, position: 3.5 });
  });
});

describe("fillDays", () => {
  it("leaves no day out of the line", () => {
    const days = fillDays("2026-10-14", "2026-10-16", [{ key: "2026-10-15", clicks: 2, impressions: 5, ctr: 0.4, position: 3 }]);
    expect(days.map((day) => [day.key, day.clicks])).toEqual([
      ["2026-10-14", 0],
      ["2026-10-15", 2],
      ["2026-10-16", 0],
    ]);
  });
});

describe("toDimensionFilters", () => {
  it("matches text by contains and codes exactly, in Google's casing", () => {
    expect(toDimensionFilters({ query: " villa ", page: "/victory", country: "THA", device: "MOBILE" })).toEqual([
      { dimension: "query", operator: "contains", expression: "villa" },
      { dimension: "page", operator: "contains", expression: "/victory" },
      { dimension: "country", operator: "equals", expression: "tha" },
      { dimension: "device", operator: "equals", expression: "MOBILE" },
    ]);
  });

  it("drops empty filters", () => {
    expect(toDimensionFilters({ query: "  ", page: undefined })).toEqual([]);
  });
});
