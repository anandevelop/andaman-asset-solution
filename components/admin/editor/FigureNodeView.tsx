"use client";

/**
 * components/admin/editor/FigureNodeView.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The in-place editing surface for an inserted image.
 *
 * Before this existed, `figure` was an `atom: true` node with no NodeView:
 * clicking an image did nothing at all, so changing its alignment, fixing a
 * typo in its caption or correcting its alt text meant deleting the image
 * and walking back through InsertImageModal from the top — every time. The
 * image was, in practice, write-once.
 *
 * Every control here goes through `updateAttributes()` rather than a
 * delete-and-reinsert. That is not a style preference: replacing the node
 * pushes two steps onto the history stack and moves the selection, so a
 * ⌘Z after nudging an image right would put the caret somewhere unrelated
 * and leave the image gone rather than merely un-nudged.
 *
 * The bar appears on `selected`, not on hover. A hover trigger flickers the
 * controls on and off as the cursor crosses images while someone is just
 * scrolling and reading, which reads as the page glitching.
 *
 * Labels arrive as extension options rather than through useTranslations:
 * this renders inside TipTap's own React root, which is mounted by
 * ProseMirror rather than by the tree NewsForm renders, so it does not
 * inherit the next-intl provider. Same reason RichTextEditor already takes
 * `toolbarLabels` as a prop.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useState } from "react";
import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { AlignCenter, AlignLeft, AlignRight, Square, Trash2, Type } from "lucide-react";
import {
  fetchMediaLibrary,
  updateMediaMeta,
} from "@/app/[locale]/admin/(content)/media/actions";

export type FigureLabels = {
  alignLeft: string;
  alignCenter: string;
  alignRight: string;
  alignNone: string;
  editAlt: string;
  altLabel: string;
  altMissing: string;
  altDone: string;
  remove: string;
};

/** Set by RichTextEditor via `Figure.configure({...})` — see its own note
 *  on why these cannot be read from context here. */
export type FigureOptions = {
  labels: FigureLabels | null;
  locale: string;
};

type Align = "left" | "center" | "right" | null;

