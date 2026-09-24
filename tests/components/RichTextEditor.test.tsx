/**
 * @vitest-environment jsdom
 */
/**
 * tests/components/RichTextEditor.test.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The title↔first-H1 sync (lib/heading-policy.ts's header, NewsForm.tsx's
 * file comment) is the one genuinely new interaction this editor
 * introduces — everything else is TipTap's own well-tested behavior. A
 * small harness stands in for NewsForm: a title input plus the editor,
 * wired the same way NewsForm.tsx wires them for real.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";

// FigureNodeView reaches for the media library to write a corrected alt
// back to it. These are "use server" exports, which cannot be imported
// into jsdom — the same stubbing NewsSeoPanel.test.tsx needs for the same
// module.
vi.mock("@/app/[locale]/admin/(content)/media/actions", () => ({
  fetchMediaLibrary: vi.fn(async () => ({ items: [] })),
  updateMediaMeta: vi.fn(async () => ({ ok: true })),
}));
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RichTextEditor, { type RichTextEditorHandle } from "@/components/admin/RichTextEditor";

const LABELS = {
  paragraph: "Paragraph",
  heading: (level: number) => `Heading ${level}`,
  bold: "Bold",
  italic: "Italic",
  bulletList: "Bullet list",
  orderedList: "Numbered list",
  quote: "Quote",
  link: "Insert link",
  image: "Insert image",
  textStyle: "Text style",
};

const FIGURE_LABELS = {
  alignLeft: "Align left",
  alignCenter: "Center",
  alignRight: "Align right",
  alignNone: "No alignment",
  editAlt: "Edit alt text",
  altLabel: "Alt text",
  altMissing: "No alt text",
  altDone: "Done",
  remove: "Remove image",
};

function Harness({ initialContent = "" }: { initialContent?: string }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState(initialContent);
  const editorRef = useRef<RichTextEditorHandle>(null);

  return (
    <div>
      <label htmlFor="title">Title</label>
      <input
        id="title"
        value={title}
        onChange={(event) => {
          setTitle(event.target.value);
          editorRef.current?.setFirstHeadingText(event.target.value);
        }}
      />
      <RichTextEditor
        ref={editorRef}
        content={content}
        onChange={setContent}
        onFirstH1TextChange={(text) => {
          if (text !== null) setTitle(text);
        }}
        toolbarLabels={LABELS}
        figureLabels={FIGURE_LABELS}
        locale="en"
        onRequestLink={() => {}}
        onRequestImage={() => {}}
      />
      <output data-testid="content-html">{content}</output>
    </div>
  );
}

/** The title `<input>` and the editor's contenteditable region are both
 *  accessible textboxes, so `getByRole("textbox")` alone is ambiguous —
 *  this picks out the ProseMirror element specifically. */
function getEditor(): HTMLElement {
  const element = document.querySelector('[contenteditable="true"]');
  if (!element) throw new Error("Editor contenteditable element not found");
  return element as HTMLElement;
}

describe("RichTextEditor — mounts and edits", () => {
  it("renders the toolbar and an editable region", () => {
    render(<Harness />);
    expect(screen.getByRole("toolbar")).toBeInTheDocument();
    expect(getEditor()).toBeInTheDocument();
  });

  it("typing in the editor updates the reported HTML", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    // .focus() (plain DOM focus) rather than user.click(): a real click
    // asks ProseMirror to resolve a document position from screen
    // coordinates via the browser's layout engine, which jsdom doesn't
    // implement — { skipClick: true } tells userEvent.type() to type at
    // the position focus() already established instead of clicking first.
    getEditor().focus();
    await user.type(getEditor(), "Hello world", { skipClick: true });

    await waitFor(() => {
      expect(screen.getByTestId("content-html").textContent).toContain("Hello world");
    });
  });
});

describe("RichTextEditor — title ↔ first-H1 sync", () => {
  it("updates the title when the first H1's text changes", async () => {
    const user = userEvent.setup();
    // Starts with an already-empty H1 (rather than toggling a paragraph
    // into one first) — see the note above on .focus()/skipClick for why
    // a real click isn't used here either.
    render(<Harness initialContent="<h1></h1>" />);

    getEditor().focus();
    await user.type(getEditor(), "My New Title", { skipClick: true });

    await waitFor(() => {
      expect(screen.getByLabelText("Title")).toHaveValue("My New Title");
    });
  });

  it("updates the first H1 when the title field changes, if an H1 already exists", async () => {
    const user = userEvent.setup();
    render(<Harness initialContent="<h1>Old</h1><p>Body.</p>" />);

    const titleInput = screen.getByLabelText("Title");
    await user.clear(titleInput);
    await user.type(titleInput, "New title");

    await waitFor(() => {
      expect(screen.getByTestId("content-html").textContent).toContain("New title");
      expect(screen.getByTestId("content-html").textContent).not.toContain("Old");
    });
  });

  it("does not create an H1 out of nowhere when the title changes and none exists", async () => {
    const user = userEvent.setup();
    render(<Harness initialContent="<p>No heading yet.</p>" />);

    const titleInput = screen.getByLabelText("Title");
    await user.type(titleInput, "A title");

    // Give any (incorrect) sync a chance to run, then assert it didn't.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getByTestId("content-html").textContent).not.toContain("A title");
    expect(screen.getByTestId("content-html").textContent).toContain("No heading yet.");
  });
});

