/**
 * tests/lib/content-link-index.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * searchContentLinks() itself needs a database and isn't unit tested here
 * — see tests/news-list.test.ts's own header for why that's this
 * project's convention. rankContentLinks() is the pure narrow-sort-cap
 * step pulled out specifically so it can be, and it's the part most
 * likely to be wrong: a broad DB-side match can surface a row whose
 * *other* locale's title matched, and this is what has to notice the
 * resolved title doesn't actually contain the query before it reaches
 * the picker.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it } from "vitest";
import { rankContentLinks, RESULT_LIMIT, type ContentLinkHit } from "@/lib/admin/content-link-index";

function hit(overrides: Partial<ContentLinkHit>): ContentLinkHit {
  return { id: "1", type: "project", title: "Untitled", path: "/x", ...overrides };
}

describe("rankContentLinks", () => {
  it("keeps a hit whose resolved title matches", () => {
    const hits = [hit({ title: "Beachfront Villas" })];
    expect(rankContentLinks("beach", hits)).toHaveLength(1);
  });

  it("drops a hit whose resolved title does not match the query", () => {
    // The DB-side query matched some *other* locale's title; the display
    // title for the requested locale doesn't contain the query at all.
    const hits = [hit({ title: "วิลล่าริมชายหาด" })];
    expect(rankContentLinks("beach", hits)).toHaveLength(0);
  });

  it("matches case-insensitively", () => {
    expect(rankContentLinks("BEACH", [hit({ title: "Beachfront Villas" })])).toHaveLength(1);
  });

  it("also matches against the path", () => {
    expect(rankContentLinks("about", [hit({ title: "Company", path: "/about" })])).toHaveLength(1);
  });

  it("sorts alphabetically by title", () => {
    const hits = [hit({ id: "b", title: "Bang Tao villas" }), hit({ id: "a", title: "About villas" })];
    expect(rankContentLinks("villas", hits).map((h) => h.id)).toEqual(["a", "b"]);
  });

  it("caps results at RESULT_LIMIT", () => {
    const hits = Array.from({ length: RESULT_LIMIT + 5 }, (_, i) => hit({ id: String(i), title: `Villa ${i}` }));
    expect(rankContentLinks("villa", hits)).toHaveLength(RESULT_LIMIT);
  });
});
