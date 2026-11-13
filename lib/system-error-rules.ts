/**
 * lib/system-error-rules.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The pure half of the site's error log (lib/system-errors.ts): what is
 * not worth reporting, how two occurrences are recognised as the same
 * failure, and how often the team is told about one.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { createHash } from "node:crypto";

/** Tell the team again about the same failure only after this long. */
export const REALERT_AFTER_MS = 6 * 60 * 60 * 1000;

/** At most this many alerts an hour, whatever is failing. A deploy that
 *  breaks every page should send a handful of messages, not hundreds. */
export const MAX_ALERTS_PER_HOUR = 5;

/*
  Not failures. redirect() and notFound() are implemented by throwing; a
  visitor who navigates away aborts the request; the rest are the browser,
  an extension or a dropped mobile connection — nothing anybody can fix.
  The same list lib/sentry.ts kept.
*/
const IGNORED = [
  "NEXT_REDIRECT",
  "NEXT_NOT_FOUND",
  "NEXT_HTTP_ERROR_FALLBACK",
  "AbortError",
  "The user aborted a request",
  "aborted",
  "ResizeObserver loop",
  "Non-Error promise rejection captured",
  "NetworkError when attempting to fetch resource",
  "Failed to fetch",
  "Load failed",
  "ChunkLoadError",
  "Loading chunk",
  // Invariants the back office throws on purpose and explains on screen
  // (app/[locale]/admin/error.tsx).
  "CANNOT_DELETE_SELF",
  "LAST_SUPER_ADMIN",
  "UNAUTHORISED",
];

export type ErrorFacts = { name: string; message: string; digest?: string };

export function factsOf(error: unknown): ErrorFacts {
  if (error instanceof Error) {
    const digest = (error as Error & { digest?: unknown }).digest;
    return {
      name: error.name || "Error",
      message: String(error.message ?? "").slice(0, 600),
      digest: typeof digest === "string" ? digest : undefined,
    };
  }
  return { name: "Error", message: String(error ?? "unknown error").slice(0, 600) };
}

export function isIgnorable(facts: ErrorFacts): boolean {
  const text = `${facts.name} ${facts.message} ${facts.digest ?? ""}`;
  return IGNORED.some((needle) => text.includes(needle));
}

/** A path without its query string, and without the locale in front. */
export function placeOf(path: string | null | undefined): string {
  const clean = String(path ?? "").split(/[?#]/)[0].replace(/^\/(th|en|zh|ru)(?=\/|$)/, "") || "/";
  return clean.slice(0, 200);
}

/**
 * The same failure, whichever record it happened on: ids, numbers and
 * quoted values are blanked before hashing, so "Lead cku3… not found" and
 * "Lead ckx9… not found" are one row with a count of two.
 */
export function fingerprintOf(kind: string, facts: ErrorFacts, place: string): string {
  const message = facts.message
    .replace(/\b[a-z0-9]{20,}\b/gi, "<id>")
    .replace(/\d+/g, "<n>")
    .replace(/(["'`]).*?\1/g, "<v>")
    .slice(0, 300);
  const where = place.replace(/\b[a-z0-9]{20,}\b/gi, "<id>").replace(/\d+/g, "<n>");
  return createHash("sha1").update(`${kind}\n${facts.name}\n${message}\n${where}`).digest("hex");
}

/** Whether to tell the team now. */
export function shouldAlert(input: { lastAlertAt: Date | null; alertsThisHour: number; now: Date }): boolean {
  if (input.alertsThisHour >= MAX_ALERTS_PER_HOUR) return false;
  if (!input.lastAlertAt) return true;
  return input.now.getTime() - input.lastAlertAt.getTime() >= REALERT_AFTER_MS;
}
