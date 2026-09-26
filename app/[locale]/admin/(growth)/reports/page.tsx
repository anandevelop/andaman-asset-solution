/**
 * app/[locale]/admin/(growth)/reports/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The report somebody actually sends — readable in two minutes, printable
 * without the admin around it.
 *
 * GROWTH, NOT ADMINISTRATION
 *
 * The original plan filed this under Administration. It belongs beside SEO
 * and Analytics: "how is the site doing" is one person's job and "who
 * deleted that" is another's, and the sidebar already made that split when
 * those two moved. See lib/admin/nav.ts.
 *
 * PRINT IS THE EXPORT
 *
 * Save-as-PDF is the browser's, driven by the @media print rules in
 * globals.css: they hide the sidebar, the controls, the editor and the
 * alert card, leaving the report sheet alone on the page. A headless
 * browser in the image to render a PDF the operating system's own dialog
 * already produces would cost about 400MB and a second rendering path to
 * keep in step with this one.
 *
 * WHAT THE SCREEN REFUSES TO CLAIM
 *
 * Search clicks and index coverage belong to phases 4 and 5. Every figure
 * that needs them is drawn as "not connected to Google yet" rather than as
 * a zero, and the per-development conversion rate — the number the whole
 * report exists for — stays blank until its denominator exists. See
 * lib/reports/google-origin.ts for why a rate against all leads would be
 * worse than no rate at all.
 *
 * Role.ADMIN via the (growth) layout, and every action re-checks for
 * itself.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { getTranslations } from "next-intl/server";
import { FileText } from "lucide-react";
import { Role } from "@prisma/client";
import { requireAdmin } from "@/lib/admin/guard";
import { isDatabaseOffline } from "@/lib/db";
import { prisma } from "@/lib/prisma";
import { safeQuery } from "@/lib/db";
import { intlLocale } from "@/lib/format";
import { locales } from "@/i18n";
import { isEmailConfigured, reportRecipients } from "@/lib/email";
import { getReportData } from "@/lib/reports/seo-report";
import { resolvePeriod } from "@/lib/reports/period";
import { draftNoteText, isAudience } from "@/lib/reports/audience";
import { getAlertRules } from "@/lib/seo/alerts";
import {
  ALERT_KINDS,
  ALERTS_AWAITING_GOOGLE,
  ALERT_THRESHOLDS,
} from "@/lib/seo/alert-rules";
import ReportControls from "@/components/admin/ReportControls";
import ReportView from "@/components/admin/ReportView";
import ReportNoteEditor from "@/components/admin/ReportNoteEditor";
import ReportScheduleCard from "@/components/admin/ReportScheduleCard";
import AlertRulesCard from "@/components/admin/AlertRulesCard";
import { saveReportNote, sendTestReport, toggleAlertRule } from "./actions";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    audience?: string;
    period?: string;
    reportLocale?: string;
    from?: string;
    to?: string;
  }>;
};

export default async function AdminReportsPage(props: Props) {
  const { locale } = await props.params;
  const searchParams = await props.searchParams;

  await requireAdmin(locale, Role.ADMIN);

  const t = await getTranslations({ locale, namespace: "admin" });

  const audience = isAudience(searchParams.audience)
    ? searchParams.audience
    : "executive";
  const reportLocale = (locales as readonly string[]).includes(
    searchParams.reportLocale ?? "",
  )
    ? searchParams.reportLocale!
    : locale;
  const period = resolvePeriod(searchParams);

  const [data, rules, lastSend] = await Promise.all([
    getReportData({ period, locale: reportLocale, audience }),
    getAlertRules(),
    safeQuery(
      "reports:lastSend",
      () =>
        prisma.reportSend.findFirst({
          orderBy: { sentAt: "desc" },
          select: { sentAt: true, ok: true, error: true },
        }),
      null,
    ),
  ]);

  const draft = await draftNoteText(reportLocale, data);

  const offline = isDatabaseOffline();
  const recipients = reportRecipients();

  // Formatted here rather than in the components: this page owns the
  // locale, and a date formatted in two places eventually disagrees.
  const monthFormat = new Intl.DateTimeFormat(intlLocale(reportLocale), {
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
  const sentFormat = new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  const periodIso = period.noteKey.toISOString();

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4 print:hidden">
        <div>
          <p className="admin-section-title">{t("nav.reports")}</p>
          <h1 className="mt-2 flex items-center gap-2.5 text-2xl font-semibold text-primary sm:text-3xl">
            <FileText
              size={22}
              strokeWidth={1.75}
              className="text-accent-700"
              aria-hidden
            />
            {t("reports.title")}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-muted">
            {t("reports.subtitle")}
          </p>
        </div>
      </header>

      {offline && (
        <p className="rounded-xs border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 print:hidden">
          {t("common.offline")}
        </p>
      )}

      <ReportControls
        audience={audience}
        period={period.kind}
        reportLocale={reportLocale}
        locales={locales}
        exportBase={`/api/admin/reports/export`}
        labels={{
          audience: t("reports.controls.audience"),
          audienceExecutive: t("reports.audience.executive"),
          audienceExecutiveHint: t("reports.controls.executiveHint"),
          audienceMarketing: t("reports.audience.marketing"),
          audienceMarketingHint: t("reports.controls.marketingHint"),
          audienceEngineering: t("reports.audience.engineering"),
          audienceEngineeringHint: t("reports.controls.engineeringHint"),
          period: t("reports.controls.period"),
          periodLastMonth: t("reports.controls.lastMonth"),
          periodThisMonth: t("reports.controls.thisMonth"),
          periodLastQuarter: t("reports.controls.lastQuarter"),
          language: t("reports.controls.language"),
          print: t("reports.controls.print"),
          csv: t("reports.controls.csv"),
          excel: t("reports.controls.excel"),
        }}
      />

      <ReportView
        data={data}
        audienceLabel={t(`reports.audience.${audience}` as never)}
        noteBody={data.note.body.trim() === "" ? draft : data.note.body}
        formatted={{
          periodLabel: monthFormat.format(period.start),
          coversUntil: dayFormat.format(data.coversUntil),
          countedSince: data.countedSince
            ? dayFormat.format(data.countedSince)
            : null,
        }}
        labels={{
          title: t("reports.view.title"),
          audienceLabel: t("reports.controls.audience"),
          dataUpTo: t("reports.view.dataUpTo"),
          headlineTitle: t("reports.view.headlineTitle"),
          googleClicks: t("reports.view.googleClicks"),
          googleLeads: t("reports.view.googleLeads"),
          allLeads: t("reports.view.allLeads"),
          auditScore: t("reports.view.auditScore"),
          notConnected: t("reports.view.notConnected"),
          noGoogleData: t("reports.view.noGoogleData"),
          tableTitle: t("reports.view.tableTitle"),
          columnProject: t("reports.view.columnProject"),
          columnClicks: t("reports.view.columnClicks"),
          columnGoogleLeads: t("reports.view.columnGoogleLeads"),
          columnRate: t("reports.view.columnRate"),
          columnAllLeads: t("reports.view.columnAllLeads"),
          newsRow: t("reports.view.newsRow"),
          tableEmpty: t("reports.view.tableEmpty"),
          footnote: t("reports.view.footnote"),
          countedSince: t("reports.view.countedSince"),
          countedSinceUnknown: t("reports.view.countedSinceUnknown"),
          vitalsTitle: t("reports.view.vitalsTitle"),
          vitalsNotEnough: t("reports.view.vitalsNotEnough"),
          notesTitle: t("reports.view.notesTitle"),
          notesDraft: t("reports.view.notesDraft"),
          notesEditedBy: t("reports.view.notesEditedBy"),
          notesEmpty: t("reports.view.notesEmpty"),
        }}
      />

      <ReportNoteEditor
        action={saveReportNote.bind(
          null,
          locale,
          periodIso,
          audience,
          reportLocale,
        )}
        body={data.note.body}
        draft={draft}
        isDraft={data.note.isDraft}
        editedBy={data.note.editedBy}
        labels={{
          title: t("reports.note.title"),
          hint: t("reports.note.hint"),
          draftBadge: t("reports.view.notesDraft"),
          editedBy: t("reports.view.notesEditedBy"),
          save: t("reports.note.save"),
          saving: t("reports.note.saving"),
          saved: t("reports.note.saved"),
          failed: t("reports.note.failed"),
          tooLong: t("reports.note.tooLong"),
          useDraft: t("reports.note.useDraft"),
        }}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <ReportScheduleCard
          action={sendTestReport.bind(
            null,
            locale,
            periodIso,
            audience,
            reportLocale,
          )}
          recipients={recipients}
          emailConfigured={isEmailConfigured()}
          noteIsDraft={data.note.isDraft}
          lastSent={
            lastSend
              ? {
                  at: sentFormat.format(lastSend.sentAt),
                  ok: lastSend.ok,
                  error: lastSend.error,
                }
              : null
          }
          labels={{
            title: t("reports.schedule.title"),
            hint: t("reports.schedule.hint"),
            recipients: t("reports.schedule.recipients"),
            noRecipients: t("reports.schedule.noRecipients"),
            notConfigured: t("reports.schedule.notConfigured"),
            lastSent: t("reports.schedule.lastSent"),
            neverSent: t("reports.schedule.neverSent"),
            succeeded: t("reports.schedule.succeeded"),
            failed: t("reports.schedule.failed"),
            sendTest: t("reports.schedule.sendTest"),
            sending: t("reports.schedule.sending"),
            sentOk: t("reports.schedule.sentOk"),
            draftWarning: t("reports.schedule.draftWarning"),
            noScheduler: t("reports.schedule.noScheduler"),
          }}
        />

        <AlertRulesCard
          action={toggleAlertRule.bind(null, locale)}
          rules={ALERT_KINDS.map((kind) => ({
            kind,
            label: t(`reports.alerts.${kind}.label` as never),
            /*
              Spelled out per rule rather than through one interpolated
              key. Each rule's sentence takes a different placeholder, and
              a template-literal key collapses to a union that the
              translator types as taking no values at all — so the numbers
              silently would not have been substituted.
            */
            detail: alertDetail(kind, t),
            enabled: rules[kind],
            awaitingGoogle: ALERTS_AWAITING_GOOGLE.includes(kind),
          }))}
          labels={{
            title: t("reports.alerts.title"),
            hint: t("reports.alerts.hint"),
            awaitingGoogle: t("reports.alerts.awaitingGoogle"),
            failed: t("reports.alerts.failed"),
          }}
        />
      </div>
    </div>
  );
}

