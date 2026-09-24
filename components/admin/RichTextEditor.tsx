"use client";

/**
 * components/admin/RichTextEditor.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The `contentFormat: HTML` half of the news editor's body field — see
 * NewsForm.tsx's header for why this coexists with the old Markdown
 * textarea rather than replacing it. TipTap stores and round-trips HTML
 * directly, so unlike a Markdown-backed WYSIWYG layer this never converts
 * the document on every keystroke; the lossy-round-trip failure mode the
 * old header comment warned about simply doesn't exist here.
 *
 * Owns its own `useEditor()` instance and reports out via `onChange(html)`
 * on every update — NewsForm still owns the actual `content` state
 * variable (unchanged from the Markdown path) and still submits it
 * through a hidden `<input name="content">`, so createArticle/
 * updateArticle's contract needs no changes for this to work.
 *
 * `ref` exposes exactly one imperative method, `setFirstHeadingText` —
 * the title→body half of the title↔H1 sync lib/heading-policy.ts's
 * header describes. It is a no-op unless the document's first node is
 * already an H1: this codebase does not synthesize a heading out of
 * nowhere just because the title field changed, only keeps one in sync
 * once an editor has actually put one there. The body→title half is the
 * `onFirstH1TextChange` callback below, fired from the same `onUpdate`
 * that reports the HTML.
 *
 * The custom `figure` node (not TipTap's stock Image extension, which
 * only gives a bare `<img>`) carries a React NodeView so an inserted image
 * stays editable — alignment, caption and alt text all change in place.
 * Its caption is editable content rather than an attribute; see the node's
 * own comment for why that needed no data migration.
 * Alignment rides on `data-align`, not a class, because lib/markdown.ts's
 * sanitizer allowlist has no `class`/`style` — see that file's comment on
 * why `data-align` was added there for exactly this.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { forwardRef, useImperativeHandle, useMemo, useState } from "react";
import { EditorContent, ReactNodeViewRenderer, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TiptapLink from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import FigureNodeView, {
  type FigureLabels,
  type FigureOptions,
} from "@/components/admin/editor/FigureNodeView";
import { Extension, Node } from "@tiptap/core";
import {
  Bold,
  Heading2,
  Heading3,
  Heading4,
  Image as ImageIcon,
  Italic,
  Link2,
  List,
  ListOrdered,
  Pilcrow,
  Quote,
} from "lucide-react";

export type RichTextEditorHandle = {
  /** No-op unless the document's first node is already an H1 — see the
   *  file header. */
  setFirstHeadingText: (text: string) => void;
  insertLink: (link: InsertedLink) => void;
  insertImage: (image: InsertedImage) => void;
  /** The editor's current text selection — NewsForm reads this right
   *  before opening InternalLinkModal, to prefill anchor text with
   *  whatever was highlighted when the admin asked for a link. */
  getSelectedText: () => string;
};

export type InsertedLink = {
  path: string;
  anchorText: string;
  newTab: boolean;
  nofollow: boolean;
  /** Unset for a plain external/manual URL — see InternalLinkModal. */
  internal: boolean;
};

export type InsertedImage = {
  src: string;
  alt: string;
  caption: string;
  align: "left" | "center" | "right" | null;
  loading: "lazy" | "eager";
  mediaId: string | null;
};

type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

/** The internal-link mark, extended with one attribute TipTap's stock
 *  Link doesn't have: `data-internal`, so the render path and a future
 *  orphan-page scan can tell an editor-inserted internal link apart from
 *  hand-typed markup without re-parsing the URL. */
const InternalAwareLink = TiptapLink.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      internal: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("data-internal"),
        renderHTML: (attributes: { internal?: string | null }) =>
          attributes.internal ? { "data-internal": attributes.internal } : {},
      },
    };
  },
});

/**
 * `<figure><img/><figcaption/></figure>`, with the caption as real editable
 * content.
 *
 * It used to be `atom: true` with the caption as a plain attribute, which
 * made the whole image write-once: clicking it did nothing, so any change
 * meant deleting it and re-inserting through the modal. `content: "inline*"`
 * plus the NodeView below is what makes it editable in place — see
 * components/admin/editor/FigureNodeView.tsx.
 *
 * No data migration was needed for that change, and this is the reason:
 * the caption only ever *existed* as an attribute inside the node's own
 * head. On disk it has always been written as `<figcaption>text</figcaption>`
 * by renderHTML, which is exactly what `content` parses back out of.
 *
 * `isolating` keeps Backspace at the start of a caption from lifting the
 * caret out into the surrounding document and deleting the image with it.
 */
