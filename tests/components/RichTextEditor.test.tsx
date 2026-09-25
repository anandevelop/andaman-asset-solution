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
  strike: "Strikethrough",
  code: "Inline code",
  codeBlock: "Code block",
  horizontalRule: "Divider",
  bulletList: "Bullet list",
  orderedList: "Numbered list",
  quote: "Quote",
  link: "Insert link",
  image: "Insert image",
  faq: "FAQ block",
  table: "Insert table",
  tableAddRow: "Add row",
  tableDeleteRow: "Delete row",
  tableAddColumn: "Add column",
  tableDeleteColumn: "Delete column",
  tableHeaderRow: "Toggle header row",
  tableDelete: "Delete table",
  textStyle: "Text style",
  undo: "Undo",
  redo: "Redo",
  clearFormat: "Clear formatting",
  editLink: "Edit link",
  openLink: "Open link",
  removeLink: "Remove link",
};

const FIGURE_LABELS = {
  alignLeft: "Align left",
  alignCenter: "Center",
  alignRight: "Align right",
  alignNone: "No alignment",
  widthNormal: "Normal width",
  widthWide: "Wide",
  widthFull: "Full width",
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
        onRequestEditLink={() => {}}
        onUploadNotice={() => {}}
        uploadLabels={{
          failed: "Upload failed",
          tooLarge: "Too large",
          pastedImage: "Pasted images have to be uploaded",
          byKey: (key) => key,
        }}
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

/*
  Underline is gone from the schema, not merely from the toolbar.

  StarterKit enables it whether or not a button exists, so ⌘U used to
  produce a <u> that lib/markdown.ts's sanitizer then dropped on save —
  the author watched their formatting disappear with no error to explain
  it. A missing button would not have fixed that; the mark itself has to
  be absent.
*/
describe("RichTextEditor — marks the sanitizer would drop", () => {
  it("has no underline mark in the schema", async () => {
    render(<Harness initialContent="<p>Intro</p>" />);

    await waitFor(() => {
      expect(getEditor()).toBeInTheDocument();
    });

    // The mark is registered on the ProseMirror schema, which the editor
    // exposes through the DOM node it manages.
    const marks = await waitFor(() => {
      const view = (getEditor() as unknown as { pmViewDesc?: { node?: unknown } }).pmViewDesc;
      if (!view) throw new Error("editor view not ready");
      return Object.keys(
        ((view as { node: { type: { schema: { marks: Record<string, unknown> } } } }).node.type.schema
          .marks),
      );
    });

    expect(marks).not.toContain("underline");
    // …while the one that was kept deliberately is still there.
    expect(marks).toContain("strike");
  });

  it("round-trips a strike through the editor", async () => {
    const user = userEvent.setup();
    render(<Harness initialContent="<p><s>struck</s></p>" />);

    getEditor().focus();
    await user.type(getEditor(), "x", { skipClick: true });

    await waitFor(() => {
      expect(screen.getByTestId("content-html").textContent).toContain("<s>");
    });
  });
});

/*
  Width is a separate decision from alignment (Phase 2b-2), and the one
  thing that must not change is every article written before it existed.
*/
describe("RichTextEditor — figure width", () => {
  it("leaves a legacy figure byte-identical, with no data-width invented", async () => {
    const user = userEvent.setup();
    const html =
      "<p>Intro</p>" +
      '<figure data-align="center"><img src="https://example.test/e.jpg" alt="A villa" loading="lazy"><figcaption>c</figcaption></figure>';

    render(<Harness initialContent={html} />);
    getEditor().focus();
    await user.type(getEditor(), "x", { skipClick: true });

    await waitFor(() => {
      const out = screen.getByTestId("content-html").textContent ?? "";
      expect(out).toContain('data-align="center"');
      // "normal" is the absence of a choice — it must not be written out,
      // or every existing article's markup changes on first save.
      expect(out).not.toContain("data-width");
    });
  });

  it("round-trips an explicit width", async () => {
    const user = userEvent.setup();
    const html =
      "<p>Intro</p>" +
      '<figure data-width="full"><img src="https://example.test/f.jpg" alt="A villa" loading="lazy"></figure>';

    render(<Harness initialContent={html} />);
    getEditor().focus();
    await user.type(getEditor(), "x", { skipClick: true });

    await waitFor(() => {
      expect(screen.getByTestId("content-html").textContent).toContain('data-width="full"');
    });
  });

  it("offers the width buttons, disabled while the image is floated", async () => {
    const html =
      "<p>Intro</p>" +
      '<figure data-align="right"><img src="https://example.test/g.jpg" alt="A villa" loading="lazy"></figure>';

    render(<Harness initialContent={html} />);

    const image = await waitFor(() => {
      const found = getEditor().querySelector("figure img");
      if (!found) throw new Error("figure image not rendered yet");
      return found;
    });
    fireEvent.click(image);

    // prose-article forces a floated figure back to ~40% whatever width is
    // set, so the control is shown-but-inert rather than silently ignored.
    const wide = await screen.findByRole("button", { name: FIGURE_LABELS.widthWide });
    expect(wide).toBeDisabled();
  });
});

/*
  Opening an article must not rewrite its links.

  TipTap's Link extension ships HTMLAttributes defaults of target="_blank"
  and rel="noopener noreferrer nofollow", and its target/rel attributes
  fall back to them — so a link parsed out of an existing article, which
  carries neither, picked both up and was serialized back with them.
  Merely opening an old article and saving it put nofollow on every
  internal link, in the editor built to do this site's SEO.
*/
describe("RichTextEditor — links survive a round trip unchanged", () => {
  it("does not add target or rel to a link that had none", async () => {
    const user = userEvent.setup();
    render(
      <Harness initialContent='<p>Intro</p><p><a href="/projects/x" data-internal="true">a link</a></p>' />,
    );

    getEditor().focus();
    await user.type(getEditor(), "x", { skipClick: true });

    await waitFor(() => {
      const out = screen.getByTestId("content-html").textContent ?? "";
      expect(out).toContain('href="/projects/x"');
      expect(out).not.toContain("target=");
      expect(out).not.toContain("rel=");
    });
  });

  it("keeps target and rel when the link really has them", async () => {
    const user = userEvent.setup();
    render(
      <Harness initialContent='<p>Intro</p><p><a href="https://x.test" target="_blank" rel="nofollow">a link</a></p>' />,
    );

    getEditor().focus();
    await user.type(getEditor(), "x", { skipClick: true });

    await waitFor(() => {
      const out = screen.getByTestId("content-html").textContent ?? "";
      expect(out).toContain('target="_blank"');
      expect(out).toContain("nofollow");
    });
  });
});

/*
  The FAQ block has to survive the trip to the database and back, because
  two other things read it from there: the SEO checklist's "has an FAQ
  block" and the FAQPage JSON-LD. Both key on the data-faq markers, so if
  the editor stops emitting them the score and the structured data go
  quietly wrong rather than loudly.
*/
describe("RichTextEditor — FAQ block", () => {
  it("round-trips questions and answers with their markers intact", async () => {
    const user = userEvent.setup();
    const html =
      "<p>Intro</p>" +
      '<ul data-faq="list">' +
      '<li data-faq="item"><h3 data-faq="question">Can foreigners own?</h3><p>Leasehold or company.</p></li>' +
      "</ul>";

    render(<Harness initialContent={html} />);
    getEditor().focus();
    await user.type(getEditor(), "x", { skipClick: true });

    await waitFor(() => {
      const out = screen.getByTestId("content-html").textContent ?? "";
      expect(out).toContain('data-faq="list"');
      expect(out).toContain('data-faq="item"');
      expect(out).toContain('data-faq="question"');
      expect(out).toContain("Can foreigners own?");
      expect(out).toContain("Leasehold or company.");
    });
  });
});

/*
  A table has to survive the sanitizer, which is stricter than TipTap.
  TipTap emits <colgroup> and a colwidth attribute for column sizing, and
  lib/markdown.ts allows neither — so the question is whether what comes
  back is still a table, or debris.
*/
describe("RichTextEditor — tables", () => {
  it("round-trips the parts the sanitizer actually keeps", async () => {
    const user = userEvent.setup();
    const html =
      "<p>Intro</p>" +
      "<table><thead><tr><th>Type</th><th>Size</th></tr></thead>" +
      "<tbody><tr><td>Pool villa</td><td>398 sqm</td></tr></tbody></table>";

    render(<Harness initialContent={html} />);
    getEditor().focus();
    await user.type(getEditor(), "x", { skipClick: true });

    await waitFor(() => {
      const out = screen.getByTestId("content-html").textContent ?? "";
      expect(out).toContain("<table");
      expect(out).toContain("<th");
      expect(out).toContain("Pool villa");
      expect(out).toContain("398 sqm");
    });
  });
});
