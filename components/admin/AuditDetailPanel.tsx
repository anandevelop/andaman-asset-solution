"use client";

/**
 * components/admin/AuditDetailPanel.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * "สิ่งที่เปลี่ยนไป" — one audit entry, field by field, old above new.
 *
 * The panel is honest about the three states an entry can be in, because
 * they look identical in the list and are not the same thing at all:
 * values recorded and revertable, values deliberately not recorded
 * (customer data — see AuditLog.changes), and nothing to record because
 * the entry is a create, a delete or a bulk write.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, Loader2, RotateCcw } from "lucide-react";
import { revertAuditEntry } from "@/app/[locale]/admin/(system)/activity/actions";

export type AuditChangeView = { field: string; label: string; before: string; after: string };

export type AuditEntryView = {
  id: string;
  recordLabel: string | null;
  modelLabel: string;
  actionLabel: string;
  actorName: string;
  actorRole: string | null;
  at: string;
  ip: string | null;
  userAgent: string | null;
  changes: AuditChangeView[];
  /** Why there is no diff, when there isn't one. */
  noValuesReason: "customerData" | "notAnUpdate" | "noChange" | null;
  canRevert: boolean;
  recordHref: string | null;
};

type Props = {
  locale: string;
  entry: AuditEntryView | null;
  labels: {
    title: string;
    empty: string;
    record: string;
    actor: string;
    time: string;
    from: string;
    openRecord: string;
    revert: string;
    revertNote: string;
    reverted: string;
    reason: Record<string, string>;
    error: Record<string, string>;
    confirm: string;
  };
};

export default function AuditDetailPanel({ locale, entry, labels }: Props) {
  const router = useRouter();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!entry) {
    return (
      <section className="admin-card flex min-h-[240px] items-center justify-center">
        <p className="text-center text-sm text-ink-muted">{labels.empty}</p>
      </section>
    );
  }

  const revert = () => {
    if (!window.confirm(labels.confirm)) return;
    setError(null);

    startTransition(async () => {
      const result = await revertAuditEntry(locale, entry.id);
      if (result.ok) {
        setDone(true);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  };

  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <dt className="shrink-0 text-xs text-ink-muted">{label}</dt>
      <dd className="text-right text-sm text-primary">{children}</dd>
    </div>
  );

  return (
    <section className="admin-card space-y-4">
      <h2 className="text-sm font-semibold text-primary">{labels.title}</h2>

      <dl className="divide-y divide-primary/5">
        <Row label={labels.record}>
          {entry.recordLabel ?? "—"}{" "}
          <span className="text-xs text-ink-muted">{entry.modelLabel}</span>
        </Row>
        <Row label={labels.actor}>
          {entry.actorName}
          {entry.actorRole && <span className="text-xs text-ink-muted"> · {entry.actorRole}</span>}
        </Row>
        <Row label={labels.time}>{entry.at}</Row>
        {(entry.ip || entry.userAgent) && (
          <Row label={labels.from}>
            <span className="text-xs text-ink-muted">
              {[entry.ip, entry.userAgent].filter(Boolean).join(" · ")}
            </span>
          </Row>
        )}
      </dl>

      {entry.changes.length > 0 ? (
        <div className="space-y-3">
          {entry.changes.map((change) => (
            <div key={change.field}>
              <p className="admin-label">{change.label}</p>
              {/* Old above new, red then green — the direction a diff is
                  read, and the same order the version panel uses. */}
              <p className="rounded-xs border border-red-200 bg-red-50/70 px-3 py-2 text-sm text-red-900 line-through decoration-red-300">
                {change.before || "—"}
              </p>
              <p className="mt-1 rounded-xs border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-sm text-emerald-900">
                {change.after || "—"}
              </p>
            </div>
          ))}
        </div>
      ) : (
        entry.noValuesReason && (
          <p className="rounded-xs bg-surface-muted px-3 py-2.5 text-xs leading-relaxed text-ink-muted">
            {labels.reason[entry.noValuesReason]}
          </p>
        )
      )}

      <div className="flex flex-wrap items-center gap-2">
        {entry.recordHref && (
          <Link href={entry.recordHref} className="admin-btn-ghost py-2! text-xs">
            {labels.openRecord}
          </Link>
        )}

        {entry.canRevert && (
          <button
            type="button"
            onClick={revert}
            disabled={pending || done}
            className="admin-btn py-2! text-xs"
          >
            {pending ? (
              <Loader2 size={13} className="animate-spin" aria-hidden />
            ) : (
              <RotateCcw size={13} aria-hidden />
            )}
            {labels.revert}
          </button>
        )}
      </div>

      {done && (
        <p className="flex items-center gap-1.5 text-xs text-emerald-700">
          <Check size={13} aria-hidden />
          {labels.reverted}
        </p>
      )}

      {error && (
        <p className="flex items-start gap-1.5 text-xs text-red-700">
          <AlertCircle size={13} className="mt-0.5 shrink-0" aria-hidden />
          {labels.error[error] ?? labels.error.REVERT_FAILED}
        </p>
      )}

      {entry.canRevert && (
        <p className="border-t border-primary/10 pt-3 text-[11px] leading-relaxed text-ink-muted">
          {labels.revertNote}
        </p>
      )}
    </section>
  );
}
