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

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { EditorContent, ReactNodeViewRenderer, useEditor, type Editor } from "@tiptap/react";
// TipTap 3 moved the menus into a subpath of the same package — no extra
// dependency, verified against @tiptap/react's own exports map.
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import TiptapLink from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import FigureNodeView, {
  type FigureLabels,
  type FigureOptions,
} from "@/components/admin/editor/FigureNodeView";
import { Extension, Node } from "@tiptap/core";
import { cleanPastedHtml, hasInlineImageData } from "@/lib/paste-html";
import { IMAGE_TYPES, uploadToLibrary } from "@/lib/admin/media-upload";
import {
  Bold,
  Code,
  ExternalLink,
  HelpCircle,
  Pencil,
  RemoveFormatting,
  Redo2,
  Undo2,
  Unlink,
  Minus,
  SquareCode,
  Strikethrough,
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
  width: "normal" | "wide" | "full";
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
      /*
        Overridden to default to null, and this is not cosmetic. TipTap's
        Link ships HTMLAttributes defaults of target="_blank" and
        rel="noopener noreferrer nofollow", and its own target/rel
        attributes fall back to them — so a link parsed out of an existing
        article, which carries neither, picked both up and was written back
        with them. Merely opening an old article and saving it turned every
        plain internal link into a new-tab nofollow link: nofollow on our
        own pages, in the editor built to do this site's SEO.

        Set here rather than through configure({ HTMLAttributes: {} }),
        which deep-merges and so leaves the defaults exactly where they
        were. insertLink still sets both explicitly, so an author's actual
        choice is unaffected.
      */
      target: { default: null },
      rel: { default: null },
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
      // "normal" is the absence of a width choice, not a third size — see
      // prose-article, where it deliberately has no rules of its own so a
      // figure carrying it renders exactly like one written before
      // data-width existed.
      width: { default: "normal" as "normal" | "wide" | "full" },
      /*
        Transient, and deliberately absent from renderHTML and parseHTML:
        they describe an upload in flight, not the article. A figure is
        inserted the moment a file is dropped — so the author sees it land
        where they aimed — and these carry the progress bar until the real
        src and mediaId arrive.
      */
      uploading: { default: false, rendered: false },
      uploadProgress: { default: 0, rendered: false },
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
            width: element.getAttribute("data-width") ?? "normal",
          };
        },
      },
    ];
  },

  renderHTML({ node }) {
    const { src, alt, align, width, loading, mediaId } = node.attrs;

    return [
      "figure",
      {
        ...(align ? { "data-align": align } : {}),
        // Omitted when "normal", so a figure nobody resized stays
        // byte-identical to how it was stored before this attribute.
        ...(width && width !== "normal" ? { "data-width": width } : {}),
      },
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

/**
 * The FAQ block: `<ul data-faq="list">` of `<li data-faq="item">`, each
 * holding an `<h3 data-faq="question">` and one or more answer blocks.
 *
 * Built out of tags the sanitizer already allows, with a single `data-faq`
 * attribute to mark them — see lib/markdown.ts's ALLOWED_ATTR. It could
 * have been a `<div class="faq">`, and that is exactly the trade refused:
 * letting div/class/style back through the allowlist to make a block look
 * right is reopening the XSS surface for decoration.
 *
 * The question is a real `<h3>` rather than a styled paragraph, so it
 * appears in the article's outline and is read as a heading by a screen
 * reader — a FAQ's questions *are* its headings.
 *
 * There is no separate "answer" node wrapping the answer blocks: nothing
 * in the allowlist can serve as that wrapper, and `<li>` can hold them
 * directly. So an item is a question followed by blocks, which is also
 * exactly what lib/faq-block.ts reads back out.
 */
const FaqList = Node.create({
  name: "faqList",
  group: "block",
  content: "faqItem+",

  parseHTML() {
    // Priority, because StarterKit's bulletList also claims <ul> and parse
    // rules are settled by priority rather than by selector specificity —
    // left at the default, the generic rule wins and a FAQ comes back as
    // an ordinary bullet list with its markers stripped.
    return [{ tag: 'ul[data-faq="list"]', priority: 60 }];
  },

  renderHTML() {
    return ["ul", { "data-faq": "list" }, 0];
  },
});

const FaqItem = Node.create({
  name: "faqItem",
  content: "faqQuestion block+",
  defining: true,

  parseHTML() {
    return [{ tag: 'li[data-faq="item"]', priority: 60 }];
  },

  renderHTML() {
    return ["li", { "data-faq": "item" }, 0];
  },
});

const FaqQuestion = Node.create({
  name: "faqQuestion",
  content: "inline*",
  defining: true,

  parseHTML() {
    return [{ tag: 'h3[data-faq="question"]', priority: 60 }];
  },

  renderHTML() {
    return ["h3", { "data-faq": "question" }, 0];
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
    strike: string;
    code: string;
    codeBlock: string;
    horizontalRule: string;
    bulletList: string;
    orderedList: string;
    quote: string;
    link: string;
    image: string;
    faq: string;
    textStyle: string;
    undo: string;
    redo: string;
    clearFormat: string;
    editLink: string;
    openLink: string;
    removeLink: string;
  };
  /** Passed through to the figure NodeView, which cannot read
   *  useTranslations itself — see FigureNodeView's header. */
  figureLabels: FigureLabels;
  /** Which locale's alt text an edit writes back to in the media library. */
  locale: string;
  onRequestLink: () => void;
  /** Opens the same link modal, prefilled, for a link that already exists
   *  — see the link bubble menu below. */
  onRequestEditLink: (current: { href: string; newTab: boolean; nofollow: boolean }) => void;
  onRequestImage: () => void;
  /** Surfaced by NewsForm as a toast — upload failures, and the "that
   *  image has to be uploaded" notice for a pasted base64 blob. */
  onUploadNotice: (message: string) => void;
  /** admin.upload.* messages, resolved by the caller for the same reason
   *  the toolbar labels are. */
  uploadLabels: {
    failed: string;
    tooLarge: string;
    pastedImage: string;
    byKey: (key: string) => string;
  };
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
    onRequestEditLink,
    onRequestImage,
    onUploadNotice,
    uploadLabels,
  },
  ref,
) {
  const [activeHeading, setActiveHeading] = useState<HeadingLevel | 0>(0);

  /*
    ⌘ on a Mac, Ctrl everywhere else. Resolved in an effect rather than
    during render: the server has no navigator, and baking one guess into
    the HTML makes the first client render disagree with it.
  */
  const [isMac, setIsMac] = useState(false);
  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent));
  }, []);

  /** "Bold" -> "Bold (⌘B)". The shortcut is TipTap's, not ours, so it is
   *  appended here rather than written into forty translation strings. */
  const withKeys = useMemo(() => {
    const mod = isMac ? "⌘" : "Ctrl+";
    const alt = isMac ? "⌥" : "Alt+";
    return (label: string, keys?: string) =>
      keys ? `${label} (${keys.replace(/Mod/g, mod).replace(/Alt/g, alt)})` : label;
  }, [isMac]);

  /* useEditor's own config cannot see the editor it is building, and the
     drop/paste handlers need it — so they read it back through a ref that
     is filled in as soon as the instance exists. */
  const editorRef = useRef<Editor | null>(null);

  /*
    Dropping or pasting an image goes through the same presign → PUT →
    createMedia path the library's own upload button uses — see
    lib/admin/media-upload.ts, which exists so there is exactly one of
    them. The figure is inserted first, carrying a blob: preview and the
    progress bar, so the image appears where it was aimed rather than
    after the round trip; the real src and mediaId replace them when the
    upload lands, and the whole node is removed if it does not.

    alt is deliberately left empty: FigureNodeView badges an image without
    one, and lib/article-seo.ts still refuses to publish an article that
    has any. Forcing a modal here would put the four clicks back that this
    exists to remove.
  */
  async function uploadIntoEditor(instance: Editor, files: File[], at?: number) {
    for (const file of files) {
      if (!IMAGE_TYPES.includes(file.type)) continue;

      const preview = URL.createObjectURL(file);
      const position = at ?? instance.state.selection.from;

      instance
        .chain()
        .insertContentAt(position, {
          type: "figure",
          attrs: { src: preview, alt: "", uploading: true, uploadProgress: 0 },
        })
        .run();

      /** Re-found each time rather than remembered: every keystroke the
       *  author makes while the upload runs shifts the document, and a
       *  position captured up front would update the wrong node. */
      const withNode = (fn: (pos: number) => void) => {
        let found: number | null = null;
        instance.state.doc.descendants((node, pos) => {
          if (node.type.name === "figure" && node.attrs.src === preview) found = pos;
          return found === null;
        });
        if (found !== null) fn(found);
      };

      try {
        const result = await uploadToLibrary(locale, file, (percent) =>
          withNode((pos) =>
            instance.view.dispatch(
              instance.state.tr.setNodeAttribute(pos, "uploadProgress", percent),
            ),
          ),
        );

        if (!result.ok) {
          withNode((pos) => instance.commands.deleteRange({ from: pos, to: pos + 1 }));
          onUploadNotice(
            result.messageKey ? uploadLabels.byKey(result.messageKey) : uploadLabels.failed,
          );
          continue;
        }

        withNode((pos) => {
          const tr = instance.state.tr
            .setNodeAttribute(pos, "src", result.url)
            .setNodeAttribute(pos, "mediaId", result.id)
            .setNodeAttribute(pos, "uploading", false)
            .setNodeAttribute(pos, "uploadProgress", 100);
          instance.view.dispatch(tr);
        });
      } catch {
        withNode((pos) => instance.commands.deleteRange({ from: pos, to: pos + 1 }));
        onUploadNotice(uploadLabels.failed);
      } finally {
        URL.revokeObjectURL(preview);
      }
    }
  }

  const extensions = useMemo(
    () => [
      // `link: false` — TipTap 3's StarterKit bundles @tiptap/extension-link
      // itself now (unlike v2); left enabled, it registers a second `link`
      // mark alongside InternalAwareLink below and TipTap warns about the
      // duplicate name and picks one arbitrarily.
      /*
        `underline: false` — StarterKit enables it whether or not a button
        exists, so ⌘U produced a <u> the sanitizer then dropped on save:
        the author saw underlined text, pressed save, and it came back
        plain, with nothing to explain why. Disabled at the source rather
        than widened into the allowlist, because prose-article already
        underlines links (`& a { @apply underline }`) — underlined body
        text would read as a link that cannot be clicked, which is worse
        for a reader using it as a cue than for one who never sees it.
      */
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
        link: false,
        underline: false,
      }),
      InternalAwareLink.configure({ openOnClick: false, autolink: false }),
      Placeholder.configure({ placeholder: placeholder ?? "" }),
      Figure.configure({ labels: figureLabels, locale }),
      FaqList,
      FaqItem,
      FaqQuestion,
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

      handleDrop: (view, event) => {
        const files = Array.from(event.dataTransfer?.files ?? []).filter((file) =>
          IMAGE_TYPES.includes(file.type),
        );
        if (files.length === 0) return false;

        event.preventDefault();
        // Where it was actually dropped, not where the caret happened to
        // be — the whole point of aiming at a spot in the document.
        const at = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        const instance = editorRef.current;
        if (!instance) return false;
        void uploadIntoEditor(instance, files, at);
        return true;
      },

      handlePaste: (view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []).filter((file) =>
          IMAGE_TYPES.includes(file.type),
        );
        if (files.length > 0) {
          const instance = editorRef.current;
          if (!instance) return false;
          event.preventDefault();
          void uploadIntoEditor(instance, files);
          return true;
        }

        // A base64 image inside pasted HTML — Word does this with
        // screenshots. lib/markdown.ts's sanitizer refuses data: URLs, so
        // it used to disappear on save without a word.
        const html = event.clipboardData?.getData("text/html");
        if (html && hasInlineImageData(html)) onUploadNotice(uploadLabels.pastedImage);

        return false;
      },

      // Word and Google Docs wrap every run in styled spans, which TipTap's
      // schema has no rule for and therefore drops — see lib/paste-html.ts.
      transformPastedHTML: (html) => cleanPastedHtml(html),
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
          width: image.width,
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
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

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
      {/* sticky, because the SEO checklist this editor sits next to asks for
          600+ words and the toolbar used to scroll away above all of them.
          lg:top-14 clears AdminTopbar, which is h-14 and only rendered from
          lg: up (it is `hidden … lg:flex`); z-20 sits under its z-30 rather
          than fighting it. */}
      <div
        role="toolbar"
        aria-label={toolbarLabels.textStyle}
        className="sticky top-0 z-20 -mx-1 mb-2 flex flex-wrap gap-1 border-b border-primary/10 bg-surface-raised px-1 py-1.5 lg:top-14"
      >
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
          title={withKeys(toolbarLabels.bold, "ModB")}
          aria-label={withKeys(toolbarLabels.bold, "ModB")}
          aria-pressed={editor.isActive("bold")}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={toolbarButtonClass(editor.isActive("bold"))}
        >
          <Bold size={15} aria-hidden />
        </button>
        <button
          type="button"
          title={withKeys(toolbarLabels.italic, "ModI")}
          aria-label={withKeys(toolbarLabels.italic, "ModI")}
          aria-pressed={editor.isActive("italic")}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={toolbarButtonClass(editor.isActive("italic"))}
        >
          <Italic size={15} aria-hidden />
        </button>
        {/*
          Strike, inline code, code block and the horizontal rule all had
          working keyboard shortcuts and no way to discover them: StarterKit
          binds them regardless of the toolbar. Strike is the one that was
          also being dropped on save — see lib/markdown.ts's RICH_TEXT_TAGS
          — the other three round-tripped fine and were merely unreachable
          with a mouse.
        */}
        <button
          type="button"
          title={withKeys(toolbarLabels.strike, "ModShift+X")}
          aria-label={withKeys(toolbarLabels.strike, "ModShift+X")}
          aria-pressed={editor.isActive("strike")}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          className={toolbarButtonClass(editor.isActive("strike"))}
        >
          <Strikethrough size={15} aria-hidden />
        </button>
        <button
          type="button"
          title={withKeys(toolbarLabels.code, "ModE")}
          aria-label={withKeys(toolbarLabels.code, "ModE")}
          aria-pressed={editor.isActive("code")}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => editor.chain().focus().toggleCode().run()}
          className={toolbarButtonClass(editor.isActive("code"))}
        >
          <Code size={15} aria-hidden />
        </button>
        <button
          type="button"
          title={toolbarLabels.codeBlock}
          aria-label={toolbarLabels.codeBlock}
          aria-pressed={editor.isActive("codeBlock")}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          className={toolbarButtonClass(editor.isActive("codeBlock"))}
        >
          <SquareCode size={15} aria-hidden />
        </button>
        <button
          type="button"
          title={toolbarLabels.horizontalRule}
          aria-label={toolbarLabels.horizontalRule}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          className={toolbarButtonClass(false)}
        >
          <Minus size={15} aria-hidden />
        </button>
        <span aria-hidden className="mx-1 h-5 w-px self-center bg-primary/15" />

        {/* History was always on — StarterKit's undoRedo — with no way to
            reach it but the keyboard. */}
        <button
          type="button"
          title={withKeys(toolbarLabels.undo, "ModZ")}
          aria-label={withKeys(toolbarLabels.undo, "ModZ")}
          disabled={!editor.can().undo()}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => editor.chain().focus().undo().run()}
          className={`${toolbarButtonClass(false)} disabled:cursor-not-allowed disabled:opacity-40`}
        >
          <Undo2 size={15} aria-hidden />
        </button>
        <button
          type="button"
          title={withKeys(toolbarLabels.redo, "ModShift+Z")}
          aria-label={withKeys(toolbarLabels.redo, "ModShift+Z")}
          disabled={!editor.can().redo()}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => editor.chain().focus().redo().run()}
          className={`${toolbarButtonClass(false)} disabled:cursor-not-allowed disabled:opacity-40`}
        >
          <Redo2 size={15} aria-hidden />
        </button>
        <button
          type="button"
          title={toolbarLabels.clearFormat}
          aria-label={toolbarLabels.clearFormat}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => editor.chain().focus().unsetAllMarks().run()}
          className={toolbarButtonClass(false)}
        >
          <RemoveFormatting size={15} aria-hidden />
        </button>
        <button
          type="button"
          title={withKeys(toolbarLabels.bulletList, "ModShift+8")}
          aria-label={withKeys(toolbarLabels.bulletList, "ModShift+8")}
          aria-pressed={editor.isActive("bulletList")}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={toolbarButtonClass(editor.isActive("bulletList"))}
        >
          <List size={15} aria-hidden />
        </button>
        <button
          type="button"
          title={withKeys(toolbarLabels.orderedList, "ModShift+7")}
          aria-label={withKeys(toolbarLabels.orderedList, "ModShift+7")}
          aria-pressed={editor.isActive("orderedList")}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={toolbarButtonClass(editor.isActive("orderedList"))}
        >
          <ListOrdered size={15} aria-hidden />
        </button>
        <button
          type="button"
          title={withKeys(toolbarLabels.quote, "ModShift+B")}
          aria-label={withKeys(toolbarLabels.quote, "ModShift+B")}
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
          title={toolbarLabels.faq}
          aria-label={toolbarLabels.faq}
          aria-pressed={editor.isActive("faqList")}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() =>
            editor
              .chain()
              .focus()
              .insertContent({
                type: "faqList",
                content: [
                  {
                    type: "faqItem",
                    content: [{ type: "faqQuestion" }, { type: "paragraph" }],
                  },
                ],
              })
              .run()
          }
          className={toolbarButtonClass(editor.isActive("faqList"))}
        >
          <HelpCircle size={15} aria-hidden />
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

      {/* ── Bubble menus ──────────────────────────────────────────────
          Two, with mutually exclusive shouldShow: one for a text
          selection, one for a caret sitting inside a link. They never
          appear together, which is why the selection menu excludes links
          rather than stacking a second bar on top of the first. */}
      <BubbleMenu
        editor={editor}
        shouldShow={({ editor: instance, from, to }) =>
          from !== to &&
          !instance.isActive("link") &&
          // A figure has its own controls (FigureNodeView) and a code
          // block is meant to be literal — neither wants a formatting bar.
          !instance.isActive("figure") &&
          !instance.isActive("codeBlock")
        }
        className="flex items-center gap-1 rounded-xs border border-primary/15 bg-surface-raised p-1 shadow-lg"
      >
        {([2, 3, 4] as HeadingLevel[]).map((level) => (
          <button
            key={level}
            type="button"
            title={withKeys(toolbarLabels.heading(level), `ModAlt${level}`)}
            aria-label={toolbarLabels.heading(level)}
            aria-pressed={editor.isActive("heading", { level })}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => editor.chain().focus().toggleHeading({ level }).run()}
            className={toolbarButtonClass(editor.isActive("heading", { level }))}
          >
            <span className="text-xs font-medium">H{level}</span>
          </button>
        ))}

        <span aria-hidden className="mx-0.5 h-4 w-px bg-primary/15" />

        <button
          type="button"
          title={withKeys(toolbarLabels.bold, "ModB")}
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
          title={withKeys(toolbarLabels.italic, "ModI")}
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
          title={withKeys(toolbarLabels.strike, "ModShift+X")}
          aria-label={toolbarLabels.strike}
          aria-pressed={editor.isActive("strike")}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          className={toolbarButtonClass(editor.isActive("strike"))}
        >
          <Strikethrough size={15} aria-hidden />
        </button>
        <button
          type="button"
          title={withKeys(toolbarLabels.quote, "ModShift+B")}
          aria-label={toolbarLabels.quote}
          aria-pressed={editor.isActive("blockquote")}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          className={toolbarButtonClass(editor.isActive("blockquote"))}
        >
          <Quote size={15} aria-hidden />
        </button>
        <button
          type="button"
          title={withKeys(toolbarLabels.link, "ModK")}
          aria-label={toolbarLabels.link}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onRequestLink}
          className={toolbarButtonClass(false)}
        >
          <Link2 size={15} aria-hidden />
        </button>
      </BubbleMenu>

      <BubbleMenu
        editor={editor}
        shouldShow={({ editor: instance }) => instance.isActive("link")}
        className="flex max-w-[22rem] items-center gap-1 rounded-xs border border-primary/15 bg-surface-raised p-1 pl-2.5 shadow-lg"
      >
        {/* The href, so "where does this go" needs no click to answer —
            the thing that previously required deleting the link to find
            out. */}
        <span className="truncate text-xs text-ink-muted">
          {editor.getAttributes("link").href ?? ""}
        </span>

        <span aria-hidden className="mx-0.5 h-4 w-px shrink-0 bg-primary/15" />

        <button
          type="button"
          title={toolbarLabels.editLink}
          aria-label={toolbarLabels.editLink}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            const attrs = editor.getAttributes("link");
            // Select the whole link first, so the modal's result replaces
            // it in place rather than nesting a second one inside it.
            editor.chain().focus().extendMarkRange("link").run();
            onRequestEditLink({
              href: (attrs.href as string) ?? "",
              newTab: attrs.target === "_blank",
              nofollow: typeof attrs.rel === "string" && attrs.rel.includes("nofollow"),
            });
          }}
          className={toolbarButtonClass(false)}
        >
          <Pencil size={15} aria-hidden />
        </button>
        <a
          href={(editor.getAttributes("link").href as string) ?? "#"}
          target="_blank"
          rel="noopener noreferrer"
          title={toolbarLabels.openLink}
          aria-label={toolbarLabels.openLink}
          className={toolbarButtonClass(false)}
        >
          <ExternalLink size={15} aria-hidden />
        </a>
        <button
          type="button"
          title={toolbarLabels.removeLink}
          aria-label={toolbarLabels.removeLink}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => editor.chain().focus().extendMarkRange("link").unsetLink().run()}
          className={toolbarButtonClass(false)}
        >
          <Unlink size={15} aria-hidden />
        </button>
      </BubbleMenu>

      <EditorContent
        editor={editor}
        /* prose-article hides an empty figcaption so a caption-less image
           does not leave a blank line on the public page. In here that same
           rule would hide the very line an admin is trying to type a caption
           into, so it is put back — with a minimum height, since an empty
           inline container is zero pixels tall and impossible to click. */
        /* max-w-2xl, not max-w-none: that is the width of the article
           column on news/[slug] (container-luxe > mx-auto max-w-2xl), and
           a "wide" or "full" image only reads correctly against the column
           it will actually sit in. The grid cell this lives in is wider,
           so the leftover space is margin rather than a squeezed measure. */
        className="admin-textarea prose-article mx-auto min-h-[320px] max-w-2xl [&_.ProseMirror]:min-h-[300px] [&_.ProseMirror]:outline-none [&_.ProseMirror_figcaption:empty]:block [&_.ProseMirror_figcaption]:min-h-[1.25rem]"
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
