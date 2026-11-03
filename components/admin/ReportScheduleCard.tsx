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
import { Mail, Loader2, Pencil } from "lucide-react";
import type { RecipientsResult, TestEmailResult } from "@/app/[locale]/admin/(growth)/reports/actions";

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
  editRecipients: string;
  recipientsPlaceholder: string;
  recipientsHelp: string;
  saveRecipients: string;
  cancel: string;
  savedRecipients: string;
  invalidRecipients: string;
  tooManyRecipients: string;
  saveFailed: string;
  fromEnv: string;
};

type Props = {
  labels: ScheduleLabels;
  recipients: string[];
  /** "env": coming from REPORT_RECIPIENTS on the server, not saved here. */
  recipientSource: "admin" | "env" | null;
  saveRecipients: (raw: string) => Promise<RecipientsResult>;
  emailConfigured: boolean;
  /** Already formatted by the page, which owns the locale's date format. */
  lastSent: { at: string; ok: boolean; error: string | null } | null;
  noteIsDraft: boolean;
  action: () => Promise<TestEmailResult>;
};

export default function ReportScheduleCard({
  labels,
  recipients,
  recipientSource,
  saveRecipients,
  emailConfigured,
  lastSent,
  noteIsDraft,
  action,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<TestEmailResult | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(recipients.join(", "));
  const [saving, startSaving] = useTransition();
  const [saved, setSaved] = useState<RecipientsResult | null>(null);

  const save = () =>
    startSaving(async () => {
      const outcome = await saveRecipients(draft);
      setSaved(outcome);
      if (outcome.ok) setEditing(false);
    });

  return (
    <section className="admin-card print:hidden">
      <h3 className="admin-label">{labels.title}</h3>
      <p className="admin-hint">{labels.hint}</p>

      <dl className="mt-3 space-y-2 text-sm">
        <div>
          <dt className="text-xs uppercase tracking-wide text-adm-muted">
            {labels.recipients}
          </dt>
          <dd className="mt-0.5 text-adm-text">
            {editing ? (
              <div className="space-y-2">
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  rows={3}
                  placeholder={labels.recipientsPlaceholder}
                  aria-label={labels.recipients}
                  className="admin-input w-full font-mono text-xs"
                />
                <p className="admin-hint">{labels.recipientsHelp}</p>
                <div className="flex gap-2">
                  <button type="button" onClick={save} disabled={saving} className="admin-btn text-xs">
                    {saving && <Loader2 size={13} className="animate-spin" aria-hidden />}
                    {labels.saveRecipients}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(false);
                      setDraft(recipients.join(", "));
                      setSaved(null);
                    }}
                    className="admin-btn-ghost text-xs"
                  >
                    {labels.cancel}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-2">
                <span>
                  {recipients.length === 0 ? (
                    <span className="text-adm-muted">{labels.noRecipients}</span>
                  ) : (
                    <span className="break-all">{recipients.join(", ")}</span>
                  )}
                  {recipientSource === "env" && (
                    <span className="block text-xs text-adm-muted">{labels.fromEnv}</span>
                  )}
                  {!emailConfigured && (
                    <span className="block text-xs text-adm-warning">{labels.notConfigured}</span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(true);
                    setSaved(null);
                  }}
                  className="admin-btn-ghost shrink-0 py-1! text-xs"
                >
                  <Pencil size={12} aria-hidden />
                  {labels.editRecipients}
                </button>
              </div>
            )}
            {saved?.ok && !editing && <p className="mt-1 text-xs text-adm-success">{labels.savedRecipients}</p>}
            {saved && !saved.ok && (
              <p className="mt-1 text-xs text-adm-danger">
                {saved.error === "INVALID"
                  ? `${labels.invalidRecipients} ${saved.invalid?.join(", ") ?? ""}`
                  : saved.error === "TOO_MANY"
                    ? labels.tooManyRecipients
                    : labels.saveFailed}
              </p>
            )}
          </dd>
        </div>

        <div>
          <dt className="text-xs uppercase tracking-wide text-adm-muted">
            {labels.lastSent}
          </dt>
          <dd className="mt-0.5">
            {lastSent === null ? (
              <span className="text-adm-muted">{labels.neverSent}</span>
            ) : (
              <span className={lastSent.ok ? "text-adm-text" : "text-adm-danger"}>
                {lastSent.at} · {lastSent.ok ? labels.succeeded : labels.failed}
                {lastSent.error && (
                  <span className="text-adm-muted"> — {lastSent.error}</span>
                )}
              </span>
            )}
          </dd>
        </div>
      </dl>

      <p className="admin-hint mt-3">{labels.noScheduler}</p>

      {noteIsDraft && (
        <p className="mt-3 rounded-xs border border-adm-warning/30 bg-adm-warning-bg px-3 py-2 text-xs text-adm-warning">
          {labels.draftWarning}
        </p>
      )}

      <button
        type="button"
        disabled={pending || !emailConfigured || recipients.length === 0}
        onClick={() =>
          startTransition(async () => {
            setResult(null);
            // A request that dies on the way (a proxy timeout, a dropped
            // connection) throws here; caught, it is shown on the card
            // instead of taking the whole page to its error boundary.
            try {
              setResult(await action());
            } catch (error) {
              setResult({ ok: false, error: error instanceof Error ? error.message : String(error) });
            }
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
        <p className="mt-2 text-xs text-adm-success">{labels.sentOk}</p>
      )}
      {result && !result.ok && (
        // Verbatim: an administrator is standing here, and "Invalid login"
        // or "ECONNREFUSED" is something they can act on.
        <p className="mt-2 text-xs text-adm-danger">
          {labels.failed} — {result.error}
        </p>
      )}
    </section>
  );
}
