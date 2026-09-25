"use client";

/**
 * components/admin/editor/SlashMenu.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * §6.2's slash command: type "/" at the start of an empty paragraph and
 * pick a block by name, in Thai or in English.
 *
 * NO NEW DEPENDENCY, AND NOT THE ONE THE SPEC NAMED
 *
 * §6.2 suggests "@tiptap/core's Suggestion utility (already there)". It is
 * not there — in 3.31.3 Suggestion ships as its own package, @tiptap/
 * suggestion, which this repo does not have; @tiptap/core exports only a
 * `SuggestionChar` type that belongs to it. The section's other half of the
 * instruction is the one that survives contact: use FloatingMenu from
 * @tiptap/react/menus, which is already installed, and add nothing.
 *
 * So the matching is done here. It is not much: the caret is in a
 * paragraph, the paragraph's text up to the caret is "/" plus a run of
 * non-space characters, and that run is the query. A space closes the menu,
 * which is what makes a sentence that merely begins with a slash — "/admin
 * is where…" — stop being a command as soon as it is obviously prose.
 *
 * SEARCH WORDS ARE TRANSLATIONS, NOT LITERALS
 *
 * §6.2 is explicit that the Thai search words must come from the message
 * files rather than being written into the code, and that is also the only
 * way "หัวข้อ" can find the heading. Each item carries a `keywords` string
 * the caller resolves through next-intl, and matching runs over the label
 * and the keywords together. The labels themselves are the toolbar's own,
 * so a block is called the same thing in both places without a second set
 * of keys to keep in step.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { BubbleMenu } from "@tiptap/react/menus";
import type { Editor } from "@tiptap/react";
import type { LucideIcon } from "lucide-react";

export type SlashItem = {
  id: string;
  /** Shown in the menu — the same string the toolbar button uses. */
  label: string;
  /** Space-separated extra search words, already translated. */
  keywords: string;
  icon: LucideIcon;
  /** Runs with the "/query" text already removed. */
  run: (editor: Editor) => void;
};

/** Where the "/" is, and what has been typed after it. */
export type SlashState = { from: number; to: number; query: string };

/**
 * The slash state for a given editor selection, or null.
 *
 * Deliberately strict about where a command may start: an empty paragraph,
 * or one whose entire text so far is the query. Typing "/" in the middle of
 * a sentence is a slash, not a command.
 */
export function readSlashState(editor: Editor): SlashState | null {
  const { selection } = editor.state;
  if (!selection.empty) return null;

  const { $from } = selection;
  if ($from.parent.type.name !== "paragraph") return null;

  const start = $from.start();
  const text = editor.state.doc.textBetween(start, $from.pos, "\n", "\n");
  const match = /^\/(\S*)$/.exec(text);
  if (!match) return null;

  return { from: start, to: $from.pos, query: match[1] };
}

/** Case-insensitive match over the label and the translated keywords. */
export function filterSlashItems(items: SlashItem[], query: string): SlashItem[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return items;
  return items.filter((item) =>
    `${item.label} ${item.keywords}`.toLowerCase().includes(needle),
  );
}

/** The bubble-menu plugin turns a string key into a PluginKey; the same
 *  string is what a transaction meta has to be addressed to. */
const SLASH_PLUGIN_KEY = "slashMenu";

type Props = {
  editor: Editor;
  items: SlashItem[];
  emptyLabel: string;
};

