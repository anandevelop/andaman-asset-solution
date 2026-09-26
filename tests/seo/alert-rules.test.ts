/**
 * tests/seo/alert-rules.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The boundaries an alert rule is judged on.
 *
 * An alert that fires one day early gets switched off, and a switched-off
 * alert is worse than none — everybody still believes it is watching. So
 * the cases here are the edges: exactly at the threshold, one past it, a
 * previous value of zero, and the "already broken, got slightly worse"
 * shape that must stay quiet.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it } from "vitest";
import {
  ALERT_THRESHOLDS,
  clicksDropped,
  indexDropped,
  notFoundSpikes,
  vitalsRegressions,
  type VitalsSnapshot,
} from "@/lib/seo/alert-rules";

const day = new Date("2026-09-25T00:00:00Z");

describe("notFoundSpikes", () => {
  it("fires above the threshold and not at it", () => {
    const rows = [
      { path: "/old-page", hits: ALERT_THRESHOLDS.notFoundHitsPerPath, day },
      { path: "/gone", hits: ALERT_THRESHOLDS.notFoundHitsPerPath + 1, day },
    ];

    const fired = notFoundSpikes(rows);
    expect(fired).toHaveLength(1);
    expect(fired[0].payload.path).toBe("/gone");
  });

  it("raises one alert per path, worst first", () => {
    // A single "12 paths are 404ing" tells nobody which to fix.
    const rows = [
      { path: "/a", hits: 60, day },
      { path: "/b", hits: 400, day },
      { path: "/c", hits: 51, day },
    ];

    expect(notFoundSpikes(rows).map((a) => a.payload.path)).toEqual([
      "/b",
      "/a",
      "/c",
    ]);
  });

  it("carries the numbers it judged on into the payload", () => {
    // So an alert read months later can be checked without re-deriving it.
    const [alert] = notFoundSpikes([{ path: "/gone", hits: 99, day }]);
    expect(alert.payload).toMatchObject({
      path: "/gone",
      hits: 99,
      day: "2026-09-25",
      threshold: ALERT_THRESHOLDS.notFoundHitsPerPath,
    });
  });

  it("says nothing when every path is below the line", () => {
    expect(notFoundSpikes([{ path: "/x", hits: 3, day }])).toEqual([]);
  });
});

describe("vitalsRegressions", () => {
  const snap = (
    metric: string,
    value: number,
    sampleCount = 500,
  ): VitalsSnapshot => ({ metric, value, sampleCount }) as VitalsSnapshot;

  it("fires when a metric crosses out of good", () => {
    // LCP 2.4s → 3.2s: good to needs-improvement, which is the moment a
    // deploy cost something and the cheapest moment to look at the diff.
    const fired = vitalsRegressions(
      [snap("LCP", 2400)],
      [snap("LCP", 3200)],
      200,
      "abc1234",
    );

    expect(fired).toHaveLength(1);
    expect(fired[0].kind).toBe("VITALS_REGRESSION");
    expect(fired[0].payload).toMatchObject({
      metric: "LCP",
      before: 2400,
      after: 3200,
    });
  });

  it("stays quiet when something already bad gets slightly worse", () => {
    // A nightly repeat of a known problem is what teaches people to filter
    // the alert into a folder.
    expect(
      vitalsRegressions([snap("LCP", 5000)], [snap("LCP", 5600)], 200, null),
    ).toEqual([]);
  });

  it("stays quiet when a metric improves or stays good", () => {
    expect(
      vitalsRegressions([snap("LCP", 2400)], [snap("LCP", 1800)], 200, null),
    ).toEqual([]);
    expect(
      vitalsRegressions([snap("CLS", 50)], [snap("CLS", 90)], 200, null),
    ).toEqual([]);
  });

  it("refuses to judge on too few samples, on either side", () => {
    // A deploy at a quiet hour otherwise compares nine visits against the
    // week before and alerts on noise.
    expect(
      vitalsRegressions([snap("LCP", 2400, 9)], [snap("LCP", 4000)], 200, null),
    ).toEqual([]);
    expect(
      vitalsRegressions([snap("LCP", 2400)], [snap("LCP", 4000, 9)], 200, null),
    ).toEqual([]);
  });

  it("ignores a metric with nothing to compare against", () => {
    expect(vitalsRegressions([], [snap("INP", 600)], 200, null)).toEqual([]);
  });

  it("judges each metric separately", () => {
    const fired = vitalsRegressions(
      [snap("LCP", 2400), snap("INP", 150)],
      [snap("LCP", 2400), snap("INP", 620)],
      200,
      null,
    );

    expect(fired.map((a) => a.payload.metric)).toEqual(["INP"]);
  });

  it("reads CLS in stored units, not real ones", () => {
    // 80 → 300 is 0.08 → 0.30: good to poor. Judged against the same
    // scaled thresholds the column stores.
    const fired = vitalsRegressions(
      [snap("CLS", 80)],
      [snap("CLS", 300)],
      200,
      null,
    );
    expect(fired).toHaveLength(1);
    expect(fired[0].payload.rating).toBe("poor");
  });
});

describe("clicksDropped", () => {
  it("fires past the threshold and not at it", () => {
    // 100 → 75 is exactly 25% and must not fire; 74 is 26% and must.
    expect(clicksDropped(75, 100)).toBe(false);
    expect(clicksDropped(74, 100)).toBe(true);
  });

  it("never fires against a previous week of zero", () => {
    // There is no percentage fall from nothing, and dividing by it would
    // claim an infinite drop in the first week after a launch.
    expect(clicksDropped(0, 0)).toBe(false);
    expect(clicksDropped(50, 0)).toBe(false);
  });

  it("does not fire on a rise", () => {
    expect(clicksDropped(200, 100)).toBe(false);
  });
});

describe("indexDropped", () => {
  it("fires above three URLs, not at three", () => {
    expect(indexDropped(ALERT_THRESHOLDS.indexDropUrls)).toBe(false);
    expect(indexDropped(ALERT_THRESHOLDS.indexDropUrls + 1)).toBe(true);
  });
});
