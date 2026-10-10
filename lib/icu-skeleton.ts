/**
 * lib/icu-skeleton.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Splits a counted message — `{count, plural, =4 {Four things} other {#
 * things}}` — into the words a person edits and the syntax they must not
 * touch, and puts it back together.
 *
 * WHY
 *
 * The copy editors (the /admin/pages/copy grid and the "edit text" picker
 * on the site) showed such messages as their raw ICU source. Ten of the
 * site's strings are written this way, the home page's corporate heading
 * among them, and an editor asked to change "Four things we do in-house"
 * was handed a line of braces and keywords where a stray `}` takes the
 * heading down to a syntax error. components/copy/CopyValueField.tsx draws
 * one box per case instead — "when the count is 4", "otherwise" — from
 * this skeleton.
 *
 * SPLICED, NOT RE-SERIALISED
 *
 * The skeleton keeps the original source between the editable parts
 * verbatim (positions from the parser's captureLocation). Rebuilding the
 * message from the AST would normalise spacing and quoting, so merely
 * opening a field and typing a letter and deleting it again would leave
 * the cell "changed" against what is saved.
 *
 * WHAT IS SUPPORTED
 *
 * Exactly one plural / selectordinal / select at the top level, with
 * optional text before and after it (the Chinese about.cta.subtitle ends
 * in a sentence after its plural), no offset, and no plural or select
 * nested inside a case. Anything else returns null and the field stays a
 * plain text box: still editable, just not decomposed.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { parse, TYPE, type MessageFormatElement } from "@formatjs/icu-messageformat-parser";

export type SkeletonSlot =
  | { kind: "before" | "after"; text: string }
  | { kind: "case"; selector: string; text: string };

export type IcuSkeleton = {
  /** The argument the cases depend on, e.g. "count". */
  argument: string;
  type: "plural" | "selectordinal" | "select";
  /** Interleaved: a string is fixed source, a number indexes `slots`. */
  parts: (string | number)[];
  slots: SkeletonSlot[];
};

function hasBranching(elements: MessageFormatElement[]): boolean {
  return elements.some(
    (element) =>
      element.type === TYPE.plural ||
      element.type === TYPE.select ||
      (element.type === TYPE.tag && hasBranching(element.children)),
  );
}

export function icuSkeleton(message: string): IcuSkeleton | null {
  let ast: MessageFormatElement[];
  try {
    ast = parse(message, { captureLocation: true });
  } catch {
    return null;
  }

  const branching = ast.filter((element) => element.type === TYPE.plural || element.type === TYPE.select);
  if (branching.length !== 1) return null;
  const element = branching[0];
  if (element.type !== TYPE.plural && element.type !== TYPE.select) return null;
  if (element.type === TYPE.plural && element.offset) return null;
  if (!element.location) return null;

  const options = Object.entries(element.options);
  if (options.some(([, option]) => !option.location || hasBranching(option.value))) return null;

  const start = element.location.start.offset;
  const end = element.location.end.offset;
  const parts: (string | number)[] = [];
  const slots: SkeletonSlot[] = [];

  const before = message.slice(0, start);
  if (before.trim()) {
    parts.push(slots.length);
    slots.push({ kind: "before", text: before });
  } else if (before) {
    parts.push(before);
  }

  let cursor = start;
  const ordered = options.sort((a, b) => a[1].location!.start.offset - b[1].location!.start.offset);
  for (const [selector, option] of ordered) {
    // The location spans the braces; the editable text is inside them.
    const open = option.location!.start.offset + 1;
    const close = option.location!.end.offset - 1;
    parts.push(message.slice(cursor, open));
    parts.push(slots.length);
    slots.push({ kind: "case", selector, text: message.slice(open, close) });
    cursor = close;
  }
  parts.push(message.slice(cursor, end));

  const after = message.slice(end);
  if (after.trim()) {
    parts.push(slots.length);
    slots.push({ kind: "after", text: after });
  } else if (after) {
    parts.push(after);
  }

  const type =
    element.type === TYPE.select ? "select" : element.pluralType === "ordinal" ? "selectordinal" : "plural";
  return { argument: element.value, type, parts, slots };
}

/** The message with each slot's text put back in place. */
export function assembleSkeleton(skeleton: IcuSkeleton, texts: readonly string[]): string {
  return skeleton.parts.map((part) => (typeof part === "number" ? (texts[part] ?? "") : part)).join("");
}

function normalise(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

/**
 * Which case of `message` reads as one of `seen` — the text clicked on the
 * page — or null. Lets the site picker open on the case the visitor is
 * actually looking at ("Four things we do in-house" is the `=4` case)
 * with the others tucked away, instead of every case at once.
 *
 * `#` in a case stands for the number, as it does when rendered. Tags and
 * placeholders inside a case are not expanded: such a case simply never
 * matches, and the caller falls back to the first case.
 */
export function caseShowing(message: string, seen: readonly string[]): string | null {
  const skeleton = icuSkeleton(message);
  if (!skeleton) return null;
  const targets = seen.map(normalise);
  for (const slot of skeleton.slots) {
    if (slot.kind !== "case" || /[{<]/.test(slot.text)) continue;
    const pattern = normalise(slot.text)
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/#/g, "[\\d.,\\s]+")
      .replace(/ /g, "\\s+");
    const regex = new RegExp(`^${pattern}$`, "i");
    if (targets.some((target) => regex.test(target))) return slot.selector;
  }
  return null;
}
