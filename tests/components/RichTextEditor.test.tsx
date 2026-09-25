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
import RichTextEditor, {
  isDragTargetParent,
  type RichTextEditorHandle,
} from "@/components/admin/RichTextEditor";

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
  callout: "Callout box",
  calloutTone: (tone: string) => ({ note: "Note", warning: "Warning", success: "Good to know" })[tone] ?? tone,
  pullQuote: "Pull quote",
  cta: "Call to action",
  projectCard: "Project card",
  dragHandle: "Drag to move",
  slashEmpty: "No blocks match",
  slashKeywords: (id: string) => ({ callout: "note warning box", table: "grid rows" })[id] ?? "",
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

/*
  §2b-5.4 asks that the editor show roughly what a reader will see, and the
  whole of that rests on which element carries prose-article.

  On the wrapper it lost twice over. The wrapper also carries
  `admin-textarea`, declared later in globals.css, so `text-sm text-ink`
  beat prose-article's base at equal specificity and the body rendered at
  14px in full-strength ink against the page's 16px at ink/75. And
  prose-article spaces its children with `& > * + *`, which on the wrapper
  matched the single ProseMirror element rather than anything inside it, so
  no paragraph in the editor got its top margin.

  Measured in a real browser, all 21 block types now compute identically in
  the editor and on the page. jsdom cannot check that — it has no cascade
  worth the name — so what is pinned here is the arrangement that produces
  it, which is the part a later edit would undo by accident.
*/
describe("RichTextEditor — the editor's typography is the page's", () => {
  it("puts prose-article on the contenteditable element, not its wrapper", () => {
    render(<Harness initialContent="<p>Body.</p>" />);

    const editable = getEditor();
    expect(editable.className).toContain("prose-article");

    const wrapper = editable.parentElement;
    expect(wrapper?.className).toContain("admin-textarea");
    // The two must not meet: on one element, admin-textarea's text-sm wins.
    expect(wrapper?.className).not.toContain("prose-article");
  });
});

