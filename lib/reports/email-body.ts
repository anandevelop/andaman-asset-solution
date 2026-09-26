/**
 * lib/reports/email-body.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The monthly report as an email.
 *
 * WHY THE CALLER NEVER PASSES HTML IN
 *
 * The obvious shape — the page renders the report and hands the markup to
 * a "send this" action — means a server action that mails whatever HTML it
 * is given to the company's executives. Anybody who can reach the action
 * can reach the mailbox, and the recipients trust the sender. The action
 * takes a period, an audience and a language instead, and the body is
 * built here from the database. There is no argument that can turn into
 * content.
 *
 * WHY TABLES AND INLINE STYLES
 *
 * Mail clients are not browsers. Outlook renders with Word, Gmail strips
 * <style> blocks, and none of them has this project's stylesheet. A table
 * with inline attributes is what survives, which is why this does not
 * reuse ReportView — the screen and the email genuinely need different
 * markup, and pretending otherwise produces a report that looks broken in
 * the only place it is actually read.
 *
 * Every interpolated value goes through escapeHtml. Project names and the
 * note are free text somebody typed.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { getTranslations } from "next-intl/server";
import { escapeHtml } from "@/lib/email";
import { intlLocale } from "@/lib/format";
import { displayValue, type VitalKey } from "@/lib/analytics/vitals";
import type { ReportData } from "@/lib/reports/seo-report";

export type ReportEmail = { subject: string; html: string; text: string };

export async function renderReportEmail(options: {
  data: ReportData;
  locale: string;
  audience: string;
  noteBody: string;
}): Promise<ReportEmail> {
  const { data, locale, audience, noteBody } = options;

  const t = await getTranslations({ locale, namespace: "admin" });

  const monthFormat = new Intl.DateTimeFormat(intlLocale(locale), {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const dayFormat = new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

  const periodLabel = monthFormat.format(data.period.start);
  const audienceLabel = t(`reports.audience.${audience}` as never);

  const subject = `${t("reports.emailSubject")} — ${periodLabel}`;

  const rows = data.rows
    .map((row) => {
      const name = row.key === "news" ? t("reports.view.newsRow") : row.name;
      return (
        `<tr>` +
        `<td style="padding:6px 8px;border-top:1px solid #eee">${escapeHtml(name)}</td>` +
        // Clicks and the rate that needs them arrive with phase 4.
        `<td style="padding:6px 8px;border-top:1px solid #eee;text-align:right;color:#888">—</td>` +
        `<td style="padding:6px 8px;border-top:1px solid #eee;text-align:right"><b>${row.googleLeads}</b></td>` +
        `<td style="padding:6px 8px;border-top:1px solid #eee;text-align:right;color:#888">—</td>` +
        `<td style="padding:6px 8px;border-top:1px solid #eee;text-align:right;color:#666">${row.allLeads}</td>` +
        `</tr>`
      );
    })
    .join("");

  const vitals = data.vitals
    .map((vital) => {
      const value = vital.enoughSamples
        ? formatVital(vital.metric, displayValue(vital.metric, vital.value))
        : t("reports.view.vitalsNotEnough");
      return `<li>${vital.metric}: ${escapeHtml(value)}</li>`;
    })
    .join("");

  const countedSince = data.countedSince
    ? `${t("reports.view.countedSince")} ${dayFormat.format(data.countedSince)}`
    : t("reports.view.countedSinceUnknown");

  const draftBadge = data.note.isDraft
    ? `<p style="margin:0 0 8px;padding:6px 10px;background:#fef3c7;color:#78350f;font-size:12px">` +
      `${escapeHtml(t("reports.view.notesDraft"))}</p>`
    : "";

  const html = [
    `<div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;max-width:640px">`,
    `<h1 style="font-size:20px;margin:0 0 4px">${escapeHtml(t("reports.view.title"))}</h1>`,
    `<p style="margin:0 0 16px;color:#6b7280;font-size:13px">${escapeHtml(periodLabel)} · ${escapeHtml(audienceLabel)} · ${escapeHtml(t("reports.view.dataUpTo"))} ${dayFormat.format(data.coversUntil)}</p>`,

    `<h2 style="font-size:15px;margin:16px 0 6px">${escapeHtml(t("reports.view.headlineTitle"))}</h2>`,
    `<ul style="margin:0;padding-left:18px;font-size:14px">`,
    `<li>${escapeHtml(t("reports.view.googleClicks"))}: ${escapeHtml(t(data.search.reason === "noData" ? "reports.view.noGoogleData" : "reports.view.notConnected"))}</li>`,
    `<li>${escapeHtml(t("reports.view.googleLeads"))}: <b>${data.leads.current.google}</b></li>`,
    `<li>${escapeHtml(t("reports.view.allLeads"))}: ${data.leads.current.all}</li>`,
    `<li>${escapeHtml(t("reports.view.auditScore"))}: ${data.audit.score ?? "—"}</li>`,
    `</ul>`,

    `<h2 style="font-size:15px;margin:16px 0 6px">${escapeHtml(t("reports.view.tableTitle"))}</h2>`,
    rows === ""
      ? `<p style="font-size:13px;color:#6b7280">${escapeHtml(t("reports.view.tableEmpty"))}</p>`
      : `<table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;font-size:13px">` +
        `<tr style="text-align:left;color:#6b7280;font-size:11px;text-transform:uppercase">` +
        `<th style="padding:0 8px 6px">${escapeHtml(t("reports.view.columnProject"))}</th>` +
        `<th style="padding:0 8px 6px;text-align:right">${escapeHtml(t("reports.view.columnClicks"))}</th>` +
        `<th style="padding:0 8px 6px;text-align:right">${escapeHtml(t("reports.view.columnGoogleLeads"))}</th>` +
        `<th style="padding:0 8px 6px;text-align:right">${escapeHtml(t("reports.view.columnRate"))}</th>` +
        `<th style="padding:0 8px 6px;text-align:right">${escapeHtml(t("reports.view.columnAllLeads"))}</th>` +
        `</tr>${rows}</table>`,
    `<p style="font-size:11px;color:#6b7280;margin:8px 0 0">${escapeHtml(t("reports.view.footnote"))} ${escapeHtml(countedSince)}</p>`,

    `<h2 style="font-size:15px;margin:16px 0 6px">${escapeHtml(t("reports.view.vitalsTitle"))}</h2>`,
    `<ul style="margin:0;padding-left:18px;font-size:14px">${vitals}</ul>`,

    `<h2 style="font-size:15px;margin:16px 0 6px">${escapeHtml(t("reports.view.notesTitle"))}</h2>`,
    draftBadge,
    noteBody.trim() === ""
      ? `<p style="font-size:13px;color:#6b7280">${escapeHtml(t("reports.view.notesEmpty"))}</p>`
      : noteBody
          .split("\n")
          .filter((line) => line.trim() !== "")
          .map(
            (line) =>
              `<p style="margin:0 0 6px;font-size:14px">${escapeHtml(line)}</p>`,
          )
          .join(""),
    `</div>`,
  ].join("");

  const text = [
    `${t("reports.view.title")} — ${periodLabel} · ${audienceLabel}`,
    `${t("reports.view.dataUpTo")} ${dayFormat.format(data.coversUntil)}`,
    "",
    `${t("reports.view.googleLeads")}: ${data.leads.current.google}`,
    `${t("reports.view.allLeads")}: ${data.leads.current.all}`,
    `${t("reports.view.auditScore")}: ${data.audit.score ?? "—"}`,
    "",
    ...data.rows.map(
      (row) =>
        `- ${row.key === "news" ? t("reports.view.newsRow") : row.name}: ` +
        `${row.googleLeads} / ${row.allLeads}`,
    ),
    "",
    countedSince,
    "",
    data.note.isDraft ? `[${t("reports.view.notesDraft")}]` : "",
    noteBody,
  ]
    .filter((line) => line !== null)
    .join("\n");

  return { subject, html, text };
}

function formatVital(metric: VitalKey, value: number): string {
  if (metric === "CLS") return value.toFixed(2);
  if (metric === "LCP") return `${(value / 1000).toFixed(2)} s`;
  return `${Math.round(value)} ms`;
}
