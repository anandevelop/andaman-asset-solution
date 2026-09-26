/**
 * tests/analytics/vitals.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The arithmetic behind the Core Web Vitals tab.
 *
 * Every figure on that screen is a percentile with a colour and a word
 * attached, and each of the three steps has a way of being quietly wrong: a
 * percentile that interpolates between samples reports a number no visitor
 * experienced, a threshold that excludes its boundary calls Google's own
 * "good" a failure, and CLS stored unscaled truncates to 0 in an integer
 * column. None of those fail loudly — they produce a plausible dashboard.
 *
 * MIN_SAMPLES and MAX_STORED are asserted as the exact numbers they are,
 * not "greater than zero": both are judgement calls that the panel's copy
 * and the API's clamp are written around, and a change to either should
 * have to come through this file.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it } from "vitest";
import {
  CLS_SCALE,
  MAX_STORED,
  MIN_SAMPLES,
  VITAL_THRESHOLDS,
  deviceOf,
  displayValue,
  p75,
  rateVital,
  storedValue,
  type VitalKey,
} from "@/lib/analytics/vitals";

describe("p75", () => {
  it("returns a value that actually occurred, not an interpolation", () => {
    // Nearest-rank over 1..100 is the 75th value. An interpolated
    // percentile would give 75.25 here — a figure no visit produced.
    const values = Array.from({ length: 100 }, (_, index) => index + 1);
    expect(p75(values)).toBe(75);
  });

  it("is one of the inputs for every length from 1 to 40", () => {
    for (let length = 1; length <= 40; length += 1) {
      const values = Array.from({ length }, (_, index) => (index + 1) * 7);
      expect(values).toContain(p75(values));
    }
  });

  it("does not depend on the order it is given", () => {
    const sorted = [10, 20, 30, 40, 50, 60, 70, 80];
    const shuffled = [50, 10, 80, 30, 70, 20, 60, 40];
    expect(p75(shuffled)).toBe(p75(sorted));
  });

  it("does not mutate its input", () => {
    const values = [300, 100, 200];
    p75(values);
    expect(values).toEqual([300, 100, 200]);
  });

  it("is the single value when there is only one", () => {
    expect(p75([1234])).toBe(1234);
  });

  it("is 0 for no samples", () => {
    // The caller guards on sampleCount; this only has to not throw.
    expect(p75([])).toBe(0);
  });

  it("sorts numerically, not as strings", () => {
    // [80, 100, 9000, 20000] lexicographically is [100, 20000, 80, 9000].
    expect(p75([9000, 80, 20000, 100])).toBe(9000);
  });
});

describe("rateVital", () => {
  const cases: [VitalKey, number, string][] = [
    ["LCP", 1200, "good"],
    ["LCP", 3000, "needsImprovement"],
    ["LCP", 6000, "poor"],
    ["INP", 120, "good"],
    ["INP", 350, "needsImprovement"],
    ["INP", 900, "poor"],
    // Stored units: 0.05, 0.18 and 0.4.
    ["CLS", 50, "good"],
    ["CLS", 180, "needsImprovement"],
    ["CLS", 400, "poor"],
    ["TTFB", 400, "good"],
    ["TTFB", 1200, "needsImprovement"],
    ["TTFB", 3000, "poor"],
  ];

  for (const [metric, value, expected] of cases) {
    it(`rates ${metric} ${value} as ${expected}`, () => {
      expect(rateVital(metric, value)).toBe(expected);
    });
  }

  it("counts the boundary as the better rating, as Google does", () => {
    for (const metric of ["LCP", "INP", "CLS", "TTFB"] as VitalKey[]) {
      const { good, poor } = VITAL_THRESHOLDS[metric];
      expect(rateVital(metric, good)).toBe("good");
      expect(rateVital(metric, good + 1)).toBe("needsImprovement");
      expect(rateVital(metric, poor)).toBe("needsImprovement");
      expect(rateVital(metric, poor + 1)).toBe("poor");
    }
  });

  it("holds CLS thresholds in the same scale the column stores", () => {
    // The trap: 0.1 and 0.25 written straight into the table would rate
    // every stored CLS as "poor", since a stored 80 is 0.08.
    expect(VITAL_THRESHOLDS.CLS.good).toBe(100);
    expect(VITAL_THRESHOLDS.CLS.poor).toBe(250);
  });
});

describe("storedValue", () => {
  it("scales CLS into the integer column and back out again", () => {
    expect(storedValue("CLS", 0.083)).toBe(83);
    expect(displayValue("CLS", 83)).toBeCloseTo(0.083, 5);
  });

  it("would lose CLS entirely without the scale", () => {
    // Guards the reason CLS_SCALE exists: rounded unscaled, a real CLS of
    // 0.083 is 0 — a perfect score for a page that visibly jumps.
    expect(Math.round(0.083)).toBe(0);
    expect(CLS_SCALE).toBe(1000);
  });

  it("rounds milliseconds to integers", () => {
    expect(storedValue("LCP", 2499.6)).toBe(2500);
    expect(storedValue("TTFB", 812.4)).toBe(812);
  });

  it("leaves millisecond metrics unscaled on the way out", () => {
    for (const metric of ["LCP", "INP", "TTFB"] as VitalKey[]) {
      expect(displayValue(metric, 1500)).toBe(1500);
    }
  });

  it("clamps an absurd sample instead of letting it move a p75", () => {
    // A tab left in the background for an hour reports an LCP like this.
    expect(storedValue("LCP", 3_600_000)).toBe(MAX_STORED);
    expect(MAX_STORED).toBe(60_000);
  });

  it("never stores a negative value", () => {
    expect(storedValue("CLS", -0.5)).toBe(0);
    expect(storedValue("INP", -1)).toBe(0);
  });
});

describe("deviceOf", () => {
  const mobile = [
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15",
    "Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 Chrome/126",
    "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15",
  ];

  const desktop = [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126",
  ];

  for (const agent of mobile) {
    it(`reads mobile from ${agent.slice(0, 40)}…`, () => {
      expect(deviceOf(agent)).toBe("mobile");
    });
  }

  for (const agent of desktop) {
    it(`reads desktop from ${agent.slice(0, 40)}…`, () => {
      expect(deviceOf(agent)).toBe("desktop");
    });
  }

  it("falls back to desktop for an absent user agent", () => {
    // A row has to land in one bucket or the other, and inventing a third
    // would mean the panel's two cards could not account for every sample.
    expect(deviceOf("")).toBe("desktop");
  });
});

describe("MIN_SAMPLES", () => {
  it("is the 200 the panel's copy is written around", () => {
    expect(MIN_SAMPLES).toBe(200);
  });
});
