/**
 * tests/components/SlashMenu.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The two pure halves of §6.2's slash command: deciding that the caret is
 * on a command at all, and matching what has been typed against the block
 * list in whichever language the author is working in.
 *
 * Both are tested here rather than through the rendered editor because the
 * menu is a BubbleMenu, and positioning one needs layout that jsdom does
 * not have. The behaviour around them — Escape, the arrow keys, Enter,
 * clicking an item, and the "/query" text being removed before the block
 * is inserted — was verified in a browser instead.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it } from "vitest";
import type { Editor } from "@tiptap/react";
import {
  filterSlashItems,
  readSlashState,
  type SlashItem,
} from "@/components/admin/editor/SlashMenu";

/**
 * The smallest thing readSlashState actually reads: an empty selection
 * inside a named parent, and the text from the block start to the caret.
 *
 * A real editor would do, but only by dragging ProseMirror's whole schema
 * in to assert on a regular expression — and the fake makes the cases that
 * matter (a caret mid-sentence, a caret in a heading) one line each.
 */
function fakeEditor(options: {
  text: string;
  parentType?: string;
  empty?: boolean;
  blockStart?: number;
}): Editor {
  const { text, parentType = "paragraph", empty = true, blockStart = 10 } = options;
  return {
    state: {
      selection: {
        empty,
        $from: { parent: { type: { name: parentType } }, start: () => blockStart, pos: blockStart + text.length },
      },
      doc: { textBetween: () => text },
    },
  } as unknown as Editor;
}

describe("readSlashState — when the caret is on a command", () => {
  it("opens on a bare slash at the start of a paragraph", () => {
    expect(readSlashState(fakeEditor({ text: "/" }))).toEqual({ from: 10, to: 11, query: "" });
  });

  it("takes everything after the slash as the query", () => {
    expect(readSlashState(fakeEditor({ text: "/call" }))?.query).toBe("call");
  });

  it("carries the range so the trigger text can be removed before inserting", () => {
    expect(readSlashState(fakeEditor({ text: "/table", blockStart: 4 }))).toEqual({
      from: 4,
      to: 10,
      query: "table",
    });
  });

  it("matches a non-latin query", () => {
    expect(readSlashState(fakeEditor({ text: "/ตาราง" }))?.query).toBe("ตาราง");
  });
});

describe("readSlashState — when it is just a slash", () => {
  it("ignores a slash in the middle of a sentence", () => {
    expect(readSlashState(fakeEditor({ text: "see /admin" }))).toBeNull();
  });

  it("closes once a space is typed, because that is prose", () => {
    expect(readSlashState(fakeEditor({ text: "/admin is where" }))).toBeNull();
    expect(readSlashState(fakeEditor({ text: "/call " }))).toBeNull();
  });

  it("ignores text with no slash at all", () => {
    expect(readSlashState(fakeEditor({ text: "call" }))).toBeNull();
  });

  it("only triggers in a paragraph, not in a heading or a caption", () => {
    for (const parentType of ["heading", "figure", "faqQuestion", "codeBlock"]) {
      expect(readSlashState(fakeEditor({ text: "/", parentType }))).toBeNull();
    }
  });

  it("does not trigger while text is selected", () => {
    expect(readSlashState(fakeEditor({ text: "/", empty: false }))).toBeNull();
  });
});

const ITEMS: SlashItem[] = [
  { id: "callout", label: "Callout box", keywords: "note warning box", icon: null as never, run: () => {} },
  { id: "cta", label: "Call to action", keywords: "button contact", icon: null as never, run: () => {} },
  { id: "table", label: "Insert table", keywords: "grid rows columns ตาราง แถว", icon: null as never, run: () => {} },
  { id: "heading2", label: "Heading 2", keywords: "h2 หัวข้อ หัวข้อใหญ่", icon: null as never, run: () => {} },
];

describe("filterSlashItems", () => {
  it("returns everything for an empty query, so '/' alone lists the blocks", () => {
    expect(filterSlashItems(ITEMS, "")).toHaveLength(ITEMS.length);
  });

  it("matches on the label", () => {
    expect(filterSlashItems(ITEMS, "call").map((i) => i.id)).toEqual(["callout", "cta"]);
  });

  it("matches on the translated keywords, which is the point of §6.2", () => {
    // "warning" appears nowhere in the callout's label.
    expect(filterSlashItems(ITEMS, "warning").map((i) => i.id)).toEqual(["callout"]);
  });

  it("finds a block by its Thai search word", () => {
    expect(filterSlashItems(ITEMS, "ตาราง").map((i) => i.id)).toEqual(["table"]);
    expect(filterSlashItems(ITEMS, "หัวข้อ").map((i) => i.id)).toEqual(["heading2"]);
  });

  it("ignores case", () => {
    expect(filterSlashItems(ITEMS, "CALLOUT").map((i) => i.id)).toEqual(["callout"]);
  });

  it("returns nothing rather than everything when nothing matches", () => {
    expect(filterSlashItems(ITEMS, "zzz")).toEqual([]);
  });
});
