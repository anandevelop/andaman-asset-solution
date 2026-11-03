/**
 * tests/pagespeed.test.ts — lib/pagespeed/parse.ts and limits.ts: reading
 * Google's answer, which links may be tested, and the brakes' clock.
 */

import { describe, expect, it } from "vitest";
import { opportunitiesFrom, parsePsi, pathFromPastedUrl, scoreBand } from "@/lib/pagespeed/parse";
import { SCAN_COOLDOWN_MS, scanBlocked, startOfDayBangkok, type ScanState } from "@/lib/pagespeed/limits";

const SAMPLE = {
  lighthouseResult: {
    categories: {
      performance: { score: 0.874 },
      accessibility: { score: 0.96 },
      "best-practices": { score: 1 },
      seo: { score: null },
    },
    audits: {
      "first-contentful-paint": { numericValue: 1812.4 },
      "largest-contentful-paint": { numericValue: 2650.6 },
      "total-blocking-time": { numericValue: 180 },
      "speed-index": { numericValue: 3400 },
      "server-response-time": { numericValue: 120.2 },
      "cumulative-layout-shift": { numericValue: 0.0213 },
      "total-byte-weight": { numericValue: 3_355_443 },
      "uses-optimized-images": { title: "Serve smaller images", score: 0.3, details: { type: "opportunity", overallSavingsMs: 2400 } },
      "unused-javascript": { title: "Reduce unused JavaScript", score: 0.5, details: { type: "opportunity", overallSavingsMs: 600 } },
      "unsized-images": { title: "Set image sizes", score: 0, metricSavings: { CLS: 0.1 } },
      "passing-audit": { title: "Fine", score: 1, details: { overallSavingsMs: 900 } },
      "informative": { title: "Info", score: null, details: { overallSavingsMs: 900 } },
    },
  },
  loadingExperience: {
    overall_category: "AVERAGE",
    metrics: {
      LARGEST_CONTENTFUL_PAINT_MS: {
        percentile: 2100,
        category: "FAST",
        distributions: [{ proportion: 0.82 }, { proportion: 0.13 }, { proportion: 0.05 }],
      },
      CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: 14, category: "AVERAGE", distributions: [] },
    },
  },
};

describe("parsePsi", () => {
  const run = parsePsi(SAMPLE);

  it("turns category scores into 0–100", () => {
    expect([run.performance, run.accessibility, run.bestPractices, run.seo]).toEqual([87, 96, 100, null]);
  });

  it("keeps lab metrics in whole ms, CLS x1000", () => {
    expect(run.fcpMs).toBe(1812);
    expect(run.lcpMs).toBe(2651);
    expect(run.ttfbMs).toBe(120);
    expect(run.cls).toBe(21);
    expect(run.pageBytes).toBe(3_355_443);
  });

  it("reads CrUX field data for the URL, CLS back from x100", () => {
    expect(run.field?.scope).toBe("url");
    expect(run.field?.overall).toBe("AVERAGE");
    expect(run.field?.metrics.lcp).toEqual({ p75: 2100, category: "FAST", good: 0.82, ni: 0.13, poor: 0.05 });
    expect(run.field?.metrics.cls?.p75).toBe(0.14);
  });

  it("falls back to the whole origin when the page has no field data", () => {
    const origin = parsePsi({ ...SAMPLE, loadingExperience: {}, originLoadingExperience: SAMPLE.loadingExperience });
    expect(origin.field?.scope).toBe("origin");
  });

  it("returns no field data rather than an empty shell", () => {
    expect(parsePsi({ lighthouseResult: SAMPLE.lighthouseResult }).field).toBeNull();
  });
});

describe("opportunitiesFrom", () => {
  it("lists failing audits that save time, worst first, and CLS fixes last", () => {
    expect(opportunitiesFrom(SAMPLE.lighthouseResult.audits).map((o) => o.id)).toEqual([
      "uses-optimized-images",
      "unused-javascript",
      "unsized-images",
    ]);
  });
});

describe("scoreBand", () => {
  it("uses Google's bands", () => {
    expect([scoreBand(90), scoreBand(89), scoreBand(50), scoreBand(49), scoreBand(null)]).toEqual(["good", "ni", "ni", "poor", "none"]);
  });
});

describe("pathFromPastedUrl", () => {
  const site = "https://andamanassetsolution.com";
  it("accepts our own pages, with or without www, scheme or trailing slash", () => {
    expect(pathFromPastedUrl("https://andamanassetsolution.com/th/news/abc/", site)).toBe("/th/news/abc");
    expect(pathFromPastedUrl("www.andamanassetsolution.com/en?x=1#y", site)).toBe("/en");
    expect(pathFromPastedUrl("/th/projects", site)).toBe("/th/projects");
  });
  it("refuses other sites, the back office and the API", () => {
    expect(pathFromPastedUrl("https://example.com/th", site)).toBeNull();
    expect(pathFromPastedUrl("https://andamanassetsolution.com.evil.com/th", site)).toBeNull();
    expect(pathFromPastedUrl("https://andamanassetsolution.com/th/admin/seo", site)).toBeNull();
    expect(pathFromPastedUrl("https://andamanassetsolution.com/api/health", site)).toBeNull();
    expect(pathFromPastedUrl("javascript:alert(1)", site)).toBeNull();
    expect(pathFromPastedUrl("   ", site)).toBeNull();
  });
});

describe("scanBlocked", () => {
  const now = Date.parse("2026-11-03T10:00:00Z");
  const state = (startedMinAgo: number, finishedMinAgo: number | null): ScanState => ({
    startedAt: new Date(now - startedMinAgo * 60_000).toISOString(),
    finishedAt: finishedMinAgo === null ? null : new Date(now - finishedMinAgo * 60_000).toISOString(),
    total: 16,
    done: 0,
    failed: 0,
    source: "manual",
  });

  it("lets the first scan start", () => {
    expect(scanBlocked(null, "manual", now)).toBeNull();
  });
  it("blocks everyone while a scan runs", () => {
    expect(scanBlocked(state(2, null), "manual", now)?.reason).toBe("RUNNING");
    expect(scanBlocked(state(2, null), "scheduled", now)?.reason).toBe("RUNNING");
  });
  it("treats a scan stuck for half an hour as crashed", () => {
    expect(scanBlocked(state(31, null), "manual", now)).toBeNull();
  });
  it("cools manual starts down for ten minutes, not the schedule", () => {
    const recent = state(6, 3);
    expect(scanBlocked(recent, "manual", now)).toEqual({
      reason: "COOLDOWN",
      until: new Date(now - 3 * 60_000 + SCAN_COOLDOWN_MS).toISOString(),
    });
    expect(scanBlocked(recent, "scheduled", now)).toBeNull();
    expect(scanBlocked(state(15, 11), "manual", now)).toBeNull();
  });
});

describe("startOfDayBangkok", () => {
  it("is 17:00 UTC the day before", () => {
    expect(startOfDayBangkok(new Date("2026-11-03T16:59:00Z")).toISOString()).toBe("2026-11-02T17:00:00.000Z");
    expect(startOfDayBangkok(new Date("2026-11-03T17:00:00Z")).toISOString()).toBe("2026-11-03T17:00:00.000Z");
  });
});
