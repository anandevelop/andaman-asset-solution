/**
 * components/admin/ReportView.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The report itself — the part that gets printed, saved as PDF and posted
 * into an email.
 *
 * A server component with no interactivity on purpose: everything on it is
 * a figure computed before render, and the print stylesheet in globals.css
 * hides the admin chrome around it. What is left on paper is this element
 * and nothing else, which is why it carries its own heading, its own
 * "data up to" line and its own footnotes rather than relying on the page
 * around it to explain anything.
 *
 * THE NUMBERS THAT ARE NOT HERE
 *
 * Search clicks and index coverage arrive with phases 4 and 5. They are
 * drawn as an explicit "not connected to Google yet" line rather than
 * omitted, because a report that simply lacks a section reads as a report
 * whose author decided that section did not matter.
 *
 * THE TWO LEAD COLUMNS
 *
 * "From Google" and "all channels" sit side by side and only the first one
 * is ever divided by anything. See lib/reports/google-origin.ts for the
 * cross-base error that pairing exists to prevent, and the footnote below
 * for how it is explained to the reader — who will otherwise assume the
 * bigger number is the real one.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { ReportData } from "@/lib/reports/seo-report";
import { displayValue, type VitalKey } from "@/lib/analytics/vitals";

export type ReportViewLabels = {
  title: string;
  audienceLabel: string;
  dataUpTo: string;
  headlineTitle: string;
  googleClicks: string;
  googleLeads: string;
  allLeads: string;
  auditScore: string;
  notConnected: string;
  tableTitle: string;
  columnProject: string;
  columnClicks: string;
  columnGoogleLeads: string;
  columnRate: string;
  columnAllLeads: string;
  newsRow: string;
  tableEmpty: string;
  footnote: string;
  countedSince: string;
  countedSinceUnknown: string;
  vitalsTitle: string;
  vitalsNotEnough: string;
  notesTitle: string;
  notesDraft: string;
  notesEditedBy: string;
  notesEmpty: string;
};

type Props = {
  data: ReportData;
  labels: ReportViewLabels;
  /** Already formatted by the page, which owns the locale's date format. */
  formatted: {
    periodLabel: string;
    coversUntil: string;
    countedSince: string | null;
  };
  audienceLabel: string;
  noteBody: string;
};

