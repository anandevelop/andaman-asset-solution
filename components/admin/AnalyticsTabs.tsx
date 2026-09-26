"use client";

/**
 * components/admin/AnalyticsTabs.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The three views of /admin/analytics — Traffic, Content, Leads — one
 * client component switching between pre-computed props, same pattern as
 * UrlRedirectManager.tsx's three tabs. Every number arrives already
 * aggregated and formatted from the server; this component draws them and
 * does no arithmetic of its own.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";
import { MonthlyLeadsChart, LeadSourceChart, TrendChart, type MonthlyPoint, type SourcePoint, type TrendPoint } from "./DashboardCharts";
import RealtimePanel, { type RealtimeLabels } from "./RealtimePanel";
import VitalsPanel, {
  type VitalsLabels,
  type VitalFigureView,
  type VitalsRouteView,
} from "./VitalsPanel";
import type { LiveSnapshotDto } from "@/lib/analytics/live-visit";

type Tab = "traffic" | "content" | "leads" | "realtime" | "vitals";

export type TopArticle = { id: string; title: string; views30: number; leads: number };
export type ContentConversionRow = {
  projectId: string;
  name: string;
  total: number;
  worked: number;
  won: number;
  rate: number | null;
};
export type FunnelStage = { status: string; label: string; count: number; isBottleneck: boolean };

/** One event's RSVP fill, already formatted — see the page's comment on
 *  why the seat count and the date arrive as strings. */
export type EventRsvpRow = {
  eventId: string;
  title: string;
  /** ISO, for <time dateTime>; `dateLabel` is what gets rendered. */
  startsAt: string;
  dateLabel: string;
  fillRate: number | null;
  seatsLabel: string;
};

type Props = {
  locale: string;
  canViewLeads: boolean;

  traffic: {
    trend: TrendPoint[];
    totalViews: number;
    countingSince: string | null;
    gaConfigured: boolean;
    metaPixelConfigured: boolean;
    searchConsoleConfigured: boolean;
    /* Consent sits on the Traffic tab because it is the ceiling on
       everything else on it: the GA4 and Meta Pixel tiles above say the
       tags are configured, and this says what share of visitors let them
       fire at all. */
    cookieConsent: { total: number; analyticsRate: number | null; marketingRate: number | null };
  };

  content: {
    topArticles: TopArticle[];
    conversions: ContentConversionRow[];
    eventRsvp: EventRsvpRow[];
    companyStats: {
      foundedYear: number | null;
      projectsDelivered: number;
      awards: number;
      villasUnderConstruction: number;
    };
  };

  leads: {
    monthly: MonthlyPoint[];
    bySource: SourcePoint[];
    funnel: FunnelStage[];
    maxFunnelCount: number;
    weekOverWeek: { thisWeek: number; lastWeek: number; changePercent: number | null };
  };

  labels: Record<string, string>;

  /* §3's realtime tab. Passed in rather than imported so this component
     keeps doing no data-fetching of its own — the action is a server
     action and this file is "use client". */
  realtime: { labels: RealtimeLabels; fetchSnapshot: () => Promise<LiveSnapshotDto> };

  /* §2's Core Web Vitals. Every figure arrives computed — this component
     does no arithmetic, and a p75 is never calculated at page load. */
  vitals: {
    labels: VitalsLabels;
    overall: { device: string; figures: VitalFigureView[] }[];
    routes: VitalsRouteView[];
    deploys: { day: string; commitSha: string }[];
    empty: boolean;
  };
};

