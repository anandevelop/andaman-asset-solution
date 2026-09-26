"use client";

/**
 * components/admin/ReportScheduleCard.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Where the monthly report goes, when it last went, and a button to prove
 * it still can.
 *
 * NOTHING HERE SCHEDULES ANYTHING
 *
 * The endpoint exists (/api/cron/monthly-report) and the application has
 * no scheduler: something outside it — a cron container, a platform
 * scheduler, an external ping — has to call it. The card says so rather
 * than drawing a switch that implies otherwise, which is the difference
 * between "nobody has wired the scheduler yet" and a team believing the
 * report goes out every month while it never has.
 *
 * The test button sends to the real recipients, not to the person
 * clicking. The question it answers is "will the monthly send arrive", and
 * a successful send to oneself proves only that one's own mailbox works.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useState, useTransition } from "react";
import { Mail, Loader2 } from "lucide-react";
import type { TestEmailResult } from "@/app/[locale]/admin/(growth)/reports/actions";

export type ScheduleLabels = {
  title: string;
  hint: string;
  recipients: string;
  noRecipients: string;
  notConfigured: string;
  lastSent: string;
  neverSent: string;
  succeeded: string;
  failed: string;
  sendTest: string;
  sending: string;
  sentOk: string;
  draftWarning: string;
  noScheduler: string;
};

type Props = {
  labels: ScheduleLabels;
  recipients: string[];
  emailConfigured: boolean;
  /** Already formatted by the page, which owns the locale's date format. */
  lastSent: { at: string; ok: boolean; error: string | null } | null;
  noteIsDraft: boolean;
  action: () => Promise<TestEmailResult>;
};

export default function ReportScheduleCard({
  labels,
  recipients,
  emailConfigured,
  lastSent,
  noteIsDraft,
  action,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<TestEmailResult | null>(null);

  return (
    <section className="admin-card print:hidden">
      <h3 className="admin-label">{labels.title}</h3>
      <p className="admin-hint">{labels.hint}</p>

      <dl className="mt-3 space-y-2 text-sm">
        <div>
          <dt className="text-xs uppercase tracking-wide text-ink-muted">
            {labels.recipients}
          </dt>
          <dd className="mt-0.5 text-ink">
            {!emailConfigured ? (
              <span className="text-ink-muted">{labels.notConfigured}</span>
            ) : recipients.length === 0 ? (
              <span className="text-ink-muted">{labels.noRecipients}</span>
            ) : (
              <span className="break-all">{recipients.join(", ")}</span>
            )}
          </dd>
        </div>

        <div>
          <dt className="text-xs uppercase tracking-wide text-ink-muted">
            {labels.lastSent}
          </dt>
          <dd className="mt-0.5">
            {lastSent === null ? (
              <span className="text-ink-muted">{labels.neverSent}</span>
            ) : (
              <span className={lastSent.ok ? "text-ink" : "text-red-700"}>
                {lastSent.at} · {lastSent.ok ? labels.succeeded : labels.failed}
                {lastSent.error && (
                  <span className="text-ink-muted"> — {lastSent.error}</span>
                )}
              </span>
            )}
          </dd>
        </div>
      </dl>

      <p className="admin-hint mt-3">{labels.noScheduler}</p>

      {noteIsDraft && (
        <p className="mt-3 rounded-xs border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {labels.draftWarning}
        </p>
      )}

      <button
        type="button"
        disabled={pending || !emailConfigured || recipients.length === 0}
        onClick={() =>
          startTransition(async () => {
            setResult(null);
            setResult(await action());
          })
        }
        className="admin-btn-ghost mt-3"
      >
        {pending ? (
          <Loader2 size={14} className="animate-spin" aria-hidden />
        ) : (
          <Mail size={14} aria-hidden />
        )}
        {pending ? labels.sending : labels.sendTest}
      </button>

      {result?.ok && (
        <p className="mt-2 text-xs text-emerald-700">{labels.sentOk}</p>
      )}
      {result && !result.ok && (
        // Verbatim: an administrator is standing here, and "Invalid login"
        // or "ECONNREFUSED" is something they can act on.
        <p className="mt-2 text-xs text-red-700">
          {labels.failed} — {result.error}
        </p>
      )}
    </section>
  );
}
