/**
 * tests/seo/keyword-report.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * What counts as an opportunity.
 *
 * The list is only useful if it is short and every row on it is arguable.
 * A rule that admits everything produces a screen nobody opens twice, so
 * these pin the three gates — position, volume, and underperformance
 * against this site's own behaviour rather than an industry curve.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it } from "vitest";
import {
  findOpportunities,
  OPPORTUNITY_MAX_POSITION,
  OPPORTUNITY_MIN_IMPRESSIONS,
  OPPORTUNITY_MIN_POSITION,
  type QueryStat,
} from "@/lib/seo/keyword-report";

const row = (over: Partial<QueryStat>): QueryStat => ({
  query: "q",
  clicks: 50,
  impressions: 2000,
  ctr: 0.025,
  position: 8,
  ...over,
});

describe("findOpportunities", () => {
  it("ignores anything already on the first page", () => {
    // Work on a position-3 result is a different, harder job.
    const rows = [row({ query: "top", position: 3, ctr: 0.001 }), row({ query: "band", position: 8 })];
    expect(findOpportunities(rows).map((o) => o.query)).not.toContain("top");
  });

  it("ignores anything too far back to be worth the work", () => {
    /*
      Both candidates click poorly; the peers establish what a healthy
      rate looks like in that band. Only the one inside the range is
      offered — note the out-of-range row still counts towards the median,
      because it is a real row of this site at that position.
    */
    const rows = [
      row({ query: "far", position: OPPORTUNITY_MAX_POSITION + 1, ctr: 0.0001 }),
      row({ query: "near", position: OPPORTUNITY_MAX_POSITION, ctr: 0.0001 }),
      row({ query: "peer-a", position: OPPORTUNITY_MAX_POSITION, ctr: 0.2 }),
      row({ query: "peer-b", position: OPPORTUNITY_MAX_POSITION, ctr: 0.18 }),
      row({ query: "peer-c", position: OPPORTUNITY_MAX_POSITION, ctr: 0.22 }),
    ];

    expect(findOpportunities(rows).map((o) => o.query)).toEqual(["near"]);
  });

  it("ignores phrases nobody sees, where a CTR is noise", () => {
    // One impression and no click is not a 0% click-through rate, it is
    // no information at all.
    const rows = [
      row({ query: "rare", impressions: OPPORTUNITY_MIN_IMPRESSIONS - 1, ctr: 0 }),
      row({ query: "seen", impressions: OPPORTUNITY_MIN_IMPRESSIONS, ctr: 0 }),
      row({ query: "peer-a", impressions: 5000, ctr: 0.2 }),
      row({ query: "peer-b", impressions: 5000, ctr: 0.18 }),
      row({ query: "peer-c", impressions: 5000, ctr: 0.22 }),
    ];

    expect(findOpportunities(rows).map((o) => o.query)).toEqual(["seen"]);
  });

  it("compares a row against this site's own rows nearby, not a curve", () => {
    /*
      Both rows sit at position 8 with plenty of impressions. One clicks
      well for this site, the other does not — and only the comparison
      between them can say so.
    */
    const rows = [
      row({ query: "healthy", ctr: 0.09 }),
      row({ query: "healthy-2", ctr: 0.08 }),
      row({ query: "underperforming", ctr: 0.01 }),
    ];

    expect(findOpportunities(rows).map((o) => o.query)).toEqual(["underperforming"]);
  });

  it("puts the biggest recoverable gap first", () => {
    const rows = [
      row({ query: "small", impressions: 1000, ctr: 0.01 }),
      row({ query: "large", impressions: 40000, ctr: 0.01 }),
      row({ query: "peer", impressions: 1000, ctr: 0.1 }),
      row({ query: "peer-2", impressions: 1000, ctr: 0.1 }),
    ];

    const found = findOpportunities(rows);
    expect(found[0].query).toBe("large");
    expect(found[0].potentialClicks).toBeGreaterThan(found[1].potentialClicks);
  });

  it("leaves out a gap too small to be worth a single click", () => {
    /*
      Found on screen: a row 0.03 percentage points below its band median
      was offered as an opportunity worth "+0". Technically an
      underperformer, practically noise — and a list of things worth doing
      loses its authority the first time it suggests something that is
      not.
    */
    const rows = [
      row({ query: "barely-behind", impressions: 1000, ctr: 0.0999 }),
      row({ query: "peer-a", impressions: 1000, ctr: 0.1 }),
      row({ query: "peer-b", impressions: 1000, ctr: 0.1 }),
    ];

    expect(findOpportunities(rows)).toEqual([]);
  });

  it("says nothing when every row is already doing well", () => {
    // Half the rows are always below their own median, so a band of
    // identical performers must produce no opportunities at all.
    const rows = [row({ query: "a", ctr: 0.05 }), row({ query: "b", ctr: 0.05 })];
    expect(findOpportunities(rows)).toEqual([]);
  });

  it("holds the thresholds the screen explains", () => {
    expect([OPPORTUNITY_MIN_POSITION, OPPORTUNITY_MAX_POSITION]).toEqual([5, 15]);
    expect(OPPORTUNITY_MIN_IMPRESSIONS).toBe(1000);
  });
});
