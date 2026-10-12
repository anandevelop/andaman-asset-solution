/**
 * tests/about-stats.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The About stat bar: counted by default, overridable per figure
 * (lib/about-stats.ts). An override has to win and a blank one has to
 * count, or the admin's "leave blank to count it" would be a lie.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it } from "vitest";
import { countedAboutStats, resolveAboutStats } from "@/lib/about-stats";
import { COMPANY_FOUNDED_YEAR } from "@/content/company-timeline";

const projects = [
  { totalUnits: 20, landAreaSqm: 10_000.4 },
  { totalUnits: null, landAreaSqm: 2_500 },
  { totalUnits: 12, landAreaSqm: null },
];
const now = new Date("2026-10-12T00:00:00Z");

describe("countedAboutStats", () => {
  it("counts projects, units and land from the published projects", () => {
    const counted = countedAboutStats("en", projects, 2005, now);
    expect(counted.projects).toBe("3");
    expect(counted.units).toBe("32");
    expect(counted.landArea).toBe("12,500");
  });

  it("counts years from the founding year set in the admin", () => {
    expect(countedAboutStats("en", projects, 2010, now).years).toBe("16+");
  });

  it("falls back to COMPANY_FOUNDED_YEAR when none is set", () => {
    const expected = `${now.getFullYear() - COMPANY_FOUNDED_YEAR}+`;
    expect(countedAboutStats("en", projects, null, now).years).toBe(expected);
  });
});

describe("resolveAboutStats", () => {
  const counted = countedAboutStats("en", projects, 2005, now);

  it("shows a typed figure exactly as typed", () => {
    const shown = resolveAboutStats(counted, { units: "1,200+", years: "20+" });
    expect(shown.units).toBe("1,200+");
    expect(shown.years).toBe("20+");
    expect(shown.projects).toBe(counted.projects);
  });

  it("treats a blank or whitespace override as no override", () => {
    expect(resolveAboutStats(counted, { projects: "", landArea: "   " })).toEqual(counted);
  });
});
