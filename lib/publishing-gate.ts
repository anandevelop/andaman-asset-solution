import "server-only";

/**
 * lib/publishing-gate.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The one rule the draft → review → publish workflow (ContentStatus, see
 * prisma/schema.prisma) actually enforces outside its own dashboard:
 * `isPublished` may only become true while a row's `contentStatus` is
 * PUBLISHED. Everything else about the workflow — the review queue,
 * revision history, reverting — lives entirely in
 * app/[locale]/admin/publishing; this one function is called from each
 * content type's own existing edit action (updateProject, updateArticle,
 * updateEvent, updateBrochure) — and, since Phase 6, from createArticle
 * too, once new articles stopped inheriting the schema's legacy
 * `PUBLISHED` default — so the gate holds no matter which door a publish
 * attempt comes through.
 *
 * Unpublishing (false) is never gated — the workflow exists to slow down
 * making something newly visible, not to make it harder to take something
 * down. A publish attempt that fails the gate does not fail the whole
 * save: the row's other edited fields still save normally, and
 * isPublished is left exactly as it was, rather than bouncing the entire
 * form over one checkbox. That trade is deliberate — wiring a new,
 * translated inline error into four separate form components for a
 * single checkbox was judged not worth it when the Publishing dashboard
 * is already the one clear, discoverable place an editor learns "this
 * needs to go through review first".
 */

import { ContentStatus } from "@prisma/client";

export function resolveIsPublished(params: {
  contentStatus: ContentStatus;
  requestedIsPublished: boolean;
  currentIsPublished: boolean;
}): boolean {
  const { contentStatus, requestedIsPublished, currentIsPublished } = params;
  if (!requestedIsPublished) return false;
  if (contentStatus === ContentStatus.PUBLISHED) return true;
  return currentIsPublished;
}
