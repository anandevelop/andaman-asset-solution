/**
 * tests/lib/admin/link-opportunities.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The pure matching/ranking core behind section 5.3's link-building
 * opportunity finder — everything here runs with no database. See
 * lib/admin/link-opportunities.ts's header for why sources are scoped to
 * News articles only.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it } from "vitest";
import {
  boundaryRegex,
  excludedSpans,
  opportunityWeight,
  scanTitleMentions,
} from "@/lib/admin/link-opportunities";

describe("boundaryRegex", () => {
  it("matches a whole Latin word, case-insensitively", () => {
    const regex = boundaryRegex("Trinity Village", "en");
    expect("Come see Trinity Village today").toMatch(regex);
    expect("come see trinity village today").toMatch(regex);
  });

  it("does not match a partial-word substring", () => {
    const regex = boundaryRegex("Villa", "en");
    expect("Villagers love it here").not.toMatch(regex);
  });

  it("matches a Thai phrase with no adjacent Thai character on either side", () => {
    const regex = boundaryRegex("ทรินิตี้", "th");
    expect("ชม ทรินิตี้ วันนี้").toMatch(regex);
  });

  it("does not match a Thai phrase embedded inside a longer Thai word", () => {
    const regex = boundaryRegex("ทรินิตี้", "th");
    expect("กทรินิตี้ก").not.toMatch(regex);
  });
});

describe("excludedSpans", () => {
  it("excludes an existing markdown link's full span", () => {
    const body = "See [Trinity Village](/projects/trinity) for details.";
    const spans = excludedSpans(body);
    const linkStart = body.indexOf("[Trinity");
    expect(spans.some((s) => s.start <= linkStart && s.end >= body.indexOf(")") + 1)).toBe(true);
  });

  it("excludes an HTML anchor's full span, text included", () => {
    const body = 'Visit <a href="/projects/trinity">Trinity Village</a> today.';
    const spans = excludedSpans(body);
    const start = body.indexOf("<a");
    const end = body.indexOf("</a>") + 4;
    expect(spans.some((s) => s.start <= start && s.end >= end)).toBe(true);
  });

  it("excludes a markdown heading line", () => {
    const body = "## Trinity Village\n\nBody text here.";
    const spans = excludedSpans(body);
    expect(spans.some((s) => s.start === 0 && s.end === "## Trinity Village".length)).toBe(true);
  });

  it("merges overlapping spans rather than keeping duplicates", () => {
    const body = "![Trinity Village](/img.jpg)";
    const spans = excludedSpans(body);
    expect(spans).toHaveLength(1);
  });
});

describe("scanTitleMentions", () => {
  it("finds a real mention outside any link", () => {
    const body = "Buyers are excited about Trinity Village this quarter.";
    const mentions = scanTitleMentions(body, "en", [{ title: "Trinity Village" }]);
    expect(mentions).toHaveLength(1);
    expect(mentions[0]).toMatchObject({ candidateIndex: 0, matchedText: "Trinity Village" });
  });

  it("skips a mention that is already a link", () => {
    const body = "See [Trinity Village](/projects/trinity) for details.";
    const mentions = scanTitleMentions(body, "en", [{ title: "Trinity Village" }]);
    expect(mentions).toHaveLength(0);
  });

  it("skips a mention inside a heading", () => {
    const body = "## Trinity Village\n\nSomething else entirely.";
    const mentions = scanTitleMentions(body, "en", [{ title: "Trinity Village" }]);
    expect(mentions).toHaveLength(0);
  });

  it("is case-insensitive", () => {
    const body = "come see trinity village this weekend";
    const mentions = scanTitleMentions(body, "en", [{ title: "Trinity Village" }]);
    expect(mentions).toHaveLength(1);
  });

  it("lets the longer title claim its span before the shorter contained title is tried", () => {
    const body = "Welcome to Trinity Village Residences, our newest launch.";
    const mentions = scanTitleMentions(body, "en", [{ title: "Trinity Village" }, { title: "Trinity Village Residences" }]);
    expect(mentions).toHaveLength(1);
    expect(mentions[0].matchedText).toBe("Trinity Village Residences");
  });

  it("returns one mention per candidate, not every occurrence", () => {
    const body = "Trinity Village is great. We love Trinity Village.";
    const mentions = scanTitleMentions(body, "en", [{ title: "Trinity Village" }]);
    expect(mentions).toHaveLength(1);
  });

  it("returns nothing for an empty body or an empty candidate list", () => {
    expect(scanTitleMentions("", "en", [{ title: "Trinity Village" }])).toEqual([]);
    expect(scanTitleMentions("Trinity Village is great", "en", [])).toEqual([]);
  });
});

describe("opportunityWeight", () => {
  it("is strictly lower with more inbound links, all else equal", () => {
    const zero = opportunityWeight(3, 0);
    const some = opportunityWeight(3, 4);
    expect(some).toBeLessThan(zero);
  });

  it("is strictly higher for a longer, more distinctive title, up to the cap", () => {
    const short = opportunityWeight(1, 2);
    const long = opportunityWeight(5, 2);
    expect(long).toBeGreaterThan(short);
  });

  it("caps match quality at a 6+ word title rather than growing without bound", () => {
    expect(opportunityWeight(6, 0)).toBe(opportunityWeight(20, 0));
  });
});
