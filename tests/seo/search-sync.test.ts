/**
 * tests/seo/search-sync.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The window each sync asks for.
 *
 * Two decisions live here and both are irreversible in their own way. The
 * first run has to take all sixteen months Search Console keeps, because
 * that history cannot be fetched later and every comparison the reports
 * draw is measured against it. Every run after it has to re-read the last
 * few days, because Google revises them after first reporting — a job that
 * only ever asked for yesterday would store first drafts for ever.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it } from "vitest";
import { OVERLAP_DAYS, syncWindow } from "@/lib/seo/search-sync";
import { earliestAvailable, latestSettled } from "@/lib/seo/search-console";

const now = new Date("2026-09-26T09:00:00Z");

describe("syncWindow", () => {
  it("takes the full sixteen months on a first run", () => {
    const window = syncWindow(null, now);

    expect(window.firstRun).toBe(true);
    expect(window.startDate).toBe(earliestAvailable(now));
    expect(window.endDate).toBe(latestSettled(now));
  });

  it("re-reads the last few days on a routine run", () => {
    // Google finalises a day over the following two or three. Asking only
    // for what is new would store its first draft and never learn the
    // rest.
    const window = syncWindow(new Date("2026-09-20T00:00:00Z"), now);

    expect(window.firstRun).toBe(false);
    expect(window.startDate).toBe("2026-09-15");
    expect(OVERLAP_DAYS).toBe(5);
  });

  it("never asks beyond the last settled day", () => {
    // The most recent two to three days are still moving; storing them as
    // settled is how a report ends up disagreeing with Search Console.
    for (const stored of [null, new Date("2026-09-25T00:00:00Z")]) {
      expect(syncWindow(stored, now).endDate).toBe("2026-09-23");
    }
  });

  it("overlaps across a month boundary", () => {
    const window = syncWindow(new Date("2026-10-02T00:00:00Z"), new Date("2026-10-08T00:00:00Z"));
    expect(window.startDate).toBe("2026-09-27");
  });
});