const Figure = Node.create<FigureOptions>({
  name: "figure",
  group: "block",
  content: "inline*",
  draggable: true,
  isolating: true,

  addOptions() {
    return { labels: null, locale: "en" };
  },

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: "" },
      align: { default: null as "left" | "center" | "right" | null },
      loading: { default: "lazy" },
      mediaId: { default: null as string | null },
    };
  },

  parseHTML() {
    return [
      {
        tag: "figure",
        /*
          A function rather than the `"figcaption"` string form. Given a
          selector that matches nothing — every figure saved before captions
          became content, including ones already in the database — the string
          form leaves ProseMirror parsing the figure's children as the
          caption, which swallows the `<img>` into the caption text and
          loses the image. An empty detached element parses as empty content,
          which is what a caption-less figure should be.
        */
        contentElement: (element) =>
          (element as HTMLElement).querySelector("figcaption") ??
          document.createElement("figcaption"),
        getAttrs: (element) => {
          if (typeof element === "string") return false;
          const img = element.querySelector("img");
          return {
            src: img?.getAttribute("src") ?? null,
            alt: img?.getAttribute("alt") ?? "",
            loading: img?.getAttribute("loading") ?? "lazy",
            mediaId: img?.getAttribute("data-media-id") ?? null,
            align: element.getAttribute("data-align") ?? null,
          };
        },
      },
    ];
  },

  renderHTML({ node }) {
    const { src, alt, align, loading, mediaId } = node.attrs;

    return [
      "figure",
      align ? { "data-align": align } : {},
      [
        "img",
        {
          src: src ?? "",
          alt: alt ?? "",
          loading: loading ?? "lazy",
          ...(mediaId ? { "data-media-id": mediaId } : {}),
        },
      ],
      // 0 is the content hole: whatever the caption holds is serialized
      // here, and an empty one leaves `<figcaption></figcaption>`, which
      // prose-article hides rather than rendering as a blank line.
      ["figcaption", {}, 0],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(FigureNodeView);
  },
});

/** ⌥⌘0 → paragraph, ⌥⌘1–⌥⌘6 → H1–H6 — the keyboard-shortcut half of
 *  section 2.1's "text style" requirement; the dropdown/quick buttons
 *  below are the mouse half of the same commands. */
const HeadingShortcuts = Extension.create({
  name: "headingShortcuts",
  addKeyboardShortcuts() {
    const shortcuts: Record<string, () => boolean> = {
      "Mod-Alt-0": () => this.editor.chain().focus().setParagraph().run(),
    };
    for (let level = 1; level <= 6; level += 1) {
      shortcuts[`Mod-Alt-${level}`] = () =>
        this.editor
          .chain()
          .focus()
          .toggleHeading({ level: level as HeadingLevel })
          .run();
    }
    return shortcuts;
  },
});

type Props = {
  content: string;
  onChange: (html: string) => void;
  onFirstH1TextChange?: (text: string | null) => void;
  placeholder?: string;
  toolbarLabels: {
    paragraph: string;
    heading: (level: HeadingLevel) => string;
    bold: string;
    italic: string;
    bulletList: string;
    orderedList: string;
    quote: string;
    link: string;
    image: string;
    textStyle: string;
  };
  /** Passed through to the figure NodeView, which cannot read
   *  useTranslations itself — see FigureNodeView's header. */
  figureLabels: FigureLabels;
  /** Which locale's alt text an edit writes back to in the media library. */
  locale: string;
  onRequestLink: () => void;
  onRequestImage: () => void;
};

/** The first node's level, or null if it isn't a heading. */
function firstHeadingLevel(editor: Editor): HeadingLevel | null {
  const first = editor.state.doc.firstChild;
  if (!first || first.type.name !== "heading") return null;
  return first.attrs.level as HeadingLevel;
}

