/**
 * tests/redirects.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * walkRedirectChain() — the primitive lib/admin/link-health.ts's
 * findRedirectChains() walks an active-redirect table with. Not the same
 * code path as seo/urls/actions.ts's chainProblem() (see that function's
 * own comment and walkRedirectChain's header for why they stay separate).
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it } from "vitest";
import { walkRedirectChain } from "@/lib/redirects";

describe("walkRedirectChain", () => {
  it("reports no chain for a single hop with nothing beyond it", () => {
    const table = new Map([["/a", "/b"]]);
    expect(walkRedirectChain(table, "/a")).toEqual({ path: ["/a", "/b"], loop: false });
  });

  it("walks a multi-hop chain to its terminal", () => {
    const table = new Map([
      ["/a", "/b"],
      ["/b", "/c"],
      ["/c", "/d"],
    ]);
    expect(walkRedirectChain(table, "/a")).toEqual({ path: ["/a", "/b", "/c", "/d"], loop: false });
  });

  it("detects a loop that cycles back to the start", () => {
    const table = new Map([
      ["/a", "/b"],
      ["/b", "/a"],
    ]);
    expect(walkRedirectChain(table, "/a")).toEqual({ path: ["/a", "/b", "/a"], loop: true });
  });

  it("detects a loop among nodes after the start", () => {
    const table = new Map([
      ["/a", "/b"],
      ["/b", "/c"],
      ["/c", "/b"],
    ]);
    expect(walkRedirectChain(table, "/a")).toEqual({ path: ["/a", "/b", "/c", "/b"], loop: true });
  });

  it("stops at the hop cap and reports a loop rather than walking forever", () => {
    const table = new Map(Array.from({ length: 20 }, (_, i) => [`/n${i}`, `/n${i + 1}`] as const));
    const result = walkRedirectChain(table, "/n0", 5);
    expect(result.loop).toBe(true);
    expect(result.path).toEqual(["/n0", "/n1", "/n2", "/n3", "/n4", "/n5"]);
  });

  it("ignores table entries unrelated to the walk", () => {
    const table = new Map([
      ["/a", "/b"],
      ["/x", "/y"],
      ["/y", "/z"],
    ]);
    expect(walkRedirectChain(table, "/a")).toEqual({ path: ["/a", "/b"], loop: false });
  });
});
