/**
 * lib/site-copy-meta.ts
 * ─────────────────────────────────────────────────────────────────────────
 * What /admin/pages/copy says *about* a message key, so an editor reads
 * "Button · Map" instead of "map.openRoute": which page a namespace lives
 * on, where to open it on the site, and what kind of text a key is.
 *
 * None of this is stored. The kind is guessed from the key's last segment
 * (the naming in messages/*.json is consistent enough: …title, …eyebrow,
 * …cta) and, failing that, from the length of the text. A wrong guess
 * costs a mislabelled chip, never a wrong save — the key is still shown.
 *
 * Pure, so the client grid and the tests can import it.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { EditableNamespace } from "@/lib/site-copy-core";

/**
 * The sidebar of the editor: namespaces grouped by the page a visitor
 * meets them on, "on every page" first. tests/site-copy.test.ts holds this
 * to exactly ALL_COPY_NAMESPACES, so a new namespace cannot go missing.
 */
export const COPY_PAGE_GROUPS = [
  { id: "everywhere", namespaces: ["nav", "footer", "common", "chatButtons", "cookieConsent"] },
  { id: "home", namespaces: ["home"] },
  { id: "about", namespaces: ["about", "achievements", "awards", "achievementsPage", "salesTeam"] },
  { id: "projects", namespaces: ["projects", "progress"] },
  { id: "newsEvents", namespaces: ["news", "events", "eBrochure"] },
  { id: "contact", namespaces: ["contact", "leadForm", "map"] },
  { id: "legal", namespaces: ["legalPage", "privacyPolicy", "terms"] },
] as const satisfies readonly { id: string; namespaces: readonly EditableNamespace[] }[];

export type CopyPageGroup = (typeof COPY_PAGE_GROUPS)[number]["id"];

/** A public path (no locale) where the namespace can be seen. */
export const COPY_NAMESPACE_PATH: Readonly<Record<EditableNamespace, string>> = {
  nav: "/",
  footer: "/",
  common: "/",
  chatButtons: "/",
  cookieConsent: "/",
  home: "/",
  about: "/about",
  achievements: "/achievements",
  awards: "/achievements",
  achievementsPage: "/achievements",
  salesTeam: "/contact",
  projects: "/projects",
  progress: "/progress",
  news: "/news",
  events: "/events",
  eBrochure: "/e-brochure",
  contact: "/contact",
  leadForm: "/contact",
  map: "/contact",
  legalPage: "/privacy-policy",
  privacyPolicy: "/privacy-policy",
  terms: "/terms",
};

export const COPY_KINDS = [
  "heading",
  "eyebrow",
  "button",
  "placeholder",
  "message",
  "label",
  "paragraph",
  "text",
] as const;

export type CopyKind = (typeof COPY_KINDS)[number];

const KIND_RULES: [RegExp, CopyKind][] = [
  [/placeholder/i, "placeholder"],
  [/eyebrow|kicker/i, "eyebrow"],
  [/(title|heading|headline)$/i, "heading"],
  [/(error|invalid|failed|declined|unavailable|required|success|sent|warning|toast|copied)$/i, "message"],
  [/(cta|button|btn|submit|action|link|more|open\w*|back|view\w*|see\w*|copy|close|next|prev\w*|send|download|call|share)$/i, "button"],
  [/(label|name|caption)$/i, "label"],
  [/(intro|body|desc|description|subtitle|text|paragraph|note\w*|lead|summary|bullets?|lede|content)$/i, "paragraph"],
];

/** A best guess at what a key is, for the chip beside it. */
export function copyKind(key: string, value: string): CopyKind {
  const segments = key.split(".");
  // Arrays flatten by index (privacyPolicy.sections.2.bullets.1): look at
  // the nearest named segment.
  const last = [...segments].reverse().find((segment) => !/^\d+$/.test(segment)) ?? "";
  for (const [pattern, kind] of KIND_RULES) {
    if (pattern.test(last)) return kind;
  }
  return value.length > 90 ? "paragraph" : "text";
}

/**
 * The sub-area a key belongs to inside its namespace — `home.corporate.title`
 * → "corporate" — or "" for a key that sits directly under the namespace.
 */
export function copySubgroup(key: string): string {
  const segments = key.split(".");
  return segments.length > 2 ? segments[1] : "";
}

/** A readable fallback for a sub-area with no heading of its own. */
export function humanizeSegment(segment: string): string {
  const spaced = segment.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** The page group a namespace is listed under in the admin sidebar. */
export function copyPageGroupOf(namespace: string): CopyPageGroup | null {
  return COPY_PAGE_GROUPS.find((group) => (group.namespaces as readonly string[]).includes(namespace))?.id ?? null;
}

/**
 * The words an editor would recognise a key's block by: that block's own
 * title, heading or eyebrow as the site prints it ("Four things we do
 * in-house"), else null. `defaults` is one language's flattened copy.
 * Shared by the admin grid's group titles and the public-site picker's
 * "which of these did you mean" list, so both name a block the same way.
 */
export function copyBlockTitle(key: string, defaults: Readonly<Record<string, string>>): string | null {
  const segment = copySubgroup(key);
  if (!segment) return null;
  const base = `${key.split(".", 1)[0]}.${segment}`;
  return (
    ["title", "heading", "eyebrow"]
      .map((leaf) => defaults[`${base}.${leaf}`])
      .find((value) => value && value.length <= 80) ?? null
  );
}
