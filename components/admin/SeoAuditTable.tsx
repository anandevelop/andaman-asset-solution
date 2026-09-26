"use client";

/**
 * components/admin/SeoAuditTable.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The audit tab's table: every URL, worst first, with what is wrong and a
 * way to act on it.
 *
 * "The screen has to take you to the fix in one click, not just tell you
 * something is wrong" — so every row carries a link straight into the
 * editor for that record, with the right language tab already selected. A
 * static page has no record and shows no link rather than a dead one.
 *
 * WAIVING TAKES A REASON, AND THE BUTTON SAYS SO
 *
 * A waiver is how a page that is short on purpose stops being red forever.
 * It is also how a rule gets quietly switched off, which is why the reason
 * is required here and recorded in the activity log by the action. The
 * submit button stays disabled until something is typed — refusing after
 * the fact would be a worse way to say the same thing.
 *
 * A waived row is not silently clean: it shows the rule with a "waived"
 * badge, so somebody reading the table can see the judgement rather than
 * an absence.
 *
 * NOT-CHECKED IS NOT A SCORE
 *
 * checkedWeight of 0 means the page could not be fetched and the number
 * beside it means nothing. Those rows say so in words instead — a "100"
 * for a page nobody could reach is the most misleading thing this screen
 * could show.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useState, useTransition } from "react";
import Link from "next/link";
import { AlertCircle, Download, ExternalLink, Loader2, ShieldOff, Undo2 } from "lucide-react";

export type AuditRow = {
  url: string;
  locale: string;
  score: number;
  checkedWeight: number;
  failedRules: string[];
  waivedRules: string[];
  editHref: string | null;
};

export type AuditTableLabels = {
  urlHeader: string;
  scoreHeader: string;
  issuesHeader: string;
  actionsHeader: string;
  notChecked: string;
  edit: string;
  waive: string;
  unwaive: string;
  waived: string;
  /** Carries "{rule}", replaced with the rule's name at render. A
   *  builder function here is a server render error — see ruleNames. */
  waiveTitle: string;
  waiveHint: string;
  reasonLabel: string;
  reasonPlaceholder: string;
  save: string;
  cancel: string;
  failed: string;
  exportCsv: string;
  empty: string;
  clean: string;
  /**
   * Every rule's display name, keyed by rule key.
   *
   * A Record and not a `(key) => string` lookup. A function in a Client
   * Component's props is not a serialisation warning: React throws
   * "Functions cannot be passed directly to Client Components" and the
   * whole page hits its error boundary, with tsc and the unit suite both
   * green. This screen shipped that way and 404'd in production; it is
   * the third time the mistake has been made in this codebase.
   */
  ruleNames: Record<string, string>;
};

type Props = {
  rows: AuditRow[];
  csv: string;
  csvFilename: string;
  labels: AuditTableLabels;
  onWaive: (url: string, ruleKey: string, reason: string) => Promise<{ ok: boolean }>;
  onRemoveWaiver: (url: string, ruleKey: string) => Promise<{ ok: boolean }>;
};