/*
  §6.1's drag handle. What is draggable is "every top-level block, plus the
  list item" — and expressing that took three tries, each of which fails
  silently rather than loudly:

    nested: false                  no handle on a list item at all
    nested: true                   a handle on the paragraph *inside* a
                                   callout or a pull quote, so dragging it
                                   takes the block apart from the inside
    allowedContainers: [lists]     no handle on any top-level block, since
                                   the check walks ancestors and a
                                   top-level block's only ancestor is doc
                                   — and adding "doc" lets everything back
                                   in, doc being an ancestor of everything

  Verified in a browser for each of paragraph, heading, image, list item,
  callout, pull quote, CTA and FAQ: each moves as a whole and its markup
  survives the move. This pins the predicate those runs agreed with.
*/
describe("RichTextEditor — what the drag handle may pick up", () => {
  it("offers top-level blocks and list items", () => {
    for (const parent of ["doc", "bulletList", "orderedList"]) {
      expect(isDragTargetParent(parent)).toBe(true);
    }
  });

  it("refuses the insides of a block that would come apart", () => {
    for (const parent of ["callout", "pullQuote", "cta", "projectCard", "faqItem", "faqList"]) {
      expect(isDragTargetParent(parent)).toBe(false);
    }
  });

  it("refuses a list item's own paragraph, so the item moves and not its text", () => {
    expect(isDragTargetParent("listItem")).toBe(false);
  });

  it("refuses a table cell's contents", () => {
    for (const parent of ["tableCell", "tableHeader", "tableRow", "table"]) {
      expect(isDragTargetParent(parent)).toBe(false);
    }
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

/*
  The callout is a blockquote wearing data-block, because the allowlist has
  no div/class/style to build one from. That makes the parse order the
  whole ballgame: StarterKit's blockquote claims <blockquote> too, and
  ProseMirror settles rules by priority rather than by how specific the
  selector looks. The FAQ list learned this the hard way against <ul>.
*/
describe("RichTextEditor — callout", () => {
  it("round-trips the marker and the tone", async () => {
    const user = userEvent.setup();
    const html =
      "<p>Intro</p>" +
      '<blockquote data-block="callout" data-tone="warning"><p>Foreigners cannot own land directly.</p></blockquote>';

    render(<Harness initialContent={html} />);
    getEditor().focus();
    await user.type(getEditor(), "x", { skipClick: true });

    await waitFor(() => {
      const out = screen.getByTestId("content-html").textContent ?? "";
      expect(out).toContain('data-block="callout"');
      expect(out).toContain('data-tone="warning"');
      expect(out).toContain("Foreigners cannot own land directly.");
    });
  });

  it("leaves an ordinary blockquote an ordinary blockquote", async () => {
    // The regression that matters: if the callout rule won on plain
    // quotes, every pull-quote in every existing article would silently
    // become a tinted box.
    const user = userEvent.setup();
    render(<Harness initialContent="<p>Intro</p><blockquote><p>Just a quote.</p></blockquote>" />);

    getEditor().focus();
    await user.type(getEditor(), "x", { skipClick: true });

    await waitFor(() => {
      const out = screen.getByTestId("content-html").textContent ?? "";
      expect(out).toContain("<blockquote>");
      expect(out).not.toContain("data-block");
      expect(out).not.toContain("data-tone");
    });
  });

  it("defaults a callout with no tone to note rather than losing it", async () => {
    const user = userEvent.setup();
    render(
      <Harness initialContent='<p>Intro</p><blockquote data-block="callout"><p>Body.</p></blockquote>' />,
    );

    getEditor().focus();
    await user.type(getEditor(), "x", { skipClick: true });

    await waitFor(() => {
      const out = screen.getByTestId("content-html").textContent ?? "";
      expect(out).toContain('data-block="callout"');
      expect(out).toContain('data-tone="note"');
    });
  });
});

/*
  The pull quote shares the callout's problem — another <blockquote> that
  StarterKit also claims — and adds one of its own: its attribution is a
  <p data-block="quote-attribution">, which StarterKit's paragraph claims
  just as hard. Both need the priority, and both lose their marker without
  it, which on the attribution means the line stops being an attribution
  and becomes an ordinary paragraph inside the quote.
*/
describe("RichTextEditor — pull quote", () => {
  it("round-trips the quote and its attribution", async () => {
    const user = userEvent.setup();
    const html =
      "<p>Intro</p>" +
      '<blockquote data-block="pull-quote"><p>Phuket has run out of beachfront.</p>' +
      '<p data-block="quote-attribution">Somchai P., managing director</p></blockquote>';

    render(<Harness initialContent={html} />);
    getEditor().focus();
    await user.type(getEditor(), "x", { skipClick: true });

    await waitFor(() => {
      const out = screen.getByTestId("content-html").textContent ?? "";
      expect(out).toContain('data-block="pull-quote"');
      expect(out).toContain('data-block="quote-attribution"');
      expect(out).toContain("Phuket has run out of beachfront.");
      expect(out).toContain("Somchai P., managing director");
    });
  });

  it("keeps a pull quote and a callout apart", async () => {
    // Both are <blockquote data-block>. If either parse rule were written
    // loosely enough to match the other, one of the two blocks would take
    // on the other's styling everywhere it appears.
    const user = userEvent.setup();
    render(
      <Harness
        initialContent={
          // Opens on a paragraph so the caret does not land inside the
          // callout and mount its tone menu — jsdom has no layout for
          // BubbleMenu to position against.
          "<p>Intro</p>" +
          '<blockquote data-block="callout" data-tone="success"><p>A.</p></blockquote>' +
          '<blockquote data-block="pull-quote"><p>B.</p><p data-block="quote-attribution"></p></blockquote>'
        }
      />,
    );

    getEditor().focus();
    await user.type(getEditor(), "x", { skipClick: true });

    await waitFor(() => {
      const out = screen.getByTestId("content-html").textContent ?? "";
      expect(out).toContain('data-block="callout"');
      expect(out).toContain('data-tone="success"');
      expect(out).toContain('data-block="pull-quote"');
      // The pull quote has no tone of its own and must not inherit one.
      expect(out).not.toContain('data-block="pull-quote" data-tone');
    });
  });

  it("supplies the attribution for a quote saved without one", async () => {
    // A required child, so ProseMirror fills it in rather than rejecting
    // the document — which is what keeps an older pull quote openable.
    const user = userEvent.setup();
    render(
      <Harness initialContent='<blockquote data-block="pull-quote"><p>No name attached.</p></blockquote>' />,
    );

    getEditor().focus();
    await user.type(getEditor(), "x", { skipClick: true });

    await waitFor(() => {
      const out = screen.getByTestId("content-html").textContent ?? "";
      expect(out).toContain('data-block="pull-quote"');
      expect(out).toContain('data-block="quote-attribution"');
      expect(out).toContain("No name attached.");
    });
  });

  it("lifts the highlighted line into the quote", async () => {
    const user = userEvent.setup();
    render(<Harness initialContent="<p>The market turned in 2024.</p>" />);

    getEditor().focus();
    // Select the paragraph, then press the toolbar button.
    await user.keyboard("{Control>}a{/Control}");
    await user.click(screen.getByRole("button", { name: "Pull quote" }));

    await waitFor(() => {
      const out = screen.getByTestId("content-html").textContent ?? "";
      expect(out).toContain('data-block="pull-quote"');
      expect(out).toContain("The market turned in 2024.");
    });
  });
});

/*
  The CTA is a <figure>, which is the one block here that collides with an
  existing node rather than with StarterKit: Figure claims every <figure>
  and its getAttrs answers for all of them, image or not. So the CTA needs
  the priority *and* Figure needs to decline a data-block figure, and the
  test that matters is that a CTA survives a round trip with its link
  intact rather than coming back as an image with no src.
*/
describe("RichTextEditor — call to action", () => {
  it("round-trips the panel, its pitch and its button link", async () => {
    const user = userEvent.setup();
    const html =
      "<p>Intro</p>" +
      '<figure data-block="cta"><p>Ready to see it in person?</p>' +
      '<p data-block="cta-action"><a href="/contact">Book a private viewing</a></p></figure>';

    render(<Harness initialContent={html} />);
    getEditor().focus();
    await user.type(getEditor(), "x", { skipClick: true });

    await waitFor(() => {
      const out = screen.getByTestId("content-html").textContent ?? "";
      expect(out).toContain('data-block="cta"');
      expect(out).toContain('data-block="cta-action"');
      expect(out).toContain('href="/contact"');
      expect(out).toContain("Book a private viewing");
      // The tell that Figure took it instead: an <img> where none was.
      expect(out).not.toContain("<img");
    });
  });

  it("round-trips a project card as a figure holding one link", async () => {
    // The stored form is the reference lib/article-embeds.ts reads: the
    // slug lives in the href, so the markup says which project it points
    // at without a database to resolve it.
    const user = userEvent.setup();
    const html =
      "<p>Intro</p>" +
      '<figure data-block="project-card"><p><a href="/projects/residence-prime">Residence Prime</a></p></figure>';

    render(<Harness initialContent={html} />);
    getEditor().focus();
    await user.type(getEditor(), "x", { skipClick: true });

    await waitFor(() => {
      const out = screen.getByTestId("content-html").textContent ?? "";
      expect(out).toContain('data-block="project-card"');
      expect(out).toContain('href="/projects/residence-prime"');
      expect(out).not.toContain("<img");
    });
  });

  it("keeps a project card and a CTA apart", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initialContent={
          "<p>Intro</p>" +
          '<figure data-block="cta"><p>A</p><p data-block="cta-action"><a href="/contact">B</a></p></figure>' +
          '<figure data-block="project-card"><p><a href="/projects/x">C</a></p></figure>'
        }
      />,
    );

    getEditor().focus();
    await user.type(getEditor(), "x", { skipClick: true });

    await waitFor(() => {
      const out = screen.getByTestId("content-html").textContent ?? "";
      expect(out).toContain('data-block="cta"');
      expect(out).toContain('data-block="cta-action"');
      expect(out).toContain('data-block="project-card"');
    });
  });

  it("leaves an image figure an image figure", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initialContent={
          "<p>Intro</p>" +
          '<figure><img src="/a.jpg" alt="Villa"><figcaption>A villa</figcaption></figure>'
        }
      />,
    );

    getEditor().focus();
    await user.type(getEditor(), "x", { skipClick: true });

    await waitFor(() => {
      const out = screen.getByTestId("content-html").textContent ?? "";
      expect(out).toContain('src="/a.jpg"');
      expect(out).toContain("A villa");
      expect(out).not.toContain("data-block");
    });
  });
});

