/**
 * @vitest-environment jsdom
 */
/**
 * tests/components/BubbleMenuProps.test.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * React error #185 in the news editor.
 *
 * TipTap's BubbleMenu dispatches an "updateOptions" transaction whenever its
 * shouldShow or options prop changes identity. Every menu in the editor
 * passed them inline, so each render sent one transaction per menu, and the
 * open slash menu — which re-renders on every transaction — fed itself:
 * about ten thousand transactions a second, measured in Chromium, until a
 * keystroke landing mid-loop pushed React past its update limit.
 *
 * So what is pinned here is the cause rather than the symptom: across
 * renders, every menu keeps the same shouldShow and options. BubbleMenu is
 * replaced by a recorder — jsdom has no layout for the real one to position
 * against, and the real one's behaviour is TipTap's to test.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

const { seen } = vi.hoisted(() => ({
  seen: { renders: 0, shouldShow: new Set<unknown>(), options: new Set<unknown>() },
}));

vi.mock("@tiptap/react/menus", () => ({
  BubbleMenu: ({ shouldShow, options, children }: Record<string, unknown>) => {
    seen.renders += 1;
    seen.shouldShow.add(shouldShow);
    seen.options.add(options);
    return children as never;
  },
}));
vi.mock("@/app/[locale]/admin/(content)/media/actions", () => ({
  fetchMediaLibrary: vi.fn(async () => ({ items: [] })),
  updateMediaMeta: vi.fn(async () => ({ ok: true })),
}));

import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RichTextEditor from "@/components/admin/RichTextEditor";

/** Every label is its own key; the two that are functions return strings. */
const labels = new Proxy(
  {},
  {
    get: (_, key) =>
      key === "heading" || key === "calloutTone" || key === "slashKeywords" || key === "byKey"
        ? (value: unknown) => String(value)
        : String(key),
  },
) as never;

/** Wired as NewsForm wires it: content state in the parent, so every
 *  keystroke re-renders the editor. */
function Harness() {
  const [content, setContent] = useState("<p>Body.</p>");
  return (
    <RichTextEditor
      content={content}
      onChange={setContent}
      toolbarLabels={labels}
      figureLabels={labels}
      uploadLabels={labels}
      locale="en"
      onRequestLink={() => {}}
      onRequestEditLink={() => {}}
      onUploadNotice={() => {}}
      onRequestImage={() => {}}
    />
  );
}

describe("bubble menu props", () => {
  it("keep their identity across re-renders", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const editor = document.querySelector('[contenteditable="true"]') as HTMLElement;
    editor.focus();
    await user.type(editor, "more words", { skipClick: true });

    // Many renders of five menus — the selection, link, callout and table
    // menus and the slash menu — but only five predicates between them, and
    // two option values (none, and the slash menu's placement). Inline, both
    // grew by one per menu per render.
    expect(seen.renders).toBeGreaterThan(10);
    expect(seen.shouldShow.size).toBe(5);
    expect(seen.options.size).toBe(2);
  });
});
