"use client";

/**
 * components/admin/RevisionHistoryModal.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The richer edit-history view Phase 6.4 asks for: version numbers, who
 * edited each one, when, and a real change summary — all of which
 * lib/publishing.ts's getRevisionHistory()/countTranslationDiff() already
 * compute for the Publishing dashboard's own review-queue history section
 * (app/[locale]/admin/publishing/page.tsx). This is that same data,
 * exposed through getRevisionHistoryList() and reused here in a modal
 * rather than a second inline disclosure, opened from
 * PublishingRevisionPanel's "Full history" button.
 *
 * Self-translates via useTranslations() rather than taking a `labels` prop
 * — the fieldCount string needs a live ICU plural resolved per row
 * (`t("fieldCount", {count})`), and a Server Component parent cannot pass
 * a function like that across the client boundary (only Server Actions get
 * that exception; see components/admin/InsertImageModal.tsx for the same
 * self-translating pattern on the same kind of admin modal).
 *
 * Revert is the same write path as PublishingRevisionPanel's own thin
 * version list — revertToRevision() — not a second way to restore content.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import AdminModal from "@/components/admin/AdminModal";
import {
  getRevisionHistoryList,
  revertToRevision,
  type RevisionHistoryItem,
} from "@/app/[locale]/admin/(content)/publishing/actions";

type Props = {
  open: boolean;
  onClose: () => void;
  locale: string;
  type: string;
  id: string;
  /** lib/publishing.ts's REVISION_RETENTION_DAYS — a plain number, passed
   *  down from the server page rather than imported here, since that
   *  module is "server-only" and this is a client component. */
  retentionDays: number;
};

export default function RevisionHistoryModal({ open, onClose, locale, type, id, retentionDays }: Props) {
  const t = useTranslations("admin.publishing.revision");
  const tCommon = useTranslations("admin.common");
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<RevisionHistoryItem[]>([]);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(false);

    getRevisionHistoryList(type, id)
      .then((result) => {
        if (!cancelled) setItems(result);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, type, id]);

  function onRevert(revisionId: string) {
    if (!window.confirm(t("confirmRevert"))) return;
    startTransition(async () => {
      const result = await revertToRevision(locale, type, id, revisionId);
      if (result.ok) {
        router.refresh();
        onClose();
      } else {
        setError(true);
      }
    });
  }

  return (
    <AdminModal
      open={open}
      onClose={onClose}
      titleId="revision-history-modal-title"
      title={t("historyTitle")}
      closeLabel={t("closeLabel")}
      className="max-w-xl"
    >
      <div className="space-y-3">
        <p className="text-xs text-ink-muted">{t("historyModalNote")}</p>

        {loading && <Loader2 size={16} className="animate-spin text-ink-muted" aria-hidden />}
        {error && <p className="text-xs text-red-600">{tCommon("error")}</p>}

        {!loading && items.length === 0 && <p className="text-xs text-ink-muted">{t("historyEmpty")}</p>}

        {!loading && items.length > 0 && (
          <ul className="max-h-[60vh] space-y-2.5 overflow-y-auto">
            {items.map((item) => (
              <li key={item.id} className="flex items-start justify-between gap-3 border-b border-primary/5 pb-2.5 last:border-b-0">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-primary">
                    <span className="text-ink-muted">v{item.version}</span>
                    {item.isLive ? t("liveVersion") : t("olderVersion")}
                    {item.source === "link_opportunity" && (
                      <span className="rounded-xs bg-surface-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
                        {t("autoEditBadge")}
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-[11px] text-ink-muted">
                    {new Date(item.createdAt).toLocaleString(locale)}
                    {item.createdByName && ` · ${item.createdByName}`}
                    {item.changedFieldCount !== null && ` · ${t("fieldCount", { count: item.changedFieldCount })}`}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => onRevert(item.id)}
                  className="shrink-0 text-xs font-medium text-accent-700 hover:text-accent-800 disabled:opacity-60"
                >
                  {t("revertAction")}
                </button>
              </li>
            ))}
          </ul>
        )}

        <p className="rounded-xs bg-surface-muted px-3 py-2 text-[11px] leading-relaxed text-ink-muted">
          {t("retentionNote", { days: retentionDays })}
        </p>
      </div>
    </AdminModal>
  );
}
