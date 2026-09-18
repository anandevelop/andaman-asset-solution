"use client";

/**
 * components/admin/PublishingRevisionPanel.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * "ดูตัวอย่างแบบร่าง" links straight to the content type's own admin edit
 * page (already the fullest view of every field there is — building a
 * second, separate public-style preview renderer was not worth it for
 * this pass). This panel is the other two mockup actions: "เทียบกับที่
 * เผยแพร่อยู่" (compare) and the version history / revert list, both
 * fetched on demand rather than joined into the main dashboard query —
 * the same on-open-fetch pattern MediaLibrary's MediaDetail already uses.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import {
  compareToLastRevision,
  getRevisions,
  revertToRevision,
  type RevisionCompare,
  type RevisionListItem,
} from "@/app/[locale]/admin/(content)/publishing/actions";
import RevisionHistoryModal from "@/components/admin/RevisionHistoryModal";

type Labels = {
  toggle: string;
  compareTitle: string;
  noRevisionYet: string;
  currentLabel: string;
  publishedLabel: string;
  historyTitle: string;
  historyEmpty: string;
  revertAction: string;
  confirmRevert: string;
  error: string;
  /** Shown next to a revision whose `source` marks it as an automated
   *  edit (currently only Phase 5's link-opportunity auto-insert) rather
   *  than a human approve/revert. */
  autoEditBadge: string;
};

type Props = {
  locale: string;
  type: string;
  id: string;
  labels: Labels;
  /** Adds a "Full history" button that opens the richer version-history
   *  modal (components/admin/RevisionHistoryModal.tsx) — the modal's own
   *  state lives here, not in the page, so every other caller of this
   *  panel (projects, events, e-brochures, the publishing dashboard's own
   *  review-queue card) can go on omitting this prop and rendering
   *  exactly as before. The news editor is the only current caller that
   *  passes it. */
  historyModal?: { label: string; retentionDays: number };
};

function titleOf(row: Record<string, unknown> | undefined): string {
  if (!row) return "—";
  const value = (row.title ?? row.name) as string | undefined;
  return value && value.trim().length > 0 ? value : "—";
}

export default function PublishingRevisionPanel({ locale, type, id, labels, historyModal }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [compare, setCompare] = useState<RevisionCompare | null>(null);
  const [history, setHistory] = useState<RevisionListItem[]>([]);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(false);

    Promise.all([compareToLastRevision(type, id), getRevisions(type, id)])
      .then(([compareResult, historyResult]) => {
        if (cancelled) return;
        setCompare(compareResult);
        setHistory(historyResult);
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
    if (!window.confirm(labels.confirmRevert)) return;
    startTransition(async () => {
      const result = await revertToRevision(locale, type, id, revisionId);
      if (result.ok) {
        router.refresh();
        setOpen(false);
      } else {
        setError(true);
      }
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1 text-xs font-medium text-accent-700 hover:text-accent-800"
        >
          {labels.toggle}
          {open ? <ChevronUp size={13} aria-hidden /> : <ChevronDown size={13} aria-hidden />}
        </button>

        {historyModal && (
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            className="text-xs font-medium text-accent-700 hover:text-accent-800"
          >
            {historyModal.label}
          </button>
        )}
      </div>

      {historyModal && (
        <RevisionHistoryModal
          open={historyOpen}
          onClose={() => setHistoryOpen(false)}
          locale={locale}
          type={type}
          id={id}
          retentionDays={historyModal.retentionDays}
        />
      )}

      {open && (
        <div className="mt-2 space-y-4 rounded-xs border border-primary/10 bg-surface-muted p-3.5">
          {loading && <Loader2 size={16} className="animate-spin text-ink-muted" aria-hidden />}
          {error && <p className="text-xs text-red-600">{labels.error}</p>}

          {!loading && compare && (
            <div>
              <p className="mb-2 text-xs font-semibold text-primary">{labels.compareTitle}</p>
              {compare.revision === null ? (
                <p className="text-xs text-ink-muted">{labels.noRevisionYet}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[420px] border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-primary/10 text-left text-ink-muted">
                        <th className="py-1 pr-3 font-medium">Locale</th>
                        <th className="py-1 pr-3 font-medium">{labels.publishedLabel}</th>
                        <th className="py-1 font-medium">{labels.currentLabel}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {compare.current.map((row) => {
                        const loc = row.locale as string;
                        const prev = compare.revision?.find((r) => r.locale === loc);
                        const changed = titleOf(prev) !== titleOf(row);
                        return (
                          <tr key={loc} className="border-b border-primary/5 last:border-0">
                            <td className="py-1 pr-3 uppercase text-ink-muted">{loc}</td>
                            <td className="py-1 pr-3 text-ink-muted">{titleOf(prev)}</td>
                            <td className={`py-1 ${changed ? "font-semibold text-primary" : "text-ink-muted"}`}>
                              {titleOf(row)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {!loading && (
            <div>
              <p className="mb-2 text-xs font-semibold text-primary">{labels.historyTitle}</p>
              {history.length === 0 && <p className="text-xs text-ink-muted">{labels.historyEmpty}</p>}
              <ul className="space-y-1.5">
                {history.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-ink-muted">
                      {new Date(item.createdAt).toLocaleString(locale)} · {item.createdByName ?? "—"}
                      {item.source === "link_opportunity" && (
                        <span className="ml-1.5 rounded-xs bg-surface-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
                          {labels.autoEditBadge}
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => onRevert(item.id)}
                      className="shrink-0 font-medium text-accent-700 hover:text-accent-800 disabled:opacity-60"
                    >
                      {labels.revertAction}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
