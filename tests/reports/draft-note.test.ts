/**
 * tests/reports/draft-note.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * What the system proposes when nobody has written the month's note.
 *
 * The draft goes out under the company's name if nobody edits it, so the
 * rules that matter are the ones about restraint: never more than three
 * items, never a recommendation drawn from a figure too thin to trust, and
 * never silence about the half of the picture that is missing.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it } from "vitest";
import { draftNote } from "@/lib/reports/draft-note";
import type {
  ReportData,
  ReportRow,
  ReportVital,
} from "@/lib/reports/seo-report";
import { lastMonth } from "@/lib/reports/period";

function vital(overrides: Partial<ReportVital>): ReportVital {
  return {
    metric: "LCP",
    value: 1800,
    rating: "good",
    sampleCount: 1000,
    enoughSamples: true,
    ...overrides,
  } as ReportVital;
}

function row(overrides: Partial<ReportRow>): ReportRow {
  return {
    key: "p1",
    name: "Trinity Village",
    googleClicks: { available: false, reason: "google" },
    googleLeads: 0,
    allLeads: 0,
    rate: null,
    ...overrides,
  } as ReportRow;
}

function data(overrides: Partial<ReportData> = {}): ReportData {
  const period = lastMonth(new Date("2026-09-15T00:00:00Z"));

  return {
    period,
    coversUntil: new Date("2026-08-31T00:00:00Z"),
    countedSince: new Date("2026-08-01T00:00:00Z"),
    leads: { current: { google: 0, all: 0 }, previous: { google: 0, all: 0 } },
    audit: { score: 78, previous: 74, runAt: new Date("2026-08-31T00:00:00Z") },
    topIssues: [],
    vitals: [],
    rows: [],
    search: { available: false, reason: "google" },
    indexing: { available: false, reason: "google" },
    note: { body: "", isDraft: true, editedBy: null, updatedAt: null },
    ...overrides,
  } as ReportData;
}

describe("draftNote", () => {
  it("never proposes more than three things", () => {
    const items = draftNote(
      data({
        vitals: [vital({ metric: "LCP", value: 5200, rating: "poor" })],
        topIssues: [
          { rule: "meta-description", urlCount: 37 },
          { rule: "hreflang", urlCount: 22 },
        ],
        rows: [row({ googleLeads: 6, allLeads: 11 })],
      }),
    );

    expect(items.length).toBeLessThanOrEqual(3);
  });

  it("leads with the worst Core Web Vital", () => {
    const items = draftNote(
      data({
        vitals: [
          vital({ metric: "INP", value: 300, rating: "needsImprovement" }),
          vital({ metric: "LCP", value: 5200, rating: "poor" }),
        ],
      }),
    );

    // Poor before needs-improvement: one of them is costing rankings now.
    expect(items[0]).toMatchObject({ key: "vitalsPoor", metric: "LCP" });
  });

  it("ignores a vital with too few samples to judge", () => {
    // A p75 over nine visits is not evidence, and a recommendation built
    // on one is worse than no recommendation.
    const items = draftNote(
      data({
        vitals: [
          vital({
            metric: "LCP",
            value: 6000,
            rating: "poor",
            enoughSamples: false,
          }),
        ],
      }),
    );

    expect(items.some((item) => item.key === "vitalsPoor")).toBe(false);
  });

  it("says nothing about a vital that is fine", () => {
    const items = draftNote(
      data({ vitals: [vital({ metric: "LCP", value: 1200 })] }),
    );
    expect(items.some((item) => item.key === "vitalsPoor")).toBe(false);
  });

  it("names the rule failing on the most pages", () => {
    const items = draftNote(
      data({
        topIssues: [
          { rule: "meta-description", urlCount: 37 },
          { rule: "hreflang", urlCount: 22 },
        ],
      }),
    );

    expect(items).toContainEqual({
      key: "auditIssue",
      rule: "meta-description",
      count: 37,
    });
  });

  it("celebrates the development that earned the most search leads", () => {
    const items = draftNote(
      data({
        rows: [row({ name: "Trinity Village", googleLeads: 6, allLeads: 11 })],
      }),
    );

    expect(items).toContainEqual({
      key: "topProject",
      project: "Trinity Village",
      leads: 6,
    });
  });

  it("points at a development with leads but none from search", () => {
    const items = draftNote(
      data({ rows: [row({ name: "Victory", googleLeads: 0, allLeads: 4 })] }),
    );

    expect(items).toContainEqual({ key: "noGoogleLeads", project: "Victory" });
  });

  it("stays quiet about search when there were no leads at all", () => {
    // With nothing coming in from anywhere, "no leads from Google" is a
    // distraction from a different and larger problem.
    const items = draftNote(
      data({ rows: [row({ googleLeads: 0, allLeads: 0 })] }),
    );
    expect(items.some((item) => item.key === "noGoogleLeads")).toBe(false);
  });

  it("always admits that Search Console is missing", () => {
    // Otherwise a short list reads as "nothing to do" when half the
    // picture simply is not connected.
    expect(draftNote(data())).toContainEqual({ key: "notConnected" });
  });

  it("drops the missing-Google note rather than exceed three items", () => {
    const items = draftNote(
      data({
        vitals: [vital({ metric: "LCP", value: 5200, rating: "poor" })],
        topIssues: [{ rule: "meta-description", urlCount: 37 }],
        rows: [row({ googleLeads: 6, allLeads: 11 })],
      }),
    );

    expect(items).toHaveLength(3);
    expect(items.some((item) => item.key === "notConnected")).toBe(false);
  });

  it("formats each metric in the unit its threshold is quoted in", () => {
    const lcp = draftNote(
      data({ vitals: [vital({ metric: "LCP", value: 5200, rating: "poor" })] }),
    );
    expect(lcp[0]).toMatchObject({ value: "5.20 s" });

    const inp = draftNote(
      data({ vitals: [vital({ metric: "INP", value: 620, rating: "poor" })] }),
    );
    expect(inp[0]).toMatchObject({ value: "620 ms" });

    // Stored x1000, shown as the real score.
    const cls = draftNote(
      data({ vitals: [vital({ metric: "CLS", value: 300, rating: "poor" })] }),
    );
    expect(cls[0]).toMatchObject({ value: "0.30" });
  });
});
