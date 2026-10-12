/**
 * tests/executive-report.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The ▲/▼ on the executive report's figures (lib/reports/executive.ts).
 * A change against a zero month has no meaning, and a "+∞%" in a report to
 * the board would be worse than no arrow at all.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const { changePercent } = await import("@/lib/reports/executive");

describe("changePercent", () => {
  it("is the rounded change against the previous period", () => {
    expect(changePercent({ current: 150, previous: 100 })).toBe(50);
    expect(changePercent({ current: 2, previous: 3 })).toBe(-33);
    expect(changePercent({ current: 4, previous: 4 })).toBe(0);
  });

  it("is null when the previous period had nothing to compare against", () => {
    expect(changePercent({ current: 110, previous: 0 })).toBeNull();
  });
});
