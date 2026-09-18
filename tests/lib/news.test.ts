/**
 * tests/lib/news.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * isArticleLiveNow() — the one definition of "is this article actually
 * visible to a visitor right now", shared by publishedWhere()'s SQL-level
 * equivalent, lib/admin/news-list.ts's per-row status, and the news
 * editor's own "live" permalink check. The master spec calls scheduled
 * publishing "the easiest point to get wrong" in this phase, hence its
 * own pinned test rather than only indirect coverage elsewhere.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it } from "vitest";
import { isArticleLiveNow } from "@/lib/news";

const NOW = new Date("2026-06-15T12:00:00.000Z");
const PAST = new Date("2026-06-15T00:00:00.000Z");
const FUTURE = new Date("2026-06-16T00:00:00.000Z");

describe("isArticleLiveNow", () => {
  it("is true when published with a past publishedAt", () => {
    expect(isArticleLiveNow({ isPublished: true, publishedAt: PAST }, NOW)).toBe(true);
  });

  it("is true at the exact instant publishedAt equals now (inclusive)", () => {
    expect(isArticleLiveNow({ isPublished: true, publishedAt: NOW }, NOW)).toBe(true);
  });

  it("is false when published with a future publishedAt (scheduled)", () => {
    expect(isArticleLiveNow({ isPublished: true, publishedAt: FUTURE }, NOW)).toBe(false);
  });

  it("is false when not published, regardless of publishedAt", () => {
    expect(isArticleLiveNow({ isPublished: false, publishedAt: PAST }, NOW)).toBe(false);
  });

  it("is false when published but publishedAt is null", () => {
    expect(isArticleLiveNow({ isPublished: true, publishedAt: null }, NOW)).toBe(false);
  });

  it("defaults `now` to the current time when omitted", () => {
    expect(isArticleLiveNow({ isPublished: true, publishedAt: new Date(Date.now() - 1000) })).toBe(true);
    expect(isArticleLiveNow({ isPublished: true, publishedAt: new Date(Date.now() + 60_000) })).toBe(false);
  });
});