export default function ReportView({
  data,
  labels,
  formatted,
  audienceLabel,
  noteBody,
}: Props) {
  return (
    <article className="report-sheet admin-card" id="report-sheet">
      <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-primary/10 pb-4">
        <div>
          <h2 className="text-xl font-semibold text-primary">{labels.title}</h2>
          <p className="mt-1 text-sm text-ink-muted">
            {formatted.periodLabel} · {audienceLabel}
          </p>
        </div>
        <p className="text-xs text-ink-muted">
          {labels.dataUpTo} {formatted.coversUntil}
        </p>
      </header>

      <section className="mt-5">
        <h3 className="admin-label">{labels.headlineTitle}</h3>

        <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* Phase 4. Drawn, not omitted — see the header. */}
          <Figure
            label={labels.googleClicks}
            value={labels.notConnected}
            muted
          />

          <Figure
            label={labels.googleLeads}
            value={String(data.leads.current.google)}
            delta={delta(data.leads.current.google, data.leads.previous.google)}
          />
          <Figure
            label={labels.allLeads}
            value={String(data.leads.current.all)}
            delta={delta(data.leads.current.all, data.leads.previous.all)}
          />
          <Figure
            label={labels.auditScore}
            value={data.audit.score === null ? "—" : String(data.audit.score)}
            delta={
              data.audit.score !== null && data.audit.previous !== null
                ? delta(data.audit.score, data.audit.previous)
                : null
            }
          />
        </dl>
      </section>

      <section className="mt-6">
        <h3 className="admin-label">{labels.tableTitle}</h3>

        {data.rows.length === 0 ? (
          <p className="admin-hint mt-2">{labels.tableEmpty}</p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-ink-muted">
                <th className="pb-2 font-medium">{labels.columnProject}</th>
                <th className="pb-2 text-right font-medium">
                  {labels.columnClicks}
                </th>
                <th className="pb-2 text-right font-medium">
                  {labels.columnGoogleLeads}
                </th>
                <th className="pb-2 text-right font-medium">
                  {labels.columnRate}
                </th>
                <th className="pb-2 text-right font-medium">
                  {labels.columnAllLeads}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.key} className="border-t border-primary/5">
                  <td className="py-2 text-ink">
                    {row.key === "news" ? labels.newsRow : row.name}
                  </td>
                  {/* Both dashes are phase 4: clicks, and the rate that
                      needs them as its denominator. */}
                  <td className="py-2 text-right text-ink-muted">—</td>
                  <td className="py-2 text-right font-medium tabular-nums text-ink">
                    {row.googleLeads}
                  </td>
                  <td className="py-2 text-right text-ink-muted">—</td>
                  <td className="py-2 text-right tabular-nums text-ink-muted">
                    {row.allLeads}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <p className="admin-hint mt-3">
          {labels.footnote}{" "}
          {formatted.countedSince
            ? `${labels.countedSince} ${formatted.countedSince}`
            : labels.countedSinceUnknown}
        </p>
      </section>

      <section className="mt-6">
        <h3 className="admin-label">{labels.vitalsTitle}</h3>

        <dl className="mt-3 grid gap-3 sm:grid-cols-4">
          {data.vitals.map((vital) => (
            <Figure
              key={vital.metric}
              label={vital.metric}
              value={
                vital.enoughSamples
                  ? formatVital(
                      vital.metric,
                      displayValue(vital.metric, vital.value),
                    )
                  : labels.vitalsNotEnough
              }
              muted={!vital.enoughSamples}
            />
          ))}
        </dl>
      </section>

      <section className="mt-6 border-t border-primary/10 pt-4">
        <h3 className="admin-label">
          {labels.notesTitle}
          {data.note.isDraft ? (
            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-normal text-amber-900">
              {labels.notesDraft}
            </span>
          ) : (
            data.note.editedBy && (
              <span className="ml-2 text-[11px] font-normal text-ink-muted">
                {labels.notesEditedBy} {data.note.editedBy}
              </span>
            )
          )}
        </h3>

        {noteBody.trim() === "" ? (
          <p className="admin-hint mt-2">{labels.notesEmpty}</p>
        ) : (
          <div className="mt-2 space-y-1.5 text-sm text-ink">
            {noteBody
              .split("\n")
              .filter((line) => line.trim() !== "")
              .map((line, index) => (
                <p key={index}>{line}</p>
              ))}
          </div>
        )}
      </section>
    </article>
  );
}

function Figure({
  label,
  value,
  delta,
  muted,
}: {
  label: string;
  value: string;
  delta?: string | null;
  muted?: boolean;
}) {
  return (
    <div className="rounded-xs border border-primary/10 px-3 py-2.5">
      <dt className="text-xs uppercase tracking-wide text-ink-muted">
        {label}
      </dt>
      <dd
        className={`mt-1 ${muted ? "text-xs text-ink-muted" : "text-2xl font-semibold tabular-nums text-ink"}`}
      >
        {value}
        {delta && (
          <span className="ml-2 text-xs font-normal text-ink-muted">
            {delta}
          </span>
        )}
      </dd>
    </div>
  );
}

/**
 * "▲ 3" / "▼ 2" against the comparison period.
 *
 * An absolute change, not a percentage. These are small counts — six leads
 * against three — and "+100%" on a move of three says far more than
 * happened. The arrow carries a word for it in the label above rather than
 * relying on colour, the same rule VitalsPanel follows.
 */
function delta(current: number, previous: number): string | null {
  const change = current - previous;
  if (change === 0) return null;
  return change > 0 ? `▲ ${change}` : `▼ ${Math.abs(change)}`;
}

function formatVital(metric: VitalKey, value: number): string {
  if (metric === "CLS") return value.toFixed(2);
  if (metric === "LCP") return `${(value / 1000).toFixed(2)} s`;
  return `${Math.round(value)} ms`;
}
