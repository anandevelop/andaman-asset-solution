/**
 * lib/site-copy-core.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The rules for overriding the public site's message copy from /admin.
 *
 * Every heading, eyebrow, paragraph and button label the public site
 * prints through next-intl lives in messages/<locale>.json, which used to
 * mean a deploy for a one-word change. Some sections grew their own DB
 * fields (the /projects banner, the corporate cards), but one screen per
 * section never caught up with the hundreds of strings that remained — the
 * "Corporate" heading on the home page was editable as four cards and not
 * as the sentence above them.
 *
 * So instead of another per-section form, any key under a public namespace
 * can be overridden per locale (SiteCopy rows), and i18n.ts lays the
 * overrides over the JSON when it loads messages. The JSON stays the
 * default and the only place a key can be *created*: an override for a key
 * the JSON does not have is ignored, so a stale row cannot resurrect copy
 * the code no longer reads.
 *
 * WHY THE VALIDATION IS STRICT
 *
 * next-intl formats these strings as ICU messages at render time. A stray
 * `{`, a placeholder the component never passes (`{count}` typed into a
 * heading whose component passes nothing) or a rich-text tag it has no
 * renderer for does not fall back — it errors on the page. So an override
 * must parse, and may only use the arguments and tags its default uses.
 * Dropping one is fine ("Four things we do in-house" without the plural is
 * a valid choice); inventing one is not.
 *
 * Pure and dependency-light on purpose: tests/site-copy.test.ts runs it
 * without a database, and i18n.ts imports it on every request.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { parse, TYPE, type MessageFormatElement } from "@formatjs/icu-messageformat-parser";
import { icuSkeleton } from "@/lib/icu-skeleton";

/**
 * The namespaces the public site renders, in the order the editor lists
 * them. `admin` and `auth` are the back office's own chrome — editing them
 * from inside the back office is a way to lock yourself out of reading it.
 */
export const EDITABLE_NAMESPACES = [
  "nav",
  "home",
  "about",
  "projects",
  "progress",
  "news",
  "events",
  "eBrochure",
  "achievements",
  "awards",
  "salesTeam",
  "contact",
  "leadForm",
  "map",
  "footer",
  "common",
  "chatButtons",
  "cookieConsent",
  "legalPage",
] as const;

/**
 * Long-form pages whose text is code-owned TypeScript (content/*.ts) rather
 * than messages — structured documents with numbered sections, paragraph
 * arrays and bullet lists that would be unreadable as a 4×600-key JSON
 * namespace. They take overrides through the same table and editor, keyed
 * the same way ("privacyPolicy.sections.3.bullets.1"), but are applied by
 * the page that reads them (lib/site-copy.ts withCopyOverrides), not by
 * i18n-request.ts, and are never formatted as ICU — so no validation
 * beyond "not blank". The trees exposed are built in
 * lib/site-copy-content.ts, which leaves out what must not be edited here
 * (a policy's version and effective date, its phone number).
 */
export const CONTENT_NAMESPACES = ["achievementsPage", "privacyPolicy", "terms"] as const;

export type ContentNamespace = (typeof CONTENT_NAMESPACES)[number];

export const ALL_COPY_NAMESPACES = [...EDITABLE_NAMESPACES, ...CONTENT_NAMESPACES] as const;

export type EditableNamespace = (typeof ALL_COPY_NAMESPACES)[number];

export function isEditableNamespace(value: string): value is EditableNamespace {
  return (ALL_COPY_NAMESPACES as readonly string[]).includes(value);
}

/** True for content/*.ts trees: plain text, never parsed as ICU. */
export function isContentNamespace(value: string): value is ContentNamespace {
  return (CONTENT_NAMESPACES as readonly string[]).includes(value);
}

/** A full dotted key is editable when its first segment is. */
export function isEditableKey(key: string): boolean {
  const ns = key.split(".", 1)[0];
  return isEditableNamespace(ns);
}

type MessageTree = { [key: string]: string | MessageTree };

/** `{ a: { b: "x" } }` → `{ "a.b": "x" }`, strings only. Arrays flatten by
 *  index (`intro.0`), which is how a paragraph list gets one field each. */