export default function SlashMenu({ editor, items, emptyLabel }: Props) {
  const [state, setState] = useState<SlashState | null>(null);
  const [active, setActive] = useState(0);

  /*
    Escape has to be remembered, because the open state is *derived* from
    the caret rather than stored: setState(null) alone lasted until the next
    transaction, which recomputed "there is a slash here" and reopened the
    menu on the author's next keystroke.

    So a dismissal records which trigger was dismissed — the position the
    "/" sits at. It stays dismissed while the caret is still on that same
    trigger, however much more is typed, and clears the moment the author
    leaves it. Typing "/" again is a new trigger at a new position.
  */
  const dismissed = useRef<number | null>(null);

  // Not stored anywhere: the caret already knows. One source of truth means
  // no second copy to fall out of step with the document.
  const compute = useRef(() => {
    const next = readSlashState(editor);
    if (!next) {
      dismissed.current = null;
      return null;
    }
    return dismissed.current === next.from ? null : next;
  });

  useEffect(() => {
    const sync = () => setState(compute.current());
    sync();
    editor.on("transaction", sync);
    return () => {
      editor.off("transaction", sync);
    };
  }, [editor]);

  const matches = useMemo(
    () => (state ? filterSlashItems(items, state.query) : []),
    [items, state],
  );

  useEffect(() => setActive(0), [state?.query]);

  /*
    The keyboard half runs from a DOM listener on the editable element in
    the capture phase, not from an extension's addKeyboardShortcuts.

    ProseMirror resolves a keymap when the editor is created, and this
    menu's open/closed state and its current match list live in React state
    that changes on every keystroke. A keymap would close over the first
    render's values. The listener reads a ref instead, so Enter always acts
    on the item actually highlighted.
  */
  const live = useRef<{ state: SlashState | null; matches: SlashItem[]; active: number }>({
    state: null,
    matches: [],
    active: 0,
  });
  live.current = { state, matches, active };

  useEffect(() => {
    const dom = editor.view.dom;

    const onKeyDown = (event: KeyboardEvent) => {
      const { state: slash, matches: found, active: index } = live.current;
      if (!slash) return;

      if (event.key === "Escape") {
        event.preventDefault();
        dismissed.current = slash.from;
        setState(null);
        /*
          Escape changes neither the document nor the selection, and the
          bubble-menu plugin's update handler returns early when neither
          changed — so React state said closed while the popup stayed on
          screen. An empty transaction does not help for the same reason.

          The plugin reads a "hide" meta on its own key for exactly this,
          so that is what gets sent. addToHistory: false keeps it out of
          undo, which has nothing to walk back here.
        */
        editor.view.dispatch(
          editor.state.tr.setMeta(SLASH_PLUGIN_KEY, "hide").setMeta("addToHistory", false),
        );
        return;
      }
      if (found.length === 0) return;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActive((current) => (current + 1) % found.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActive((current) => (current - 1 + found.length) % found.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        runItem(found[index] ?? found[0], slash);
      }
    };

    dom.addEventListener("keydown", onKeyDown, true);
    return () => dom.removeEventListener("keydown", onKeyDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  function runItem(item: SlashItem, slash: SlashState) {
    // The "/query" goes first, so every item's own command sees a clean
    // empty paragraph and none of them has to know about the trigger.
    editor.chain().focus().deleteRange({ from: slash.from, to: slash.to }).run();
    item.run(editor);
    setState(null);
  }

  return (
    <BubbleMenu
      editor={editor}
      pluginKey={SLASH_PLUGIN_KEY}
      /* Reads the same computation the menu's contents come from, so a
         dismissed trigger does not leave an empty popup behind. */
      shouldShow={() => compute.current() !== null}
      options={{ placement: "bottom-start", offset: 8 }}
    >
      <div
        role="listbox"
        aria-label={emptyLabel}
        className="max-h-72 w-64 overflow-y-auto rounded-xs border border-primary/15 bg-surface-raised p-1 shadow-card"
      >
        {matches.length === 0 ? (
          <p className="px-3 py-2 text-xs text-ink-muted">{emptyLabel}</p>
        ) : (
          matches.map((item, index) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={index === active}
                // onMouseDown, not onClick: a click moves focus out of the
                // editable region first, and the selection the command
                // needs goes with it.
                onMouseDown={(event) => {
                  event.preventDefault();
                  if (state) runItem(item, state);
                }}
                onMouseEnter={() => setActive(index)}
                className={`flex w-full items-center gap-2.5 rounded-xs px-3 py-2 text-left text-sm transition-colors ${
                  index === active ? "bg-primary/5 text-primary" : "text-ink hover:bg-primary/5"
                }`}
              >
                <Icon size={15} aria-hidden />
                <span>{item.label}</span>
              </button>
            );
          })
        )}
      </div>
    </BubbleMenu>
  );
}
