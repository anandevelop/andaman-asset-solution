/**
 * app/[locale]/admin/(growth)/seo/audit/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The on-page audit: every public URL, what each one is failing, and a way
 * to act on it.
 *
 * Reads the last run rather than auditing on load. An audit fetches every
 * page on the site — see lib/seo/run-audit.ts — which is a job, not
 * something to do because somebody opened a tab.
 *
 * THE FOUR STATES
 *
 * Never run (no SeoAuditRun rows at all — different from "ran and found
 * nothing"), stale (the nightly job has missed a night), offline, and data.
 * The first is the state this screen is in until somebody wires a
 * scheduler, so it says what to do rather than showing an empty table.
 *
 * Clicking a rule filters the table to the URLs failing it, through the URL
 * (?rule=) rather than client state: the filtered view is then a link
 * somebody can send, and the CSV below it exports what is on screen.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Role } from "@prisma/client";
import { AlertTriangle, Clock, DatabaseZap } from "lucide-react";
import { requireAdmin } from "@/lib/admin/guard";
import { isDatabaseOffline } from "@/lib/db";
import { toCsv, csvFilename } from "@/lib/csv";
import { getAuditOverview, getAuditUrls, auditCsvRows } from "@/lib/seo/audit-report";
import { findRule } from "@/lib/seo/rules";
import SeoAuditTable from "@/components/admin/SeoAuditTable";
import { waiveRule, removeWaiver } from "./actions";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ rule?: string }>;
};

export default async function SeoAuditPage(props: Props) {
  const { locale } = await props.params;
  const { rule } = await props.searchParams;

  await requireAdmin(locale, Role.ADMIN);
  const t = await getTranslations({ locale, namespace: "admin" });

  // A rule key from the query string is not trusted into a database
  // filter — an unknown one filters by nothing rather than returning a
  // confidently empty table.
  const ruleKey = rule && findRule(rule) ? rule : undefined;

  const [overview, rows] = await Promise.all([
    getAuditOverview(),
    getAuditUrls({ locale, ruleKey }),
  ]);

  const offline = isDatabaseOffline();
  const ruleName = (key: string) => t(`seo.audit.rules.${key}` as never);

  const csv = toCsv(
    [
      t("seo.audit.csv.url"),
      t("seo.audit.csv.locale"),
      t("seo.audit.csv.score"),
      t("seo.audit.csv.rule"),
      t("seo.audit.csv.editUrl"),
    ],
    auditCsvRows(rows),
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="admin-label mb-0">{t("seo.audit.title")}</h2>
        <p className="admin-hint">{t("seo.audit.subtitle")}</p>
      </div>

      {offline && (
        <p className="flex items-center gap-2 rounded-xs border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <DatabaseZap size={16} className="shrink-0" aria-hidden />
          {t("seo.audit.offline")}
        </p>
      )}

      {!offline && !overview.latest && (
        <div className="admin-card">
          <p className="flex items-center gap-2 text-sm text-ink">
            <Clock size={16} className="shrink-0 text-ink-muted" aria-hidden />
            {t("seo.audit.neverRun")}
          </p>
          <p className="admin-hint mt-1">{t("seo.audit.neverRunHint")}</p>
        </div>
      )}

      {overview.stale && (
        <p className="flex items-center gap-2 rounded-xs border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle size={16} className="shrink-0" aria-hidden />
          {t("seo.audit.stale", { when: overview.latest?.at.toISOString().slice(0, 10) ?? "" })}
        </p>
      )}

      {overview.latest && (
        <section className="admin-card">
          <h3 className="admin-label">{t("seo.audit.rulesTitle")}</h3>
          <p className="admin-hint">{t("seo.audit.rulesHint")}</p>

          <ul className="mt-3 divide-y divide-primary/5">
            {overview.rules.map((entry) => {
              const active = ruleKey === entry.key;
              return (
                <li key={entry.key}>
                  <Link
                    href={active ? "./audit" : `./audit?rule=${entry.key}`}
                    className={`flex items-center gap-3 px-1 py-2 text-sm transition-colors ${
                      active ? "bg-primary/5 text-primary" : "text-ink hover:bg-primary/5"
                    }`}
                  >
                    <span
                      className={`w-14 shrink-0 rounded-full px-2 py-0.5 text-center text-[11px] ${severityTone(entry.severity)}`}
                    >
                      {t(`seo.audit.severity.${entry.severity}` as never)}
                    </span>
                    <span className="flex-1">{ruleName(entry.key)}</span>
                    <span
                      className={`shrink-0 tabular-nums ${entry.count > 0 ? "text-ink" : "text-emerald-700"}`}
                    >
                      {entry.count > 0 ? entry.count : "✓"}
                    </span>
                    <span className="w-12 shrink-0 text-right text-xs text-ink-muted">
                      {t("seo.audit.weight", { weight: entry.weight })}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {ruleKey && (
        <p className="text-sm text-ink-muted">
          {t("seo.audit.filteredBy", { rule: ruleName(ruleKey) })}{" "}
          <Link href="./audit" className="underline">
            {t("seo.audit.clearFilter")}
          </Link>
        </p>
      )}

      <SeoAuditTable
        rows={rows.map((row) => ({
          url: row.url,
          locale: row.locale,
          score: row.score,
          checkedWeight: row.checkedWeight,
          failedRules: row.failedRules,
          waivedRules: row.waivedRules,
          editHref: row.editHref,
        }))}
        csv={csv}
        csvFilename={csvFilename("seo-audit")}
        onWaive={waiveRule.bind(null, locale)}
        onRemoveWaiver={removeWaiver.bind(null, locale)}
        labels={{
          urlHeader: t("seo.audit.urlHeader"),
          scoreHeader: t("seo.audit.scoreHeader"),
          issuesHeader: t("seo.audit.issuesHeader"),
          actionsHeader: t("seo.audit.actionsHeader"),
          notChecked: t("seo.audit.notChecked"),
          edit: t("seo.audit.edit"),
          waive: t("seo.audit.waive"),
          unwaive: t("seo.audit.unwaive"),
          waived: t("seo.audit.waived"),
          waiveTitle: (name: string) => t("seo.audit.waiveTitle", { rule: name }),
          waiveHint: t("seo.audit.waiveHint"),
          reasonLabel: t("seo.audit.reasonLabel"),
          reasonPlaceholder: t("seo.audit.reasonPlaceholder"),
          save: t("seo.audit.save"),
          cancel: t("common.cancel"),
          failed: t("seo.audit.waiveFailed"),
          exportCsv: t("seo.audit.exportCsv"),
          empty: t("seo.audit.empty"),
          clean: t("seo.audit.clean"),
          ruleName,
        }}
      />
    </div>
  );
}

function severityTone(severity: string): string {
  if (severity === "critical") return "bg-red-50 text-red-800";
  if (severity === "warning") return "bg-amber-50 text-amber-800";
  return "bg-ink/5 text-ink-muted";
}