export function flattenMessages(tree: unknown, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  if (tree === null || typeof tree !== "object") return out;
  for (const [key, value] of Object.entries(tree as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out[path] = value;
    else Object.assign(out, flattenMessages(value, path));
  }
  return out;
}

/**
 * Lays the overrides over the messages, returning a new tree.
 *
 * Only a key that already exists as a string under an editable namespace
 * is replaced; anything else is skipped. Untouched branches are shared
 * with the input rather than copied — the site file is ~1 MB and this runs
 * on every request.
 */
export function applyCopyOverrides<T extends Record<string, unknown>>(
  messages: T,
  overrides: Record<string, string>,
): T {
  let result = messages;

  for (const [key, value] of Object.entries(overrides)) {
    if (!isEditableKey(key) || value.trim().length === 0) continue;

    const path = key.split(".");
    // Walk the original to confirm the leaf is an existing string.
    let probe: unknown = messages;
    for (const segment of path) {
      probe = probe && typeof probe === "object" ? (probe as MessageTree)[segment] : undefined;
    }
    if (typeof probe !== "string") continue;

    result = setPath(result, path, value) as T;
  }

  return result;
}

/** Copy-on-write set: clones only the objects along the path. An array
 *  stays an array — spreading one into `{}` would hand the legal pages an
 *  object where they `.map()` over paragraphs. */
function setPath(node: unknown, path: string[], value: string): unknown {
  if (path.length === 0) return value;
  const [head, ...rest] = path;
  if (Array.isArray(node)) {
    const copy = [...node];
    copy[Number(head)] = setPath(node[Number(head)], rest, value);
    return copy;
  }
  const current = node as Record<string, unknown>;
  return { ...current, [head]: setPath(current[head], rest, value) };
}

/* ── Validation ─────────────────────────────────────────────────────── */

export type CopyProblem =
  | { code: "SYNTAX" }
  | { code: "UNKNOWN_ARGUMENT"; name: string }
  | { code: "UNKNOWN_TAG"; name: string };

/** Every argument name and rich-text tag an ICU message uses. */
function collectNames(elements: MessageFormatElement[], args: Set<string>, tags: Set<string>) {
  for (const element of elements) {
    switch (element.type) {
      case TYPE.argument:
      case TYPE.number:
      case TYPE.date:
      case TYPE.time:
        args.add(element.value);
        break;
      case TYPE.select:
      case TYPE.plural:
        args.add(element.value);
        for (const option of Object.values(element.options)) {
          collectNames(option.value, args, tags);
        }
        break;
      case TYPE.tag:
        tags.add(element.value);
        collectNames(element.children, args, tags);
        break;
      default:
        break;
    }
  }
}

function namesOf(message: string) {
  const args = new Set<string>();
  const tags = new Set<string>();
  collectNames(parse(message), args, tags);
  return { args, tags };
}

/**
 * Null when `value` can safely replace `defaultValue`, otherwise the first
 * problem found. The default is trusted to parse — tests/i18n.test.ts
 * renders every one of them.
 */
export function validateCopy(defaultValue: string, value: string): CopyProblem | null {
  let mine: ReturnType<typeof namesOf>;
  try {
    mine = namesOf(value);
  } catch {
    return { code: "SYNTAX" };
  }

  let allowed: ReturnType<typeof namesOf>;
  try {
    allowed = namesOf(defaultValue);
  } catch {
    // A default that does not parse is never formatted as ICU (next-intl
    // would have thrown already), so hold the override to the same: plain
    // text only.
    allowed = { args: new Set(), tags: new Set() };
  }

  for (const name of mine.args) {
    if (!allowed.args.has(name)) return { code: "UNKNOWN_ARGUMENT", name };
  }
  for (const name of mine.tags) {
    if (!allowed.tags.has(name)) return { code: "UNKNOWN_TAG", name };
  }
  return null;
}

/**
 * The placeholders an editor may use for a key — shown beside the field.
 *
 * Not the argument a counted message branches on: the editor shows that
 * one as a box per case (components/copy/CopyValueField.tsx), and the
 * "{count} is filled in by the site, move it, don't translate it" note
 * beside those boxes only confused — there is no {count} to move.
 */
export function placeholdersOf(defaultValue: string): { args: string[]; tags: string[] } {
  try {
    const { args, tags } = namesOf(defaultValue);
    const branching = icuSkeleton(defaultValue)?.argument;
    return { args: [...args].filter((name) => name !== branching), tags: [...tags] };
  } catch {
    return { args: [], tags: [] };
  }
}

/* ── Finding a key from the words on the page ──────────────────────── */

/** Whitespace-insensitive form of a string as it reads on screen. */
export function normalizeCopyText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function patternOf(elements: MessageFormatElement[]): string {
  let out = "";
  for (const element of elements) {
    switch (element.type) {
      case TYPE.literal:
        out += escapeRegExp(element.value);
        break;
      case TYPE.tag:
        // Rich-text tags render as elements; their text is what is seen.
        out += patternOf(element.children);
        break;
      case TYPE.pound:
        out += "[\\d.,\\s]+";
        break;
      case TYPE.plural:
      case TYPE.select:
        // One of its cases is on screen, whichever the count chose. Before
        // this a counted heading ("Four things we do in-house") matched
        // nothing, and the picker said it could not be edited at all.
        out += `(?:${Object.values(element.options)
          .map((option) => patternOf(option.value))
          .join("|")})`;
        break;
      default:
        // An argument, number or date: something the
        // component fills in. Any run of text, kept short.
        out += "(?:.{1,40}?)";
        break;
    }
  }
  return out;
}

function literalText(elements: MessageFormatElement[]): string {
  let out = "";
  for (const element of elements) {
    if (element.type === TYPE.literal) out += element.value;
    else if (element.type === TYPE.tag) out += literalText(element.children);
    else if (element.type === TYPE.plural || element.type === TYPE.select) {
      // The shortest case: the guard below must hold whichever is shown.
      const cases = Object.values(element.options).map((option) => literalText(option.value));
      out += cases.reduce((shortest, text) => (text.trim().length < shortest.trim().length ? text : shortest));
    }
  }
  return out;
}

/**
 * Whether `seen` (text read off the rendered page) is what `message`
 * renders to — exactly for plain text, with any filled-in value standing
 * for an argument (`{km} km from you` matches "12.4 km from you").
 *
 * `icu: false` for content/*.ts text, which is never formatted.
 */
export function copyMatches(message: string, seen: string, icu = true): boolean {
  // Lower-cased: innerText reports CSS text-transform, and eyebrows are
  // set in capitals on screen while the JSON has them in sentence case.
  const target = normalizeCopyText(seen).toLocaleLowerCase();
  const plain = normalizeCopyText(message).toLocaleLowerCase();
  if (plain === target) return true;
  if (!icu || !/[{<]/.test(message)) return false;

  let elements: MessageFormatElement[];
  try {
    elements = parse(message);
  } catch {
    return false;
  }
  // A message that is nothing but placeholders ("{count}") would match
  // anything on the page.
  if (literalText(elements).trim().length < 2) return false;
  const pattern = normalizeCopyText(patternOf(elements)).replace(/ /g, "\\s+");
  try {
    return new RegExp(`^${pattern}$`, "si").test(target);
  } catch {
    return false;
  }
}