export default function FigureNodeView({
  node,
  updateAttributes,
  deleteNode,
  selected,
  extension,
  editor,
  getPos,
}: NodeViewProps) {
  const { labels, locale } = extension.options as FigureOptions;

  const alt = (node.attrs.alt as string | null) ?? "";
  const align = (node.attrs.align as Align) ?? null;
  const mediaId = (node.attrs.mediaId as string | null) ?? null;

  const [altOpen, setAltOpen] = useState(false);
  const [altDraft, setAltDraft] = useState(alt);

  const missingAlt = alt.trim().length === 0;

  /**
   * Fires once, when the popover closes — not on each keystroke. The write
   * below is a whole-row update, so per-keystroke saving would be a burst
   * of writes that each have to re-read and re-merge the same row.
   */
  async function commitAlt() {
    setAltOpen(false);

    const next = altDraft.trim();
    if (next === alt.trim()) return;

    // The node is the source of truth for this article, and it updates
    // whether or not the library write below succeeds.
    updateAttributes({ alt: next });

    if (!mediaId) return;

    /*
      Write the correction back to the library, so the next article to use
      this photo starts from the fixed alt rather than the old one.

      Read-then-merge, because updateMediaMeta replaces `altText` and `tags`
      wholesale: posting `{ id, altText: { [locale]: next } }` alone would
      wipe the other three locales' alt text and every tag on the row.
      InsertImageModal has the same merge for the same reason — it just
      already holds the row it picked, where this only has an id.
    */
    try {
      const library = await fetchMediaLibrary();
      const row = library.items.find((item) => item.id === mediaId);
      if (!row) return;

      await updateMediaMeta(locale, {
        id: mediaId,
        altText: { ...row.altText, [locale]: next },
        tags: row.tags,
      });
    } catch {
      // Best effort. The article itself already carries the new alt, and
      // the library copy is a convenience for the next author — not
      // something worth failing an edit over.
    }
  }

  const alignOptions: { value: Align; label: string; icon: typeof AlignLeft }[] = labels
    ? [
        { value: "left", label: labels.alignLeft, icon: AlignLeft },
        { value: "center", label: labels.alignCenter, icon: AlignCenter },
        { value: "right", label: labels.alignRight, icon: AlignRight },
        { value: null, label: labels.alignNone, icon: Square },
      ]
    : [];

  return (
    <NodeViewWrapper
      as="figure"
      data-align={align ?? undefined}
      className={selected ? "rounded-xs ring-2 ring-accent" : undefined}
    >
      {/*
        contentEditable={false} on everything that is not the caption.
        ProseMirror maps DOM positions back to document positions, and an
        editable image wrapper gives the caret somewhere to land that has no
        corresponding position in the node.
      */}
      <div
        className="relative"
        contentEditable={false}
        /*
          Clicking the image has to select the node explicitly.

          While this was `atom: true` ProseMirror made a NodeSelection out
          of a click for free. A node with content gets no such treatment:
          a click inside its contentEditable={false} half resolves to no
          selection at all, `selected` stays false, and the control bar
          never appears — which is the exact "clicking an image does
          nothing" this component exists to fix, reintroduced one layer up.
        */
        onClick={() => {
          const pos = typeof getPos === "function" ? getPos() : undefined;
          if (typeof pos === "number") editor.commands.setNodeSelection(pos);
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- the editor
            renders whatever URL the article carries, including hosts
            next/image is not configured for; this is admin-only preview
            markup and never ships to a visitor. */}
        <img
          src={(node.attrs.src as string | null) ?? ""}
          alt={alt}
          loading="lazy"
          className={`cursor-pointer ${missingAlt ? "outline-2 outline-offset-2 outline-amber-500" : ""}`}
        />

        {/* An image with no alt fails lib/article-seo.ts's own check (weight
            3, a hard fail). InsertImageModal makes alt mandatory on the way
            in; now that alt is editable afterwards, emptying it needs to be
            just as visible as never setting it. */}
        {missingAlt && labels && (
          <p className="absolute left-2 top-2 rounded-xs bg-amber-500 px-2 py-1 text-[11px] font-medium text-white shadow-card">
            {labels.altMissing}
          </p>
        )}

        {selected && labels && (
          <div className="absolute bottom-2 left-2 flex flex-wrap items-center gap-1 rounded-xs border border-primary/15 bg-surface-raised/95 p-1 shadow-lg backdrop-blur-sm">
            {alignOptions.map(({ value, label, icon: Icon }) => (
              <button
                key={label}
                type="button"
                title={label}
                aria-label={label}
                aria-pressed={align === value}
                // The bar sits inside a contentEditable={false} island, but
                // a mousedown still moves the browser selection out of the
                // node before React sees the click.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => updateAttributes({ align: value })}
                className={`rounded-xs p-1.5 transition-colors ${
                  align === value
                    ? "bg-primary text-white"
                    : "text-ink-muted hover:bg-primary/5 hover:text-primary"
                }`}
              >
                <Icon size={14} aria-hidden />
              </button>
            ))}

            <span aria-hidden className="mx-0.5 h-4 w-px bg-primary/15" />

            <button
              type="button"
              title={labels.editAlt}
              aria-label={labels.editAlt}
              aria-expanded={altOpen}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setAltDraft(alt);
                setAltOpen((open) => !open);
              }}
              className={`rounded-xs p-1.5 transition-colors ${
                altOpen ? "bg-primary text-white" : "text-ink-muted hover:bg-primary/5 hover:text-primary"
              }`}
            >
              <Type size={14} aria-hidden />
            </button>

            <button
              type="button"
              title={labels.remove}
              aria-label={labels.remove}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => deleteNode()}
              className="rounded-xs p-1.5 text-red-700 transition-colors hover:bg-red-50"
            >
              <Trash2 size={14} aria-hidden />
            </button>
          </div>
        )}

        {selected && altOpen && labels && (
          <div className="absolute bottom-14 left-2 w-72 max-w-[calc(100%-1rem)] rounded-xs border border-primary/15 bg-surface-raised p-3 shadow-lg">
            <label htmlFor={`figure-alt-${node.attrs.mediaId ?? "local"}`} className="admin-label">
              {labels.altLabel}
            </label>
            <input
              id={`figure-alt-${node.attrs.mediaId ?? "local"}`}
              value={altDraft}
              onChange={(event) => setAltDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void commitAlt();
                }
              }}
              className="admin-input"
            />
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => void commitAlt()}
              className="admin-btn mt-2 w-full"
            >
              {labels.altDone}
            </button>
          </div>
        )}
      </div>

      {/* The caption is real editable content now, not an attribute — so it
          is typed here, in place, rather than round-tripped through a modal.
          Empty captions are hidden on the public page but must stay visible
          here; see the ProseMirror override on EditorContent. */}
      {/* The generic is stated rather than inferred: NodeViewContent's `as`
          is typed `NoInfer<T>` against a `"div"` default, so the tag alone
          tells it nothing. */}
      <NodeViewContent<"figcaption"> as="figcaption" />
    </NodeViewWrapper>
  );
}