/*
  The figure node's caption stopped being an attribute and became the
  node's own content (Phase 2b-1), so the thing worth pinning is that HTML
  in and HTML out still agree — including for the figures already sitting
  in the database, which predate captions entirely.

  Each case types one character into a leading paragraph first. Without
  that the editor never fires onUpdate, `content` still holds the string
  the harness was handed, and the assertions below would be comparing the
  input to itself — green whatever the node does.
*/
describe("RichTextEditor — figure captions round-trip", () => {
  it("keeps a caption through parse and serialize", async () => {
    const user = userEvent.setup();
    const html =
      "<p>Intro</p>" +
      '<figure data-align="right">' +
      '<img src="https://example.test/a.jpg" alt="A villa" loading="lazy" data-media-id="m1">' +
      "<figcaption>Poolside at dusk</figcaption>" +
      "</figure>";

    render(<Harness initialContent={html} />);

    getEditor().focus();
    await user.type(getEditor(), "x", { skipClick: true });

    await waitFor(() => {
      const out = screen.getByTestId("content-html").textContent ?? "";
      expect(out).toContain("<figcaption>Poolside at dusk</figcaption>");
      // The attributes travel with it rather than being dropped on the way
      // through the new content model.
      expect(out).toContain('data-align="right"');
      expect(out).toContain('alt="A villa"');
      expect(out).toContain('data-media-id="m1"');
    });
  });

  it("does not swallow the image when a figure has no caption", async () => {
    // Every figure written before this change looks exactly like this, and
    // there is one in the development database. Parsed with a plain
    // `contentElement: "figcaption"` selector, ProseMirror falls back to
    // the figure's children and the <img> is consumed as caption text —
    // the image simply disappears on first open.
    const user = userEvent.setup();
    const html =
      "<p>Intro</p>" +
      '<figure><img src="https://example.test/b.jpg" alt="No caption" loading="lazy"></figure>';

    render(<Harness initialContent={html} />);

    getEditor().focus();
    await user.type(getEditor(), "x", { skipClick: true });

    await waitFor(() => {
      const out = screen.getByTestId("content-html").textContent ?? "";
      expect(out).toContain('src="https://example.test/b.jpg"');
      expect(out).toContain('alt="No caption"');
      // Empty caption, not a caption containing the image.
      expect(out).not.toContain("<figcaption><img");
    });
  });
});

/*
  Clicking an image has to reveal its controls.

  This is the regression CI caught: once `figure` stopped being an atom,
  ProseMirror no longer turned a click into a NodeSelection by itself, so
  `selected` stayed false and the bar never appeared — the exact "clicking
  an image does nothing" the NodeView exists to fix, one layer up. jsdom
  cannot place a caret, but it can dispatch a click at the element, which
  is all the NodeView's own handler needs.

  fireEvent.click rather than user.click: the latter also fires mousedown,
  which sends ProseMirror into posAtCoords -> document.elementFromPoint —
  one of the layout APIs jsdom does not implement, per this file's header.
  It throws there as an unhandled error that Vitest reports even while the
  assertions pass. Only the click matters to the handler under test.
*/
describe("RichTextEditor — figure controls", () => {
  it("reveals the control bar when the image is clicked", async () => {
    const html =
      "<p>Intro</p>" +
      '<figure><img src="https://example.test/c.jpg" alt="A villa" loading="lazy"></figure>';

    render(<Harness initialContent={html} />);

    // Nothing on screen until the node is actually selected.
    expect(screen.queryByRole("button", { name: FIGURE_LABELS.alignRight })).toBeNull();

    // The NodeView is a React tree ProseMirror mounts itself, so the image
    // appears a tick after the editor does.
    const image = await waitFor(() => {
      const found = getEditor().querySelector("figure img");
      if (!found) throw new Error("figure image not rendered yet");
      return found;
    });
    fireEvent.click(image);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: FIGURE_LABELS.alignRight })).toBeInTheDocument();
    });
  });

  it("aligns through updateAttributes rather than replacing the node", async () => {
    const html =
      "<p>Intro</p>" +
      '<figure><img src="https://example.test/d.jpg" alt="A villa" loading="lazy"></figure>';

    render(<Harness initialContent={html} />);

    const image = await waitFor(() => {
      const found = getEditor().querySelector("figure img");
      if (!found) throw new Error("figure image not rendered yet");
      return found;
    });
    fireEvent.click(image);
    fireEvent.click(await screen.findByRole("button", { name: FIGURE_LABELS.alignRight }));

    await waitFor(() => {
      const out = screen.getByTestId("content-html").textContent ?? "";
      expect(out).toContain('data-align="right"');
      // The image itself survived the change rather than being re-inserted.
      expect(out).toContain('src="https://example.test/d.jpg"');
    });
  });
});