export default function SeoAuditTable({
  rows,
  csv,
  csvFilename,
  labels,
  onWaive,
  onRemoveWaiver,
}: Props) {
  const [target, setTarget] = useState<{ url: string; ruleKey: string } | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  function download() {
    // Built on the server and handed over as a prop — the same approach
    // UrlRedirectManager uses, so there is no second endpoint that would
    // need its own guard and could drift from what is on screen.
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = csvFilename;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  }

  function submitWaiver() {
    if (!target || reason.trim().length === 0) return;

    startTransition(async () => {
      const result = await onWaive(target.url, target.ruleKey, reason);
      if (!result.ok) {
        setError(true);
        return;
      }
      setTarget(null);
      setReason("");
      setError(false);
    });
  }

  if (rows.length === 0) {
    return <p className="admin-card text-sm text-ink-muted">{labels.empty}</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={download}
          className="inline-flex items-center gap-1.5 rounded-xs border border-primary/15 px-3 py-1.5 text-xs text-ink-muted transition-colors hover:border-primary/30 hover:text-primary"
        >
          <Download size={13} aria-hidden />
          {labels.exportCsv}
        </button>
      </div>

      <div className="admin-card overflow-x-auto p-0!">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-primary/10 text-left text-xs uppercase tracking-wide text-ink-muted">
              <th className="px-4 py-3 font-medium">{labels.urlHeader}</th>
              <th className="px-4 py-3 text-right font-medium">{labels.scoreHeader}</th>
              <th className="px-4 py-3 font-medium">{labels.issuesHeader}</th>
              <th className="px-4 py-3 text-right font-medium">{labels.actionsHeader}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.url} className="border-b border-primary/5 last:border-0 align-top">
                <td className="px-4 py-3 font-mono text-xs text-ink">{row.url}</td>

                <td className="px-4 py-3 text-right">
                  {row.checkedWeight === 0 ? (
                    <span className="text-xs text-ink-muted">{labels.notChecked}</span>
                  ) : (
                    <span className={`font-semibold tabular-nums ${scoreTone(row.score)}`}>
                      {row.score}
                    </span>
                  )}
                </td>

                <td className="px-4 py-3">
                  {row.failedRules.length === 0 && row.waivedRules.length === 0 ? (
                    <span className="text-xs text-emerald-700">{labels.clean}</span>
                  ) : (
                    <ul className="flex flex-wrap gap-1.5">
                      {row.failedRules.map((key) => (
                        <li key={key}>
                          <button
                            type="button"
                            onClick={() => {
                              setTarget({ url: row.url, ruleKey: key });
                              setReason("");
                              setError(false);
                            }}
                            title={labels.waive}
                            className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] text-red-800 transition-colors hover:bg-red-100"
                          >
                            {labels.ruleNames[key] ?? key}
                            <ShieldOff size={10} aria-hidden />
                          </button>
                        </li>
                      ))}
                      {row.waivedRules.map((key) => (
                        <li key={key}>
                          <button
                            type="button"
                            onClick={() =>
                              startTransition(async () => {
                                await onRemoveWaiver(row.url, key);
                              })
                            }
                            title={labels.unwaive}
                            className="inline-flex items-center gap-1 rounded-full bg-ink/5 px-2 py-0.5 text-[11px] text-ink-muted transition-colors hover:bg-ink/10"
                          >
                            {labels.ruleNames[key] ?? key} · {labels.waived}
                            <Undo2 size={10} aria-hidden />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </td>

                <td className="px-4 py-3 text-right">
                  {row.editHref && (
                    <Link
                      href={row.editHref}
                      className="inline-flex items-center gap-1 text-xs text-ink-muted hover:text-primary"
                    >
                      {labels.edit}
                      <ExternalLink size={12} aria-hidden />
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {target && (
        <div className="admin-card border-amber-200">
          <h4 className="admin-label">{labels.waiveTitle.replace("{rule}", labels.ruleNames[target.ruleKey] ?? target.ruleKey)}</h4>
          <p className="admin-hint">{labels.waiveHint}</p>
          <p className="mt-2 font-mono text-xs text-ink-muted">{target.url}</p>

          <label htmlFor="waiver-reason" className="admin-label mt-4">
            {labels.reasonLabel}
          </label>
          <textarea
            id="waiver-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={2}
            placeholder={labels.reasonPlaceholder}
            className="admin-textarea min-h-0"
          />

          {error && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-red-700">
              <AlertCircle size={13} aria-hidden />
              {labels.failed}
            </p>
          )}

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={submitWaiver}
              // A waiver with no reason is an unexplained silence six
              // months from now, so the button says no before the server
              // has to.
              disabled={pending || reason.trim().length === 0}
              className="admin-btn inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              {pending && <Loader2 size={13} className="animate-spin" aria-hidden />}
              {labels.save}
            </button>
            <button
              type="button"
              onClick={() => setTarget(null)}
              className="text-xs text-ink-muted underline"
            >
              {labels.cancel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Same thresholds the overview's ring uses, so one number never looks
 *  green in one place and amber in another. */
function scoreTone(score: number): string {
  if (score >= 80) return "text-emerald-700";
  if (score >= 60) return "text-amber-700";
  return "text-red-700";
}
