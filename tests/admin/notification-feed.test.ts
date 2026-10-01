/**
 * tests/admin/notification-feed.test.ts — the notification drawer's rules
 * (lib/admin/notification-feed.ts).
 */

import { describe, expect, it } from "vitest";
import { buildFeed, isTestNotification, type FeedRow } from "@/lib/admin/notification-feed";

const row = (id: string, title: string, patch: Partial<FeedRow> = {}): FeedRow => ({
  id,
  event: "newLead",
  title,
  body: null,
  read: true,
  ...patch,
});

describe("isTestNotification", () => {
  it("recognises the test traffic in the feed today", () => {
    expect(isTestNotification({ title: "New lead: Landing Test", body: null })).toBe(true);
    expect(isTestNotification({ title: "New lead: p6-test-1727", body: null })).toBe(true);
    expect(isTestNotification({ title: "Registration", body: "qa@andaman.test" })).toBe(true);
  });

  it("does not swallow real customers", () => {
    expect(isTestNotification({ title: "New lead: Tess Landing", body: null })).toBe(false);
    expect(isTestNotification({ title: "New lead: Testa Rossi", body: null })).toBe(false);
  });
});

describe("buildFeed", () => {
  it("collapses consecutive duplicates into one entry with a count", () => {
    const { entries } = buildFeed([
      row("1", "Sign-ins locked", { event: "failedLogins" }),
      row("2", "Sign-ins locked", { event: "failedLogins", read: false }),
      row("3", "New lead: Somchai"),
    ]);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ count: 2, read: false });
    expect(entries[0].row.id).toBe("1");
  });

  it("keeps the same title apart when something else came between", () => {
    const { entries } = buildFeed([row("1", "A"), row("2", "B"), row("3", "A")]);
    expect(entries.map((entry) => entry.count)).toEqual([1, 1, 1]);
  });

  it("sets test rows aside rather than listing them", () => {
    const { entries, tests } = buildFeed([row("1", "New lead: Landing Test"), row("2", "New lead: Somchai")]);
    expect(entries.map((entry) => entry.row.id)).toEqual(["2"]);
    expect(tests.map((test) => test.id)).toEqual(["1"]);
  });
});