const RichTextEditor = forwardRef<RichTextEditorHandle, Props>(function RichTextEditor(
  {
    content,
    onChange,
    onFirstH1TextChange,
    placeholder,
    toolbarLabels,
    figureLabels,
    locale,
    onRequestLink,
    onRequestImage,
  },
  ref,
) {
  const [activeHeading, setActiveHeading] = useState<HeadingLevel | 0>(0);

  const extensions = useMemo(
    () => [
      // `link: false` — TipTap 3's StarterKit bundles @tiptap/extension-link
      // itself now (unlike v2); left enabled, it registers a second `link`
      // mark alongside InternalAwareLink below and TipTap warns about the
      // duplicate name and picks one arbitrarily.
      StarterKit.configure({ heading: { levels: [1, 2, 3, 4, 5, 6] }, link: false }),
      InternalAwareLink.configure({ openOnClick: false, autolink: false }),
      Placeholder.configure({ placeholder: placeholder ?? "" }),
      Figure.configure({ labels: figureLabels, locale }),
      HeadingShortcuts,
    ],
    [placeholder, figureLabels, locale],
  );

  const editor = useEditor({
    extensions,
    content,
    immediatelyRender: false,
    editorProps: {
      // The browser's own contenteditable caret-follows-focus behavior
      // already keeps the cursor in view for an editor this size;
      // ProseMirror's own scroll-into-view pass is a supplementary
      // safety net this component doesn't need, and `true` (meaning
      // "already handled") is what avoids it here.
      handleScrollToSelection: () => true,
    },
    onUpdate: ({ editor: instance }) => {
      onChange(instance.getHTML());

      const firstNode = instance.state.doc.firstChild;
      const isH1 = firstNode?.type.name === "heading" && firstNode.attrs.level === 1;
      onFirstH1TextChange?.(isH1 ? firstNode!.textContent : null);
    },
    onSelectionUpdate: ({ editor: instance }) => {
      setActiveHeading(firstHeadingLevelAtSelection(instance));
    },
  });

  function insertLink(link: InsertedLink) {
    if (!editor) return;
    const rel = [link.newTab ? "noopener noreferrer" : null, link.nofollow ? "nofollow" : null]
      .filter(Boolean)
      .join(" ");

    const attrs = {
      href: link.path,
      target: link.newTab ? "_blank" : null,
      rel: rel || null,
      internal: link.internal ? "true" : null,
    };

    const { from, to } = editor.state.selection;
    if (from === to) {
      editor
        .chain()
        .focus()
        .insertContent({
          type: "text",
          text: link.anchorText || link.path,
          marks: [{ type: "link", attrs }],
        })
        .run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink(attrs).run();
    }
  }

  function insertImage(image: InsertedImage) {
    if (!editor) return;
    editor
      .chain()
      .focus()
      .insertContent({
        type: "figure",
        attrs: {
          src: image.src,
          alt: image.alt,
          align: image.align,
          loading: image.loading,
          mediaId: image.mediaId,
        },
        // The caption is the node's content now, so it is inserted as a
        // text child rather than set as an attribute. Omitted entirely
        // when blank: an empty text node is not a valid child.
        ...(image.caption ? { content: [{ type: "text", text: image.caption }] } : {}),
      })
      .run();
  }

  // Exposed for the parent's link/image modals to call back into once the
  // admin has made a choice — see NewsForm.tsx.
  useImperativeHandle(
    ref,
    () => ({
      setFirstHeadingText(text: string) {
        if (!editor) return;
        const firstNode = editor.state.doc.firstChild;
        if (!firstNode || firstNode.type.name !== "heading" || firstNode.attrs.level !== 1) return;
        if (firstNode.textContent === text) return;

        const from = 1;
        const to = firstNode.nodeSize - 1;
        editor.chain().insertContentAt({ from, to }, text).run();
      },
      insertLink,
      insertImage,
      getSelectedText() {
        if (!editor) return "";
        const { from, to } = editor.state.selection;
        return editor.state.doc.textBetween(from, to, " ");
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor],
  );

  if (!editor) return null;

  const headingButton = (level: 2 | 3 | 4, Icon: typeof Heading2) => (
    <button
      type="button"
      title={toolbarLabels.heading(level)}
      aria-label={toolbarLabels.heading(level)}
      aria-pressed={activeHeading === level}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => editor.chain().focus().toggleHeading({ level }).run()}
      className={toolbarButtonClass(activeHeading === level)}
    >
      <Icon size={15} aria-hidden />
    </button>
  );

  return (
    <div>
      <div role="toolbar" aria-label={toolbarLabels.textStyle} className="mb-2 flex flex-wrap gap-1">
        <select
          aria-label={toolbarLabels.textStyle}
          value={activeHeading}
          onChange={(event) => {
            const value = Number(event.target.value) as HeadingLevel | 0;
            if (value === 0) editor.chain().focus().setParagraph().run();
            else editor.chain().focus().toggleHeading({ level: value }).run();
          }}
          className="admin-input h-8 w-auto! py-0! text-xs"
        >
          <option value={0}>{toolbarLabels.paragraph}</option>
          {([1, 2, 3, 4, 5, 6] as const).map((level) => (
            <option key={level} value={level}>
              {toolbarLabels.heading(level)}
            </option>
          ))}
        </select>

        {headingButton(2, Heading2)}
        {headingButton(3, Heading3)}
        {headingButton(4, Heading4)}

        <button
          type="button"
          title={toolbarLabels.paragraph}
          aria-label={toolbarLabels.paragraph}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => editor.chain().focus().setParagraph().run()}
          className={toolbarButtonClass(activeHeading === 0)}
        >
          <Pilcrow size={15} aria-hidden />
        </button>

        <span className="mx-1 w-px self-stretch bg-primary/10" />

        <button
          type="button"
          title={toolbarLabels.bold}
          aria-label={toolbarLabels.bold}
          aria-pressed={editor.isActive("bold")}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={toolbarButtonClass(editor.isActive("bold"))}
        >
          <Bold size={15} aria-hidden />
        </button>
        <button
          type="button"
          title={toolbarLabels.italic}
          aria-label={toolbarLabels.italic}
          aria-pressed={editor.isActive("italic")}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={toolbarButtonClass(editor.isActive("italic"))}
        >
          <Italic size={15} aria-hidden />
        </button>
        <button
          type="button"
          title={toolbarLabels.bulletList}
          aria-label={toolbarLabels.bulletList}
          aria-pressed={editor.isActive("bulletList")}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={toolbarButtonClass(editor.isActive("bulletList"))}
        >
          <List size={15} aria-hidden />
        </button>
        <button
          type="button"
          title={toolbarLabels.orderedList}
          aria-label={toolbarLabels.orderedList}
          aria-pressed={editor.isActive("orderedList")}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={toolbarButtonClass(editor.isActive("orderedList"))}
        >
          <ListOrdered size={15} aria-hidden />
        </button>
        <button
          type="button"
          title={toolbarLabels.quote}
          aria-label={toolbarLabels.quote}
          aria-pressed={editor.isActive("blockquote")}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          className={toolbarButtonClass(editor.isActive("blockquote"))}
        >
          <Quote size={15} aria-hidden />
        </button>

        <span className="mx-1 w-px self-stretch bg-primary/10" />

        <button
          type="button"
          title={toolbarLabels.link}
          aria-label={toolbarLabels.link}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onRequestLink}
          className={toolbarButtonClass(false)}
        >
          <Link2 size={15} aria-hidden />
        </button>
        <button
          type="button"
          title={toolbarLabels.image}
          aria-label={toolbarLabels.image}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onRequestImage}
          className={toolbarButtonClass(false)}
        >
          <ImageIcon size={15} aria-hidden />
        </button>
      </div>

      <EditorContent
        editor={editor}
        /* prose-article hides an empty figcaption so a caption-less image
           does not leave a blank line on the public page. In here that same
           rule would hide the very line an admin is trying to type a caption
           into, so it is put back — with a minimum height, since an empty
           inline container is zero pixels tall and impossible to click. */
        className="admin-textarea prose-article min-h-[320px] max-w-none [&_.ProseMirror]:min-h-[300px] [&_.ProseMirror]:outline-none [&_.ProseMirror_figcaption:empty]:block [&_.ProseMirror_figcaption]:min-h-[1.25rem]"
        onKeyDownCapture={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
            event.preventDefault();
            onRequestLink();
          }
        }}
      />
    </div>
  );
});

export default RichTextEditor;

function toolbarButtonClass(active: boolean): string {
  return `inline-flex h-8 w-8 items-center justify-center rounded-xs border text-ink-muted transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-primary ${
    active ? "border-primary/40 bg-primary/5 text-primary" : "border-primary/10"
  }`;
}

/** Level of the heading containing the current selection, or 0 for a
 *  plain paragraph / anything else — drives the toolbar's active state. */
function firstHeadingLevelAtSelection(editor: Editor): HeadingLevel | 0 {
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth >= 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === "heading") return node.attrs.level as HeadingLevel;
  }
  return 0;
}
