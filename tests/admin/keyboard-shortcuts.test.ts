/**
 * tests/admin/keyboard-shortcuts.test.ts — the `g` chords
 * (components/admin/KeyboardShortcuts.tsx) jump to nav items by key; a
 * renamed item would turn its chord into a silent no-op.
 */

import { describe, expect, it } from "vitest";
import { ADMIN_NAV } from "@/lib/admin/nav";
import { GO_KEYS } from "@/components/admin/KeyboardShortcuts";

describe("g chords", () => {
  it("each name a real nav item", () => {
    const keys = new Set(ADMIN_NAV.flatMap((group) => group.items.map((item) => item.key)));
    for (const [letter, target] of Object.entries(GO_KEYS)) {
      expect(keys.has(target), `g ${letter} → ${target}`).toBe(true);
    }
  });

  it("are the v4 set", () => {
    expect(Object.keys(GO_KEYS).sort()).toEqual(["a", "d", "l", "n", "p", "s"]);
  });
});
