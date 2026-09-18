/**
 * tests/land-area.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The rai/ngan/wah conversion behind the Units page's "ที่ดิน" column.
 * The ratios are exact and defined, so these are arithmetic assertions,
 * not approximations — a wrong one misstates a plot size against a deed.
 */

import { describe, it, expect } from "vitest";
import { formatLandArea } from "@/lib/land-area";

const TH = { rai: "ไร่", ngan: "งาน", wa: "ตร.ว.", sqm: "ตร.ม." };
const EN = { rai: "rai", ngan: "ngan", wa: "sq.wah", sqm: "sq.m." };

describe("formatLandArea", () => {
  it("splits square metres into ngan and wah for Thai", () => {
    // 496 m² = 124 wah = 1 ngan 24 wah — the mockup's own V-07 figure.
    expect(formatLandArea("th", 496, TH)).toBe("1 งาน 24 ตร.ว.");
  });

  it("carries into rai at 1,600 m²", () => {
    expect(formatLandArea("th", 1600, TH)).toBe("1 ไร่");
    expect(formatLandArea("th", 2000, TH)).toBe("1 ไร่ 1 งาน");
  });

  it("omits empty components rather than printing zeros", () => {
    expect(formatLandArea("th", 400, TH)).toBe("1 งาน");
    expect(formatLandArea("th", 192, TH)).toBe("48 ตร.ว.");
  });

  it("keeps a fractional wah remainder", () => {
    expect(formatLandArea("th", 498, TH)).toBe("1 งาน 24.5 ตร.ว.");
  });

  it("leaves every other locale in square metres", () => {
    expect(formatLandArea("en", 496, EN)).toBe("496 sq.m.");
    expect(formatLandArea("ru", 496, EN)).toBe("496 sq.m.");
  });

  it("falls back to square metres below one wah", () => {
    expect(formatLandArea("th", 2, TH)).toBe("2 ตร.ม.");
  });
});
