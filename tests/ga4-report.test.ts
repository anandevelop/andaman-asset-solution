/**
 * tests/ga4-report.test.ts — date ranges and the compare fold.
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/google-config", () => ({ getGoogleConfig: async () => ({}) }));

import { dateRangesFor, foldRows } from "@/lib/analytics/ga4-report";

describe("dateRangesFor", () => {
  it("covers exactly N days, and compares with the N days before", () => {
    expect(dateRangesFor("7", false)).toEqual([{ startDate: "6daysAgo", endDate: "today" }]);
    expect(dateRangesFor("28", true)).toEqual([
      { startDate: "27daysAgo", endDate: "today" },
      { startDate: "55daysAgo", endDate: "28daysAgo" },
    ]);
  });

  it("reads 24 h as today plus yesterday, against the two days before", () => {
    expect(dateRangesFor("1", true)).toEqual([
      { startDate: "1daysAgo", endDate: "today" },
      { startDate: "3daysAgo", endDate: "2daysAgo" },
    ]);
  });
});

describe("foldRows", () => {
  it("puts date_range_1 beside date_range_0 and sorts by the current value", () => {
    const rows = foldRows(
      {
        rows: [
          { dimensionValues: [{ value: "/en" }, { value: "date_range_0" }], metricValues: [{ value: "10" }] },
          { dimensionValues: [{ value: "/en" }, { value: "date_range_1" }], metricValues: [{ value: "4" }] },
          { dimensionValues: [{ value: "/th" }, { value: "date_range_0" }], metricValues: [{ value: "20" }] },
        ],
      },
      true,
    );
    expect(rows).toEqual([
      { key: "/th", value: 20, previous: 0 },
      { key: "/en", value: 10, previous: 4 },
    ]);
  });
});