/*
  §6.3's outline. NewsSeoPanel lists headings by their index in
  getContentStats().headings, which is extracted from the HTML string with a
  regular expression and carries no document positions — so clicking row N
  has to find the Nth heading in the editor by counting, and the two counts
  have to agree about what a heading is.

  Two ways they can disagree, both of which put the caret in the wrong place
  rather than failing outright:
    - the FAQ question is an <h3> once serialized, so the extractor lists it
    - an empty heading is skipped by the extractor (`if (text)`), and every
      heading is empty for a moment after it is created

  Asserted by typing rather than by reading the selection: jsdom's
  window.getSelection() does not follow ProseMirror's, but where a typed
  character ends up in the emitted HTML is unambiguous.
*/
describe("RichTextEditor — outline click targets", () => {
  function OutlineHarness({ content }: { content: string }) {
    const editorRef = useRef<RichTextEditorHandle>(null);
    const [html, setHtml] = useState(content);
    return (
      <div>
        {[0, 1, 2].map((index) => (
          <button key={index} type="button" onClick={() => editorRef.current?.focusHeading(index)}>
            {`go ${index}`}
          </button>
        ))}
        <RichTextEditor
          ref={editorRef}
          content={content}
          onChange={setHtml}
          toolbarLabels={LABELS}
          figureLabels={FIGURE_LABELS}
          locale="en"
          onRequestLink={() => {}}
          onRequestEditLink={() => {}}
          onUploadNotice={() => {}}
          uploadLabels={{ failed: "f", tooLarge: "t", pastedImage: "p", byKey: (key) => key }}
          onRequestImage={() => {}}
        />
        <output data-testid="content-html">{html}</output>
      </div>
    );
  }

  /** Click outline row `index`, type a marker, and report the HTML. */
  async function typeAtRow(index: number): Promise<string> {
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: `go ${index}` }));
    // The click moved DOM focus to the button; ProseMirror's own selection
    // is already where focusHeading put it, so this only hands the keyboard
    // back to the editable element.
    getEditor().focus();
    await user.type(getEditor(), "X", { skipClick: true });
    await waitFor(() => expect(screen.getByTestId("content-html").textContent).toContain("X"));
    return screen.getByTestId("content-html").textContent ?? "";
  }

  it("puts the caret in the heading the row stands for", async () => {
    render(<OutlineHarness content="<h2>First</h2><p>a</p><h3>Second</h3><p>b</p><h2>Third</h2>" />);
    expect(await typeAtRow(1)).toContain("<h3>XSecond</h3>");
  });

  it("counts an FAQ question, because the outline lists it", async () => {
    render(
      <OutlineHarness
        content={
          "<h2>First</h2>" +
          '<ul data-faq="list"><li data-faq="item"><h3 data-faq="question">Counted?</h3><p>yes</p></li></ul>' +
          "<h2>Last</h2>"
        }
      />,
    );

    // Row 1 is the FAQ question, not "Last" — which is row 2.
    const html = await typeAtRow(1);
    expect(html).toContain("XCounted?");
    expect(html).toContain("<h2>Last</h2>");
  });

  it("skips an empty heading, because the extractor skips it", async () => {
    render(<OutlineHarness content="<h2>First</h2><h2></h2><h2>Third</h2>" />);
    // The outline shows two rows, so row 1 is "Third" and not the blank one.
    expect(await typeAtRow(1)).toContain("<h2>XThird</h2>");
  });
});

