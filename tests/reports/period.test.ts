/**
 * tests/reports/period.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Month boundaries, which are the quietest way for a report to be wrong.
 *
 * Every figure in the monthly report is a count between two instants. Get
 * the instants wrong by a day and nothing looks broken — the report still
 * renders, the numbers are still plausible, and they are simply not the
 * numbers for the month printed on the cover.
 *
 * The cases below are the ones that decide a boundary: the turn of the
 * year, the exclusive end, a date that does not exist, and a comparison
 * window that must match the period's own length.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it } from "vitest";
import {
  customPeriod,
  lastCoveredDay,
  lastMonth,
  lastQuarter,
  precedingPeriod,
  resolvePeriod,
  thisMonth,
} from "@/lib/reports/period";

const iso = (date: Date) => date.toISOString();

describe("lastMonth", () => {
  it("covers the whole previous month, end exclusive", () => {
    const period = lastMonth(new Date("2026-09-26T13:00:00Z"));
    expect(iso(period.start)).toBe("2026-08-01T00:00:00.000Z");
    expect(iso(period.end)).toBe("2026-09-01T00:00:00.000Z");
  });

  it("crosses the turn of the year", () => {
    const period = lastMonth(new Date("2026-01-03T00:00:00Z"));
    expect(iso(period.start)).toBe("2025-12-01T00:00:00.000Z");
    expect(iso(period.end)).toBe("2026-01-01T00:00:00.000Z");
  });

  it("files its note under the month it covers, not the month it is run in", () => {
    const period = lastMonth(new Date("2026-09-01T08:00:00Z"));
    expect(iso(period.noteKey)).toBe("2026-08-01T00:00:00.000Z");
  });

  it("handles February in a leap year without inventing a day", () => {
    const period = lastMonth(new Date("2024-03-05T00:00:00Z"));
    expect(iso(period.start)).toBe("2024-02-01T00:00:00.000Z");
    expect(iso(period.end)).toBe("2024-03-01T00:00:00.000Z");
    expect(iso(lastCoveredDay(period))).toBe("2024-02-29T00:00:00.000Z");
  });
});

describe("thisMonth", () => {
  it("runs from the 1st to the 1st of the next month", () => {
    const period = thisMonth(new Date("2026-09-26T13:00:00Z"));
    expect(iso(period.start)).toBe("2026-09-01T00:00:00.000Z");
    expect(iso(period.end)).toBe("2026-10-01T00:00:00.000Z");
  });

  it("rolls the year over in December", () => {
    const period = thisMonth(new Date("2026-12-15T00:00:00Z"));
    expect(iso(period.end)).toBe("2027-01-01T00:00:00.000Z");
  });
});

describe("lastQuarter", () => {
  it("is Q2 when run in Q3", () => {
    const period = lastQuarter(new Date("2026-09-26T00:00:00Z"));
    expect(iso(period.start)).toBe("2026-04-01T00:00:00.000Z");
    expect(iso(period.end)).toBe("2026-07-01T00:00:00.000Z");
  });

  it("is the previous year's Q4 when run in Q1", () => {
    // The wrap a `(quarter - 1) * 3` month index handles only because
    // Date.UTC accepts a negative month; asserted so a later "tidy-up"
    // cannot break it silently.
    const period = lastQuarter(new Date("2026-02-10T00:00:00Z"));
    expect(iso(period.start)).toBe("2025-10-01T00:00:00.000Z");
    expect(iso(period.end)).toBe("2026-01-01T00:00:00.000Z");
  });

  it("files its note under the quarter's first month", () => {
    const period = lastQuarter(new Date("2026-09-26T00:00:00Z"));
    expect(iso(period.noteKey)).toBe("2026-04-01T00:00:00.000Z");
  });
});

describe("customPeriod", () => {
  it("treats the given end day as included", () => {
    // A person picking "31 August" means the whole of the 31st. The stored
    // end is therefore 1 September, exclusive.
    const period = customPeriod("2026-08-01", "2026-08-31");
    expect(iso(period!.start)).toBe("2026-08-01T00:00:00.000Z");
    expect(iso(period!.end)).toBe("2026-09-01T00:00:00.000Z");
    expect(iso(lastCoveredDay(period!))).toBe("2026-08-31T00:00:00.000Z");
  });

  it("accepts a single day", () => {
    const period = customPeriod("2026-08-04", "2026-08-04");
    expect(iso(period!.start)).toBe("2026-08-04T00:00:00.000Z");
    expect(iso(period!.end)).toBe("2026-08-05T00:00:00.000Z");
  });

  it("refuses a reversed range rather than swapping it", () => {
    expect(customPeriod("2026-08-31", "2026-08-01")).toBeNull();
  });

  it("refuses a date that does not exist", () => {
    // Date would roll 31 February forward to 3 March and report a period
    // nobody asked for.
    expect(customPeriod("2026-02-31", "2026-03-05")).toBeNull();
    expect(customPeriod("2026-13-01", "2026-13-05")).toBeNull();
  });

  it("refuses anything that is not yyyy-mm-dd", () => {
    for (const bad of [
      "01/08/2026",
      "2026-8-1",
      "",
      "yesterday",
      "2026-08-01T00:00:00Z",
    ]) {
      expect(customPeriod(bad, "2026-08-31"), bad).toBeNull();
    }
  });
});

describe("resolvePeriod", () => {
  const now = new Date("2026-09-26T13:00:00Z");

  it("defaults to last month", () => {
    expect(iso(resolvePeriod({}, now).start)).toBe("2026-08-01T00:00:00.000Z");
  });

  it("falls back to last month when a custom range is unusable", () => {
    // Rather than rendering nothing: a broken query string should still
    // produce the report somebody was most likely after.
    const period = resolvePeriod(
      { period: "custom", from: "nonsense", to: "2026-08-31" },
      now,
    );
    expect(period.kind).toBe("lastMonth");
  });

  it("ignores an unknown period name", () => {
    expect(resolvePeriod({ period: "since-forever" }, now).kind).toBe(
      "lastMonth",
    );
  });
});

describe("precedingPeriod", () => {
  it("compares a month against the calendar month before it", () => {
    const previous = precedingPeriod(
      lastMonth(new Date("2026-09-26T00:00:00Z")),
    );
    expect(iso(previous.start)).toBe("2026-07-01T00:00:00.000Z");
    expect(iso(previous.end)).toBe("2026-08-01T00:00:00.000Z");
  });

  it("lands on February for a March report, not on late January", () => {
    // The case that makes "subtract the period's length" wrong: 31 days
    // before 1 March is 29 January, so the comparison would be three days
    // of January plus most of February, labelled "February".
    const march = {
      kind: "lastMonth",
      start: new Date(Date.UTC(2026, 2, 1)),
      end: new Date(Date.UTC(2026, 3, 1)),
      noteKey: new Date(Date.UTC(2026, 2, 1)),
    } as const;
    const previous = precedingPeriod(march);
    expect(iso(previous.start)).toBe("2026-02-01T00:00:00.000Z");
    expect(iso(previous.end)).toBe("2026-03-01T00:00:00.000Z");
  });

  it("compares a quarter against the quarter before it", () => {
    const previous = precedingPeriod(
      lastQuarter(new Date("2026-09-26T00:00:00Z")),
    );
    expect(iso(previous.start)).toBe("2026-01-01T00:00:00.000Z");
    expect(iso(previous.end)).toBe("2026-04-01T00:00:00.000Z");
  });

  it("matches the period's own length for a custom range", () => {
    // Eleven days must be compared against eleven days. Against a whole
    // month it would show a 60% collapse that means nothing.
    const period = customPeriod("2026-08-01", "2026-08-11")!;
    const previous = precedingPeriod(period);

    expect(previous.end.getTime()).toBe(period.start.getTime());
    expect(previous.end.getTime() - previous.start.getTime()).toBe(
      period.end.getTime() - period.start.getTime(),
    );
  });
});
