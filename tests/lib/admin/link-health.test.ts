/**
 * tests/lib/admin/link-health.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * findRedirectChains() — pure over a RedirectRow[], no database. The case
 * worth pinning down beyond the obvious "A→B→C is a chain": a closed loop
 * with no root at all (A→B→C→A) has no fromPath outside anyone else's
 * toPath, so the naive "walk from every root" approach misses it entirely.
 * See the function's own header for why a second pass is needed.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it } from "vitest";
import { RedirectSource } from "@prisma/client";
import { findRedirectChains, type RedirectChainGroup } from "@/lib/admin/link-health";
import type { RedirectRow } from "@/lib/admin/url-health";

function row(fromPath: string, toPath: string, overrides: Partial<RedirectRow> = {}): RedirectRow {
  return {
    id: fromPath,
    fromPath,
    toPath,
    statusCode: 301,
    isActive: true,
    source: RedirectSource.MANUAL,
    note: null,
    expiresAt: null,
    createdAt: new Date().toISOString(),
    hits30: 0,
    hitsTotal: 0,
    destination: "ok",
    ...overrides,
  };
}

function terminals(chains: RedirectChainGroup[]): { terminal: string; loop: boolean; length: number }[] {
  return chains.map((c) => ({ terminal: c.terminal, loop: c.loop, length: c.rows.length }));
}

describe("findRedirectChains", () => {
  it("does not report a plain single-hop redirect", () => {
    expect(findRedirectChains([row("/a", "/b")])).toEqual([]);
  });

  it("reports a real chain once, from its root", () => {
    const chains = findRedirectChains([row("/a", "/b"), row("/b", "/c")]);
    expect(terminals(chains)).toEqual([{ terminal: "/c", loop: false, length: 2 }]);
  });

  it("reports a chain that loops back to its own root", () => {
    const chains = findRedirectChains([row("/a", "/b"), row("/b", "/a")]);
    expect(terminals(chains)).toEqual([{ terminal: "/a", loop: true, length: 2 }]);
  });

  it("catches a closed loop with no root at all", () => {
    const chains = findRedirectChains([row("/a", "/b"), row("/b", "/c"), row("/c", "/a")]);
    expect(chains).toHaveLength(1);
    expect(chains[0].loop).toBe(true);
    expect(chains[0].rows).toHaveLength(3);
  });

  it("ignores an inactive redirect entirely", () => {
    const chains = findRedirectChains([row("/a", "/b"), row("/b", "/c", { isActive: false })]);
    expect(chains).toEqual([]);
  });

  it("reports two independent chains separately", () => {
    const chains = findRedirectChains([row("/a", "/b"), row("/b", "/c"), row("/x", "/y"), row("/y", "/z")]);
    expect(terminals(chains).sort((a, b) => a.terminal.localeCompare(b.terminal))).toEqual([
      { terminal: "/c", loop: false, length: 2 },
      { terminal: "/z", loop: false, length: 2 },
    ]);
  });
});