/*
  §6.3's other half: dragging an outline row moves that heading and
  everything under it — "under it" meaning up to the next heading of the
  same level or higher, so an H2 takes its H3s along rather than leaving
  them stranded beneath whatever ends up above them.

  Two refusals matter as much as the move. A nested heading (an FAQ
  question) is not a section: there is nothing under it but its own answer,
  and what it lives in is the FAQ list. And a section cannot be dropped
  inside itself, which is what dragging an H2 onto one of its own H3s asks
  for — the insert position would sit inside the range about to be deleted.
*/
describe("RichTextEditor — moving a section from the outline", () => {
  function MoveHarness({ content }: { content: string }) {
    const editorRef = useRef<RichTextEditorHandle>(null);
    const [html, setHtml] = useState(content);
    const moves: [number, number][] = [
      [0, 1],
      [1, 0],
      [0, 2],
      [2, 0],
      [1, 2],
    ];
    return (
      <div>
        {moves.map(([from, to]) => (
          <button
            key={`${from}-${to}`}
            type="button"
            onClick={() => editorRef.current?.moveSection(from, to)}
          >
            {`move ${from}->${to}`}
          </button>
        ))}
        <RichTextEditor
          ref={editorRef}
          content={content}
          onChange={setHtml}
          toolbarLabels={LABELS}
          figureLabels={FIGURE_LABELS}
          locale="en"
          onRequestLink={() => {}}
          onRequestEditLink={() => {}}
          onUploadNotice={() => {}}
          uploadLabels={{ failed: "f", tooLarge: "t", pastedImage: "p", byKey: (key) => key }}
          onRequestImage={() => {}}
        />
        <output data-testid="content-html">{html}</output>
      </div>
    );
  }

  const html = () => screen.getByTestId("content-html").textContent ?? "";

  it("takes the blocks under a heading with it", async () => {
    const user = userEvent.setup();
    render(<MoveHarness content="<h2>A</h2><p>a1</p><p>a2</p><h2>B</h2><p>b1</p>" />);

    await user.click(screen.getByRole("button", { name: "move 0->1" }));
    await waitFor(() => expect(html()).toBe("<h2>B</h2><p>b1</p><h2>A</h2><p>a1</p><p>a2</p>"));
  });

  it("takes subsections along, so an H3 does not get stranded", async () => {
    const user = userEvent.setup();
    render(
      <MoveHarness content="<h2>A</h2><p>a1</p><h3>A2</h3><p>a2</p><h2>B</h2><p>b1</p>" />,
    );

    // Rows: 0 = A (H2), 1 = A2 (H3), 2 = B (H2). Moving A past B must carry
    // A2 with it rather than leaving it under B.
    await user.click(screen.getByRole("button", { name: "move 0->2" }));
    await waitFor(() =>
      expect(html()).toBe("<h2>B</h2><p>b1</p><h2>A</h2><p>a1</p><h3>A2</h3><p>a2</p>"),
    );
  });

  it("stops a subsection at the next higher-level heading instead of swallowing it", async () => {
    // The case that tells `level <= this.level` apart from `level ===`.
    // A2 is an H3; the heading that ends its section is an H2, which is
    // higher, not equal. Read as "equal", A2's section runs to the end of
    // the document and takes B with it — and moving it then changes
    // nothing at all, which looks like the feature simply not working.
    const user = userEvent.setup();
    render(<MoveHarness content="<h2>A</h2><p>a1</p><h3>A2</h3><p>a2</p><h2>B</h2><p>b1</p>" />);

    await user.click(screen.getByRole("button", { name: "move 1->2" }));
    await waitFor(() =>
      expect(html()).toBe("<h2>A</h2><p>a1</p><h2>B</h2><p>b1</p><h3>A2</h3><p>a2</p>"),
    );
  });

  it("moves a section back up", async () => {
    const user = userEvent.setup();
    render(<MoveHarness content="<h2>A</h2><p>a1</p><h2>B</h2><p>b1</p>" />);

    await user.click(screen.getByRole("button", { name: "move 1->0" }));
    await waitFor(() => expect(html()).toBe("<h2>B</h2><p>b1</p><h2>A</h2><p>a1</p>"));
  });

  it("refuses to move an FAQ question, which is not a section", async () => {
    const user = userEvent.setup();
    const content =
      "<h2>A</h2><p>a1</p>" +
      '<ul data-faq="list"><li data-faq="item"><h3 data-faq="question">Q</h3><p>ans</p></li></ul>' +
      "<h2>B</h2><p>b1</p>";
    render(<MoveHarness content={content} />);

    // Row 1 is the FAQ question.
    await user.click(screen.getByRole("button", { name: "move 1->0" }));
    // Nothing changed, so onChange never fired and the output is untouched.
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(html()).toBe(content);
  });

  it("refuses to drop a section inside itself", async () => {
    const user = userEvent.setup();
    const content = "<h2>A</h2><p>a1</p><h3>A2</h3><p>a2</p>";
    render(<MoveHarness content={content} />);

    // Row 1 (A2) lies inside row 0's (A's) section.
    await user.click(screen.getByRole("button", { name: "move 0->1" }));
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(html()).toBe(content);
  });
});
