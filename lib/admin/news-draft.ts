/**
 * lib/admin/news-draft.ts
 * ─────────────────────────────────────────────────────────────────────────
 * §7.1's browser half: the article editor's unsaved work, kept in
 * localStorage so closing the tab or letting a session expire does not
 * take 1,500 words with it.
 *
 * NOTHING HERE EVER RESTORES ANYTHING BY ITSELF
 *
 * §7.1 is explicit, and it is the right call: a draft that reinstates
 * itself on load is a draft that can silently overwrite an edit someone
 * else made in between, or bring back text its author deliberately deleted
 * and saved. This module only answers "is there something newer than what
 * the server gave us", and NewsForm offers it as a banner with two
 * buttons. Recovering is always a person's decision.
 *
 * WHY BOTH A TIMESTAMP AND A COMPARISON
 *
 * "Newer than the server" alone is not enough: saving the article writes
 * the same text to the server that is already in the draft, and the draft
 * is still, by a second or two, the newer of the two. That would offer to
 * recover what was just saved, on every reload, forever. So a draft only
 * counts when it is both newer *and* actually different from what the
 * server handed the form.
 *
 * Every localStorage access is wrapped: it throws outright in a private
 * window in some browsers, and the feature failing has to be quieter than
 * the editor failing.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** The fields NewsForm mirrors into state, which is what a recovery can
 *  put back. `excerpt` is deliberately not among them — it is an
 *  uncontrolled field by NewsForm's own design decision, and making it
 *  controlled for this would undo that for a field that rarely changes. */
export type NewsDraftValues = {
  title: string;
  slug: string;
  content: string;
  metaTitle: string;
  metaDescription: string;
  focusKeyword: string;
};

export type NewsDraft = {
  /** ISO 8601, in UTC — compared against the article row's updatedAt. */
  savedAt: string;
  values: NewsDraftValues;
};

const PREFIX = "andaman.news.draft";

/** Keyed by article *and* locale: the four language tabs are four separate
 *  bodies of text, and a draft of the Thai one must not be offered on the
 *  English one. */
export function draftKey(articleId: string, lang: string): string {
  return `${PREFIX}.${articleId}.${lang}`;
}

export function readDraft(articleId: string, lang: string): NewsDraft | null {
  try {
    const raw = window.localStorage.getItem(draftKey(articleId, lang));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<NewsDraft>;
    // Anything that is not the shape written below is treated as absent
    // rather than trusted — this is parsed user-writable storage.
    if (typeof parsed?.savedAt !== "string" || typeof parsed?.values !== "object") return null;
    if (!parsed.values || typeof parsed.values.content !== "string") return null;
    return { savedAt: parsed.savedAt, values: parsed.values as NewsDraftValues };
  } catch {
    return null;
  }
}

export function writeDraft(articleId: string, lang: string, values: NewsDraftValues): void {
  try {
    const draft: NewsDraft = { savedAt: new Date().toISOString(), values };
    window.localStorage.setItem(draftKey(articleId, lang), JSON.stringify(draft));
  } catch {
    // Quota exceeded, or storage disabled. Losing the safety net is not a
    // reason to interrupt someone's writing.
  }
}

export function clearDraft(articleId: string, lang: string): void {
  try {
    window.localStorage.removeItem(draftKey(articleId, lang));
  } catch {
    // As above.
  }
}

/** Whether any of the recoverable fields differ. */
export function draftDiffers(draft: NewsDraftValues, server: NewsDraftValues): boolean {
  return (Object.keys(server) as (keyof NewsDraftValues)[]).some(
    (field) => (draft[field] ?? "") !== server[field],
  );
}

/**
 * Whether a stored draft is worth offering to recover.
 *
 * Both conditions, for the reason in the header: newer than the server's
 * copy, and not the same text the server already has.
 */
export function isRecoverable(
  draft: NewsDraft | null,
  serverUpdatedAt: string | null | undefined,
  serverValues: NewsDraftValues,
): boolean {
  if (!draft) return false;

  const saved = Date.parse(draft.savedAt);
  if (Number.isNaN(saved)) return false;

  // No server timestamp (a brand-new article that has never been saved):
  // anything stored is by definition newer than nothing.
  const server = serverUpdatedAt ? Date.parse(serverUpdatedAt) : Number.NEGATIVE_INFINITY;
  if (!Number.isNaN(server) && saved <= server) return false;

  return draftDiffers(draft.values, serverValues);
}
