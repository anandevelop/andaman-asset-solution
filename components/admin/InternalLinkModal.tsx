"use client";

/**
 * components/admin/InternalLinkModal.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The rich-text editor's "insert internal link" tool (⌘K, or the toolbar's
 * link button) — search-as-you-type across Project/NewsArticle/Event and
 * the static pages, via lib/admin/content-link-index.ts's
 * searchInternalLinks server action. Anchor text defaults to whatever was
 * selected in the editor when the modal opened; a manual-URL field is the
 * escape hatch for an external link or a path this search doesn't cover,
 * matching the same "search plus a manual-URL fallback" shape
 * components/admin/ImageUploader.tsx already established for pasted URLs.
 *
 * Picked paths are locale-relative (no `/${locale}` prefix) — see
 * lib/redirects.ts's fromPath convention — with `internal: true` so
 * RichTextEditor.tsx's InternalAwareLink mark writes `data-internal`,
 * letting the render path and a future orphan-page scan tell an
 * editor-inserted internal link apart from hand-typed markup. A manual
 * URL is only marked internal if it starts with "/" — the admin typed a
 * path, not a full external address.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import AdminModal from "@/components/admin/AdminModal";
import { searchInternalLinks } from "@/app/[locale]/admin/content-link-search-actions";
import type { ContentLinkHit } from "@/lib/admin/content-link-index";
import type { InsertedLink } from "@/components/admin/RichTextEditor";
import type { Locale } from "@/i18n";

type Props = {
  open: boolean;
  onClose: () => void;
  locale: Locale;
  /** The editor's current selection text, if any — prefilled so picking a
   *  result doesn't silently drop the words the admin had selected. */
  initialAnchorText: string;
  onInsert: (link: InsertedLink) => void;
};

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 200;

export default function InternalLinkModal({ open, onClose, locale, initialAnchorText, onInsert }: Props) {
  const t = useTranslations("admin.news.linkModal");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ContentLinkHit[]>([]);
  const [manualUrl, setManualUrl] = useState("");
  const [anchorText, setAnchorText] = useState(initialAnchorText);
  const [newTab, setNewTab] = useState(false);
  const [nofollow, setNofollow] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Reset every time the modal is (re)opened, not just on mount — it stays
  // in the tree between opens so its own useState wouldn't otherwise pick
  // up a fresh selection's anchor text.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setResults([]);
    setManualUrl("");
    setAnchorText(initialAnchorText);
    setNewTab(false);
    setNofollow(false);
  }, [open, initialAnchorText]);

  useEffect(() => {
    if (!open || query.trim().length < MIN_QUERY_LENGTH) {
      setResults([]);
      return;
    }

    const handle = setTimeout(() => {
      startTransition(async () => {
        const hits = await searchInternalLinks(locale, query.trim());
        setResults(hits);
      });
    }, DEBOUNCE_MS);

    return () => clearTimeout(handle);
  }, [query, locale, open]);

  function pick(path: string, internal: boolean) {
    const text = anchorText.trim();
    if (!text || !path) return;
    onInsert({ path, anchorText: text, newTab, nofollow, internal });
    onClose();
  }

  const canInsert = anchorText.trim().length > 0;

  return (
    <AdminModal
      open={open}
      onClose={onClose}
      titleId="internal-link-modal-title"
      title={t("title")}
      closeLabel={t("close")}
      className="max-w-xl"
    >
      <div className="space-y-4">
        <div>
          <label className="admin-label" htmlFor="link-anchor-text">
            {t("anchorTextLabel")}
          </label>
          <input
            id="link-anchor-text"
            value={anchorText}
            onChange={(event) => setAnchorText(event.target.value)}
            className="admin-input"
          />
        </div>

        <div className="flex flex-wrap gap-4 text-sm text-ink">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={newTab}
              onChange={(event) => setNewTab(event.target.checked)}
              className="h-4 w-4 rounded-xs border-primary/30 text-primary focus:ring-primary/30"
            />
            {t("newTabLabel")}
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={nofollow}
              onChange={(event) => setNofollow(event.target.checked)}
              className="h-4 w-4 rounded-xs border-primary/30 text-primary focus:ring-primary/30"
            />
            {t("nofollowLabel")}
          </label>
        </div>

        <div>
          <label className="admin-label" htmlFor="link-search">
            {t("searchLabel")}
          </label>
          <div className="relative">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"
              aria-hidden
            />
            {/* Autofocus is deliberate: opening the modal without landing
                focus in its one useful field would make ⌘K a keystroke
                that does nothing visible. */}
            <input
              id="link-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("searchPlaceholder")}
              className="admin-input pl-8"
              autoFocus
            />
          </div>

          {query.trim().length >= MIN_QUERY_LENGTH && (
            <ul className="mt-2 max-h-56 divide-y divide-primary/5 overflow-y-auto rounded-xs border border-primary/10">
              {isPending ? (
                <li className="px-3 py-2 text-xs text-ink-muted">{t("searching")}</li>
              ) : results.length === 0 ? (
                <li className="px-3 py-2 text-xs text-ink-muted">{t("noResults")}</li>
              ) : (
                results.map((hit) => (
                  <li key={`${hit.type}-${hit.id}`}>
                    <button
                      type="button"
                      onClick={() => pick(hit.path, true)}
                      disabled={!canInsert}
                      className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm transition-colors hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="font-medium text-ink">{hit.title}</span>
                      <span className="text-xs text-ink-muted">
                        {hit.path} · {t(`type.${hit.type}`)}
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>

        <div className="border-t border-primary/10 pt-4">
          <label className="admin-label" htmlFor="link-manual-url">
            {t("manualUrlLabel")}
          </label>
          <div className="flex gap-2">
            <input
              id="link-manual-url"
              value={manualUrl}
              onChange={(event) => setManualUrl(event.target.value)}
              placeholder="https://…"
              className="admin-input font-mono text-xs"
            />
            <button
              type="button"
              onClick={() => pick(manualUrl.trim(), manualUrl.trim().startsWith("/"))}
              disabled={!canInsert || !manualUrl.trim()}
              className="admin-btn-ghost shrink-0"
            >
              {t("insert")}
            </button>
          </div>
          <p className="admin-hint">{t("manualUrlHint")}</p>
        </div>
      </div>
    </AdminModal>
  );
}
