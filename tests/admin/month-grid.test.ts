/**
 * tests/admin/month-grid.test.ts — the appointments month view's grid
 * (lib/admin/month-grid.ts): whole weeks, Monday first, UTC.
 */

import { describe, expect, it } from "vitest";
import { addMonths, dayKey, monthGrid, parseMonthParam, toMonthParam } from "@/lib/admin/month-grid";

describe("monthGrid", () => {
  it("starts on the Monday on or before the 1st and ends on a Sunday", () => {
    // September 2026: the 1st is a Tuesday, the 30th a Wednesday.
    const weeks = monthGrid(new Date(Date.UTC(2026, 8, 1)));
    expect(dayKey(weeks[0][0].date)).toBe("2026-08-31");
    expect(weeks[0][0].date.getUTCDay()).toBe(1);
    const lastWeek = weeks.at(-1)!;
    expect(dayKey(lastWeek[6].date)).toBe("2026-10-04");
    expect(lastWeek[6].date.getUTCDay()).toBe(0);
    expect(weeks).toHaveLength(5);
  });

  it("flags the days that belong to neighbouring months", () => {
    const days = monthGrid(new Date(Date.UTC(2026, 8, 1))).flat();
    expect(days.filter((day) => day.inMonth)).toHaveLength(30);
    expect(days[0].inMonth).toBe(false);
  });

  it("needs no leading days when the 1st is a Monday", () => {
    // June 2026 starts on a Monday.
    expect(dayKey(monthGrid(new Date(Date.UTC(2026, 5, 1)))[0][0].date)).toBe("2026-06-01");
  });

  it("is always whole weeks", () => {
    for (let month = 0; month < 12; month += 1) {
      for (const week of monthGrid(new Date(Date.UTC(2027, month, 1)))) expect(week).toHaveLength(7);
    }
  });
});

describe("the month parameter", () => {
  const now = new Date("2026-09-30T12:00:00.000Z");

  it("round-trips", () => {
    expect(toMonthParam(parseMonthParam("2026-02", now))).toBe("2026-02");
  });

  it("falls back to this month for anything else", () => {
    expect(toMonthParam(parseMonthParam(undefined, now))).toBe("2026-09");
    expect(toMonthParam(parseMonthParam("2026-13", now))).toBe("2026-09");
    expect(toMonthParam(parseMonthParam("garbage", now))).toBe("2026-09");
  });

  it("steps across a year boundary", () => {
    expect(toMonthParam(addMonths(new Date(Date.UTC(2026, 11, 1)), 1))).toBe("2027-01");
    expect(toMonthParam(addMonths(new Date(Date.UTC(2026, 0, 1)), -1))).toBe("2025-12");
  });
});
