"use server";

/**
 * app/[locale]/admin/content-link-search-actions.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Server action wrapper around lib/admin/content-link-index.ts, living
 * next to command-search-actions.ts since it's the same shape (thin
 * action, real query logic kept in lib/) — split into its own file
 * because the two searches answer different questions (admin edit pages
 * vs. public content to link to) and have no reason to share a module.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { requireCapabilityAction } from "@/lib/admin/guard";
import { searchContentLinks, type ContentLinkHit } from "@/lib/admin/content-link-index";

export async function searchInternalLinks(locale: string, query: string): Promise<ContentLinkHit[]> {
  // The content zone's own capability, not a rank: the lowest rank now
  // includes human resources, who have no business in the news editor.
  await requireCapabilityAction("viewContent");
  return searchContentLinks(locale, query);
}