/** The threshold sentence beside each rule, read from the same constants
 *  lib/seo/alert-rules.ts applies — the screen cannot show one number and
 *  the rule use another. */
function alertDetail(
  kind: (typeof ALERT_KINDS)[number],
  t: Awaited<ReturnType<typeof getTranslations<"admin">>>,
): string {
  switch (kind) {
    case "INDEX_DROP":
      return t("reports.alerts.INDEX_DROP.detail", {
        urls: ALERT_THRESHOLDS.indexDropUrls,
      });
    case "NOT_FOUND_SPIKE":
      return t("reports.alerts.NOT_FOUND_SPIKE.detail", {
        hits: ALERT_THRESHOLDS.notFoundHitsPerPath,
      });
    case "VITALS_REGRESSION":
      return t("reports.alerts.VITALS_REGRESSION.detail", {
        hours: ALERT_THRESHOLDS.vitalsWindowHours,
      });
    case "CLICKS_DROP":
      return t("reports.alerts.CLICKS_DROP.detail", {
        percent: ALERT_THRESHOLDS.clicksDropPercent,
      });
    case "CRON_FAILED":
      return t("reports.alerts.CRON_FAILED.detail");
  }
}

/** Rebuilt on every visit: the figures move whenever a cron run lands, and
 *  a cached report is a report somebody sends with last week's numbers. */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin" });
  return { title: t("reports.title") };
}