export default function AnalyticsTabs({ locale, canViewLeads, traffic, content, leads, labels, realtime, vitals }: Props) {
  const [tab, setTab] = useState<Tab>("traffic");

  /* Realtime first: it is the only tab that answers a question about right
     now, and the one somebody opens this screen to glance at. */
  const TABS: Tab[] = canViewLeads
    ? ["realtime", "vitals", "traffic", "content", "leads"]
    : ["realtime", "vitals", "traffic", "content"];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-1 rounded-xs border border-primary/10 bg-white p-1">
        {TABS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            aria-pressed={tab === key}
            className={[
              "rounded-xs px-3.5 py-2 text-sm transition-colors",
              tab === key ? "bg-primary font-semibold text-white" : "text-ink-muted hover:text-primary",
            ].join(" ")}
          >
            {labels[`tab_${key}`]}
          </button>
        ))}
      </div>

      {tab === "realtime" && (
        <RealtimePanel labels={realtime.labels} fetchSnapshot={realtime.fetchSnapshot} />
      )}

      {tab === "vitals" && (
        <VitalsPanel
          labels={vitals.labels}
          overall={vitals.overall}
          routes={vitals.routes}
          deploys={vitals.deploys}
          empty={vitals.empty}
        />
      )}

      {tab === "traffic" && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="admin-card">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                {labels.totalViews}
              </p>
              <p className="mt-4 text-3xl font-semibold tabular-nums text-primary">
                {traffic.totalViews.toLocaleString()}
              </p>
              <p className="mt-1 text-xs text-ink-muted">{labels.totalViewsHint}</p>
            </div>

            {(
              [
                ["gaConfigured", labels.gaLabel],
                ["metaPixelConfigured", labels.metaPixelLabel],
                ["searchConsoleConfigured", labels.searchConsoleLabel],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="admin-card">
                <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</p>
                <p className="mt-4 flex items-center gap-2">
                  {traffic[key] ? (
                    <>
                      <CheckCircle2 size={18} className="text-emerald-600" aria-hidden />
                      <span className="text-sm font-medium text-emerald-700">{labels.configured}</span>
                    </>
                  ) : (
                    <>
                      <XCircle size={18} className="text-ink-muted" aria-hidden />
                      <span className="text-sm text-ink-muted">{labels.notConfigured}</span>
                    </>
                  )}
                </p>
              </div>
            ))}
          </div>

          <section className="admin-card">
            <h2 className="text-base font-semibold text-primary">{labels.trendTitle}</h2>
            <p className="mb-5 mt-1 text-sm text-ink-muted">{labels.trendSubtitle}</p>
            <TrendChart data={traffic.trend} labels={{ count: labels.views, empty: labels.empty }} />
          </section>

          <section className="admin-card">
            <h2 className="text-base font-semibold text-primary">{labels.cookieConsentTitle}</h2>
            <p className="mb-5 mt-1 text-sm text-ink-muted">{labels.cookieConsentSubtitle}</p>

            {traffic.cookieConsent.total === 0 ? (
              <p className="py-6 text-center text-sm text-ink-muted">{labels.empty}</p>
            ) : (
              <div className="space-y-5">
                <RateRow label={labels.cookieConsentAnalytics} rate={traffic.cookieConsent.analyticsRate} />
                <RateRow label={labels.cookieConsentMarketing} rate={traffic.cookieConsent.marketingRate} />
              </div>
            )}
          </section>
        </div>
      )}

      {tab === "content" && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile label={labels.projectsDelivered} value={content.companyStats.projectsDelivered} />
            <StatTile label={labels.awardsWon} value={content.companyStats.awards} />
            <StatTile label={labels.villasInBuild} value={content.companyStats.villasUnderConstruction} />
            <StatTile
              label={labels.foundedYear}
              value={content.companyStats.foundedYear ?? "—"}
            />
          </div>

          <section className="admin-card overflow-hidden p-0!">
            <div className="border-b border-primary/10 px-5 py-3.5">
              <h2 className="text-sm font-semibold text-primary">{labels.topArticlesTitle}</h2>
            </div>
            {content.topArticles.length === 0 ? (
              <p className="py-10 text-center text-sm text-ink-muted">{labels.empty}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] border-collapse">
                  <thead>
                    <tr className="border-b border-primary/10 bg-surface-muted">
                      <th className="admin-th">{labels.article}</th>
                      <th className="admin-th text-right">{labels.views30}</th>
                      <th className="admin-th text-right">{labels.leadsFromArticle}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {content.topArticles.map((row) => (
                      <tr key={row.id} className="border-b border-primary/5 text-sm last:border-b-0">
                        <td className="admin-td font-medium text-ink">
                          <Link
                            href={`/${locale}/admin/news/${row.id}/edit`}
                            className="hover:text-accent-700 hover:underline"
                          >
                            {row.title}
                          </Link>
                        </td>
                        <td className="admin-td text-right tabular-nums">{row.views30.toLocaleString()}</td>
                        <td className="admin-td text-right tabular-nums">{row.leads.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="admin-card overflow-hidden p-0!">
            <div className="border-b border-primary/10 px-5 py-3.5">
              <h2 className="text-sm font-semibold text-primary">{labels.conversionTitle}</h2>
              <p className="mt-1 text-xs text-ink-muted">{labels.conversionSubtitle}</p>
            </div>
            {content.conversions.length === 0 ? (
              <p className="py-10 text-center text-sm text-ink-muted">{labels.empty}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse">
                  <thead>
                    <tr className="border-b border-primary/10 bg-surface-muted">
                      <th className="admin-th">{labels.project}</th>
                      <th className="admin-th text-right">{labels.total}</th>
                      <th className="admin-th text-right">{labels.worked}</th>
                      <th className="admin-th text-right">{labels.won}</th>
                      <th className="admin-th text-right">{labels.rate}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {content.conversions.map((row) => (
                      <tr key={row.projectId} className="border-b border-primary/5 text-sm last:border-b-0">
                        <td className="admin-td font-medium text-ink">{row.name}</td>
                        <td className="admin-td text-right tabular-nums">{row.total}</td>
                        <td className="admin-td text-right tabular-nums">{row.worked}</td>
                        <td className="admin-td text-right tabular-nums">{row.won}</td>
                        <td className="admin-td text-right">
                          {row.rate === null ? (
                            <span className="text-xs text-ink-muted">{labels.notWorked}</span>
                          ) : (
                            <span className="text-sm font-medium tabular-nums text-primary">{row.rate}%</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="admin-card">
            <h2 className="text-base font-semibold text-primary">{labels.rsvpTitle}</h2>
            <p className="mb-5 mt-1 text-sm text-ink-muted">{labels.rsvpSubtitle}</p>

            {content.eventRsvp.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-muted">{labels.empty}</p>
            ) : (
              <ul className="divide-y divide-primary/5">
                {content.eventRsvp.map((event) => (
                  <li key={event.eventId} className="py-3.5 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <p className="truncate text-sm font-medium text-ink">{event.title}</p>
                      <time dateTime={event.startsAt} className="shrink-0 text-xs text-ink-muted">
                        {event.dateLabel}
                      </time>
                    </div>
                    <div className="mt-2 flex items-center gap-3">
                      <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-primary/5">
                        {event.fillRate !== null && (
                          <span
                            className="absolute inset-y-0 left-0 rounded-full bg-accent-700"
                            style={{ width: `${Math.min(100, event.fillRate)}%` }}
                          />
                        )}
                      </span>
                      <span className="shrink-0 text-xs font-medium tabular-nums text-ink-muted">
                        {event.seatsLabel}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {tab === "leads" && canViewLeads && (
        <div className="space-y-6">
          <div className="admin-card">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
              {labels.weekOverWeek}
            </p>
            <p className="mt-4 flex items-baseline gap-2">
              <span className="text-3xl font-semibold tabular-nums text-primary">
                {leads.weekOverWeek.thisWeek}
              </span>
              {leads.weekOverWeek.changePercent !== null && (
                <span
                  className={`text-sm font-medium tabular-nums ${
                    leads.weekOverWeek.changePercent >= 0 ? "text-emerald-700" : "text-red-600"
                  }`}
                >
                  {leads.weekOverWeek.changePercent >= 0 ? "+" : ""}
                  {leads.weekOverWeek.changePercent}%
                </span>
              )}
            </p>
            <p className="mt-1 text-xs text-ink-muted">
              {labels.weekOverWeekHint}
            </p>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.85fr_1fr]">
            <section className="admin-card">
              <h2 className="text-base font-semibold text-primary">{labels.monthlyTitle}</h2>
              <p className="mt-1 text-sm text-ink-muted">{labels.monthlySubtitle}</p>
              <div className="mt-5">
                <MonthlyLeadsChart
                  data={leads.monthly}
                  labels={{ total: labels.total, won: labels.won, empty: labels.empty }}
                />
              </div>
            </section>

            <section className="admin-card">
              <h2 className="text-base font-semibold text-primary">{labels.sourcesTitle}</h2>
              <p className="mt-1 text-sm text-ink-muted">{labels.sourcesSubtitle}</p>
              <div className="mt-5">
                <LeadSourceChart data={leads.bySource} emptyLabel={labels.empty} />
              </div>
            </section>
          </div>

          <section className="admin-card">
            <h2 className="text-base font-semibold text-primary">{labels.pipelineTitle}</h2>
            <p className="mt-1 text-sm text-ink-muted">{labels.pipelineSubtitle}</p>
            {leads.funnel.every((stage) => stage.count === 0) ? (
              <p className="py-6 text-center text-sm text-ink-muted">{labels.empty}</p>
            ) : (
              <ul className="mt-5 space-y-3.5">
                {leads.funnel.map((stage) => (
                  <li key={stage.status} className="flex items-center gap-3">
                    <span className="w-32 shrink-0 text-xs font-medium text-ink-muted sm:w-40">
                      {stage.label}
                    </span>
                    <span className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-primary/5">
                      <span
                        className="absolute inset-y-0 left-0 rounded-full bg-accent-700"
                        style={{ width: `${Math.round((stage.count / leads.maxFunnelCount) * 100)}%` }}
                      />
                    </span>
                    <span className="w-8 shrink-0 text-right text-sm font-medium tabular-nums text-primary">
                      {stage.count}
                    </span>
                    {stage.isBottleneck && (
                      <span className="shrink-0 text-[10.5px] font-semibold uppercase tracking-wide text-red-600">
                        {labels.bottleneck}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="admin-card">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="mt-4 text-3xl font-semibold tabular-nums text-primary">{value}</p>
    </div>
  );
}

/**
 * A labelled percentage with a proportional bar — the cookie-consent
 * card's two rows.
 *
 * `rate` is only null when there are no decisions on record at all, which
 * the caller already handles by not rendering this component in that case
 * (getCookieConsentStats() guards the divide). `?? 0` is keeping
 * TypeScript happy, not a real fallback path.
 */
function RateRow({ label, rate }: { label: string; rate: number | null }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-ink-muted">{label}</span>
        <span className="font-medium tabular-nums text-primary">{rate ?? 0}%</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-primary/5">
        <div className="h-full rounded-full bg-accent-700" style={{ width: `${rate ?? 0}%` }} />
      </div>
    </div>
  );
}
