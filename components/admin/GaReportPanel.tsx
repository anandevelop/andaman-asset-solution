"use client";

/**
 * components/admin/GaReportPanel.tsx — the "Google Analytics" tab of
 * /admin/analytics: GA4's own totals and top lists for the range in the
 * header, with the previous period beside each number when "เทียบช่วง
 * ก่อนหน้า" is on. Data from lib/analytics/ga4-report.ts via a server
 * action, fetched when the tab opens.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { fetchGa4Report } from "@/app/[locale]/admin/(growth)/analytics/search-actions";
import type { Ga4Report, Row } from "@/lib/analytics/ga4-report";
import { intlLocale } from "@/lib/format";

export type GaPanelLabels = Record<string, string>;

function delta(current: number, previous: number | undefined | null): number | null {
  if (previous === undefined || previous === null || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export default function GaReportPanel({
  locale,
  range,
  compare,
  labels,
}: {
  locale: string;
  range: string;
  compare: boolean;
  labels: GaPanelLabels;
}) {
  const [data, setData] = useState<Ga4Report | null>(null);
  const fmt = new Intl.NumberFormat(intlLocale(locale));

  useEffect(() => {
    let cancelled = false;
    fetchGa4Report(range, compare)
      .then((result) => !cancelled && setData(result))
      .catch((error) => !cancelled && setData({ ok: false, reason: "FAILED", detail: String(error) }));
    return () => {
      cancelled = true;
    };
  }, [range, compare]);

  if (!data) {
    return (
      <section className="admin-card flex items-center gap-2 text-sm text-adm-muted">
        <Loader2 size={15} className="animate-spin" aria-hidden />
        {labels.loading}
      </section>
    );
  }

  if (!data.ok) {
    return (
      <section className="admin-card space-y-2">
        <p className="text-sm font-medium text-adm-text">{labels[`state_${data.reason}`]}</p>
        {data.serviceAccount && (
          <p className="text-xs text-adm-muted">
            {labels.addViewer} <code className="text-adm-text">{data.serviceAccount}</code>
          </p>
        )}
        {data.detail && <p className="text-xs text-adm-muted">{data.detail}</p>}
        <Link href={`/${locale}/admin/settings/integrations`} className="admin-btn-ghost admin-btn-sm w-fit">
          {labels.toSettings}
        </Link>
      </section>
    );
  }

  const kpis: { key: string; value: string; change: number | null }[] = [
    { key: "users", value: fmt.format(data.totals.users), change: delta(data.totals.users, data.previous?.users) },
    { key: "sessions", value: fmt.format(data.totals.sessions), change: delta(data.totals.sessions, data.previous?.sessions) },
    { key: "views", value: fmt.format(data.totals.views), change: delta(data.totals.views, data.previous?.views) },
    {
      key: "engagement",
      value: `${Math.round(data.totals.engagementRate * 100)}%`,
      change: delta(data.totals.engagementRate, data.previous?.engagementRate),
    },
    {
      key: "duration",
      value: `${Math.floor(data.totals.avgSessionSec / 60)}:${String(Math.round(data.totals.avgSessionSec % 60)).padStart(2, "0")}`,
      change: delta(data.totals.avgSessionSec, data.previous?.avgSessionSec),
    },
  ];
  const maxDaily = Math.max(1, ...data.daily.map((d) => d.users));

  const table = (title: string, rows: Row[]) => (
    <section className="admin-card p-0!">
      <h3 className="border-b border-adm-line px-5 py-3 text-sm font-semibold text-adm-text">{title}</h3>
      {rows.length === 0 ? (
        <p className="px-5 py-6 text-center text-sm text-adm-muted">{labels.empty}</p>
      ) : (
        <ul>
          {rows.map((row) => {
            const change = delta(row.value, row.previous);
            return (
              <li key={row.key} className="flex items-center justify-between gap-3 border-b border-adm-line px-5 py-2.5 text-sm last:border-b-0">
                <span className="min-w-0 truncate text-adm-text">{row.key}</span>
                <span className="shrink-0 tabular-nums text-adm-text">
                  {fmt.format(row.value)}
                  {compare && change !== null && (
                    <span className={`ml-2 text-xs ${change >= 0 ? "text-adm-success" : "text-adm-danger"}`}>
                      {change >= 0 ? "+" : ""}
                      {change}%
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {kpis.map((kpi) => (
          <div key={kpi.key} className="admin-card py-4!">
            <p className="text-xs text-adm-muted">{labels[`kpi_${kpi.key}`]}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-adm-text">{kpi.value}</p>
            {compare && (
              <p className={`text-xs ${kpi.change === null ? "text-adm-muted" : kpi.change >= 0 ? "text-adm-success" : "text-adm-danger"}`}>
                {kpi.change === null ? labels.noPrevious : `${kpi.change >= 0 ? "+" : ""}${kpi.change}% ${labels.vsPrevious}`}
              </p>
            )}
          </div>
        ))}
      </div>

      {data.daily.length > 0 && (
        <section className="admin-card">
          <h3 className="text-sm font-semibold text-adm-text">{labels.dailyTitle}</h3>
          <div className="mt-4 flex h-32 items-end gap-1">
            {data.daily.map((point) => (
              <div
                key={point.date}
                title={`${point.date}: ${point.users}`}
                className="flex-1 rounded-t-xs bg-adm-fill/80"
                style={{ height: `${Math.max(2, (point.users / maxDaily) * 100)}%` }}
              />
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {table(labels.topPages, data.pages)}
        {table(labels.channels, data.channels)}
        {table(labels.countries, data.countries)}
        {table(labels.devices, data.devices)}
      </div>

      <p className="text-xs text-adm-muted">
        GA4 · {data.propertyId} · {labels.updated} {new Date(data.fetchedAt).toLocaleTimeString(intlLocale(locale))}
      </p>
    </div>
  );
}
