/**
 * lib/project-content.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The shape of a project's translated copy — which fields there are, and
 * the limits the editor counts against.
 *
 * A plain module rather than constants alongside the server action that
 * writes them: a "use server" file may export only async functions, so an
 * exported array or object there stops the whole route compiling. Next
 * reports that at request time, not during typecheck — see
 * tests/use-server-exports.test.ts, which exists because this has now
 * caught two files.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** The seven translated columns on ProjectTranslation. */
export const CONTENT_FIELDS = [
  "name",
  "tagline",
  "description",
  "conceptDesign",
  "aboutThisProject",
  "metaTitle",
  "metaDescription",
] as const;

export type ContentField = (typeof CONTENT_FIELDS)[number];

/** Limits the counters count against — Google truncates around here. */
export const META_LIMITS = { metaTitle: 60, metaDescription: 160 } as const;
