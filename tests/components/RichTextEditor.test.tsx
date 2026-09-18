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
import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
