"use client";

/**
 * components/admin/MarkdownToolbar.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * A button row that inserts Markdown syntax into the body textarea at the
 * cursor — deliberately not a WYSIWYG toolbar. NewsForm.tsx's own header
 * comment already rules out contentEditable/execCommand: a rich-text editor
 * that round-trips Markdown reliably is a project of its own, and the
 * failure mode (silently mangled formatting on save) is worse than typing
 * "##" by hand. This gives the same at-a-glance affordance the mockup's
 * toolbar has without touching that decision — every button is plain
 * string surgery on textarea.selectionStart/selectionEnd, the same text
 * a person would have typed themselves.
 *
 * Takes the textarea's ref plus its controlled value/onChange rather than
 * owning any state itself, so it stays a thin layer over BodyField's
 * existing controlled textarea instead of a second source of truth for
 * the body.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { RefObject } from "react";
import { Bold, Heading2, Heading3, Italic, Link2, List, Quote } from "lucide-react";

type Selection = { before: string; selected: string; after: string };

/** Wrap the selection in a marker; with nothing selected, wrap a
 *  placeholder word instead and select it, so typing replaces it. */
function wrapInline(marker: string, placeholder: string) {
  return ({ before, selected, after }: Selection) => {
    const text = selected || placeholder;
    return {
      value: `${before}${marker}${text}${marker}${after}`,
      selectionStart: before.length + marker.length,
      selectionEnd: before.length + marker.length + text.length,
    };
  };
}

/** Prefix every line the selection touches — including the partial line
 *  before it — with `marker`. A single cursor with nothing selected still
 *  prefixes the line it sits on. */
function prefixLines(marker: string) {
  return ({ before, selected, after }: Selection) => {
    const lineStart = before.lastIndexOf("\n") + 1;
    const head = before.slice(0, lineStart);
    const block = before.slice(lineStart) + selected;
    const prefixed = block
      .split("\n")
      .map((line) => marker + line)
      .join("\n");

    return {
      value: `${head}${prefixed}${after}`,
      selectionStart: head.length,
      selectionEnd: head.length + prefixed.length,
    };
  };
}

/** Headings replace any heading markers already on the line rather than
 *  stacking a second "##" in front of the first — the whole line is
 *  reassembled from both sides of the cursor before stripping, since a
 *  cursor placed before the marker (its "after" half) would otherwise
 *  leave it untouched. */
function heading(level: 2 | 3) {
  const marker = "#".repeat(level) + " ";
  return ({ before, selected, after }: Selection) => {
    const lineStart = before.lastIndexOf("\n") + 1;
    const head = before.slice(0, lineStart);
    const beforeOnLine = before.slice(lineStart);

    const nextNewline = after.indexOf("\n");
    const afterOnLine = nextNewline === -1 ? after : after.slice(0, nextNewline);
    const restAfter = nextNewline === -1 ? "" : after.slice(nextNewline);

    const line = (beforeOnLine + selected + afterOnLine).replace(/^#{1,6}\s+/, "");

    return {
      value: `${head}${marker}${line}${restAfter}`,
      selectionStart: head.length,
      selectionEnd: head.length + marker.length + line.length,
    };
  };
}

function link({ before, selected, after }: Selection) {
  const text = selected || "text";
  const url = "https://";
  const value = `${before}[${text}](${url})${after}`;
  const urlStart = before.length + text.length + 4; // "[text](".length

  return { value, selectionStart: urlStart, selectionEnd: urlStart + url.length };
}

const COMMANDS = {
  heading2: heading(2),
  heading3: heading(3),
  bold: wrapInline("**", "bold text"),
  italic: wrapInline("_", "italic text"),
  bulletList: prefixLines("- "),
  quote: prefixLines("> "),
  link,
} as const;

export type MarkdownToolbarCommand = keyof typeof COMMANDS;

export type MarkdownToolbarLabels = Record<MarkdownToolbarCommand, string> & {
  /** aria-label for the toolbar group itself, not any one button. */
  toolbar: string;
};

type Props = {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (value: string) => void;
  labels: MarkdownToolbarLabels;
};

const BUTTONS: { command: MarkdownToolbarCommand; Icon: typeof Bold }[] = [
  { command: "heading2", Icon: Heading2 },
  { command: "heading3", Icon: Heading3 },
  { command: "bold", Icon: Bold },
  { command: "italic", Icon: Italic },
  { command: "bulletList", Icon: List },
  { command: "quote", Icon: Quote },
  { command: "link", Icon: Link2 },
];

export default function MarkdownToolbar({ textareaRef, value, onChange, labels }: Props) {
  const run = (command: MarkdownToolbarCommand) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const { selectionStart, selectionEnd } = textarea;
    const result = COMMANDS[command]({
      before: value.slice(0, selectionStart),
      selected: value.slice(selectionStart, selectionEnd),
      after: value.slice(selectionEnd),
    });

    onChange(result.value);

    // The textarea's own selection needs setting after React commits the
    // new value — doing it in the same tick still targets the old text.
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(result.selectionStart, result.selectionEnd);
    });
  };

  return (
    <div role="toolbar" aria-label={labels.toolbar} className="flex flex-wrap gap-1">
      {BUTTONS.map(({ command, Icon }) => (
        <button
          key={command}
          type="button"
          title={labels[command]}
          aria-label={labels[command]}
          onClick={() => run(command)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-xs border border-primary/10 text-ink-muted transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
        >
          <Icon size={15} aria-hidden />
        </button>
      ))}
    </div>
  );
}
