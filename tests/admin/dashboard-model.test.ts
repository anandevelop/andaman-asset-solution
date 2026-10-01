/**
 * tests/admin/dashboard-model.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The rules behind "งานวันนี้" that decide what somebody is told to do
 * first — lib/admin/dashboard-model.ts, which is pure so these need no
 * database.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it } from "vitest";
import {
  FUNNEL_STAGES,
  ageParts,
  dailySeries,
  inboxCounts,
  rankDelta,
  sortInbox,
  type InboxItem,
} from "@/lib/admin/dashboard-model";

const item = (key: string, kind: InboxItem["kind"], since: string | null): InboxItem => ({
  key,
  kind,
  id: key,
  title: key,
  detail: null,
  since,
  ageLabel: null,
  late: false,
  href: null,
});

describe("sortInbox", () => {
  it("puts the longest wait first", () => {
    const sorted = sortInbox([
      item("b", "lead", "2026-09-29T10:00:00.000Z"),
      item("a", "appointment", "2026-09-28T10:00:00.000Z"),
      item("c", "lead", "2026-09-30T01:00:00.000Z"),
    ]);
    expect(sorted.map((row) => row.key)).toEqual(["a", "b", "c"]);
  });

  it("puts undated content gaps after every customer who is waiting", () => {
    // A missing Thai FAQ answer has waited for nobody; a lead has.
    const sorted = sortInbox([
      item("gap", "content", null),
      item("lead", "lead", "2026-09-30T09:00:00.000Z"),
    ]);
    expect(sorted.map((row) => row.key)).toEqual(["lead", "gap"]);
  });

  it("is stable for equal times", () => {
    const at = "2026-09-30T09:00:00.000Z";
    expect(sortInbox([item("z", "lead", at), item("m", "lead", at)]).map((row) => row.key)).toEqual(["m", "z"]);
  });

  it("does not mutate its input", () => {
    const input = [item("b", "lead", "2026-09-30T00:00:00.000Z"), item("a", "lead", "2026-09-29T00:00:00.000Z")];
    sortInbox(input);
    expect(input.map((row) => row.key)).toEqual(["b", "a"]);
  });
});

describe("inboxCounts", () => {
  it("counts per kind and in total", () => {
    expect(inboxCounts([item("1", "lead", null), item("2", "lead", null), item("3", "content", null)])).toEqual({
      all: 3,
      lead: 2,
      appointment: 0,
      content: 1,
    });
  });
});

describe("dailySeries", () => {
  const now = new Date("2026-09-30T15:00:00.000Z");

  it("zero-fills the days with no rows", () => {
    /* A line drawn only through the days that had data joins Monday to
       Thursday and hides the dead days between — the one shape a trend
       line must not lie about. */
    const series = dailySeries(
      [
        { day: new Date("2026-09-27T08:00:00.000Z"), count: 2 },
        { day: new Date("2026-09-30T01:00:00.000Z"), count: 1 },
      ],
      5,
      now,
    );
    expect(series).toEqual([0, 2, 0, 0, 1]);
  });

  it("adds rows that fall on the same day", () => {
    const day = new Date("2026-09-30T02:00:00.000Z");
    expect(dailySeries([{ day, count: 1 }, { day, count: 1 }], 1, now)).toEqual([2]);
  });

  it("drops rows outside the window", () => {
    expect(dailySeries([{ day: new Date("2026-08-01T00:00:00.000Z"), count: 9 }], 3, now)).toEqual([0, 0, 0]);
  });
});

describe("rankDelta", () => {
  it("is positive when the keyword climbed", () => {
    expect(rankDelta(5, 8)).toBe(3);
    expect(rankDelta(8, 5)).toBe(-3);
  });

  it("is null, not zero, with nothing to compare against", () => {
    expect(rankDelta(5, null)).toBeNull();
  });
});

describe("ageParts", () => {
  const now = new Date("2026-09-30T12:00:00.000Z");

  it("uses the natural unit", () => {
    expect(ageParts(new Date("2026-09-30T11:35:00.000Z"), now)).toEqual({ unit: "minute", value: 25 });
    expect(ageParts(new Date("2026-09-29T12:00:00.000Z"), now)).toEqual({ unit: "hour", value: 24 });
    expect(ageParts(new Date("2026-09-27T12:00:00.000Z"), now)).toEqual({ unit: "day", value: 3 });
  });

  it("never goes negative for a time in the future", () => {
    expect(ageParts(new Date("2026-09-30T13:00:00.000Z"), now)).toEqual({ unit: "minute", value: 0 });
  });
});

describe("FUNNEL_STAGES", () => {
  it("runs NEW to WON and leaves LOST out", () => {
    expect(FUNNEL_STAGES[0]).toBe("NEW");
    expect(FUNNEL_STAGES.at(-1)).toBe("WON");
    expect(FUNNEL_STAGES).not.toContain("LOST");
  });
});
