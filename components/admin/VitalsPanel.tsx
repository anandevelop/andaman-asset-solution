"use client";

/**
 * components/admin/VitalsPanel.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Core Web Vitals from real visits — the analytics hub's fourth view.
 *
 * STATUS IS A WORD, NOT A COLOUR
 *
 * "Good / needs work / poor" is written out next to every figure, and the
 * colour is the second signal rather than the only one. About one man in
 * twelve cannot reliably tell the red dot from the green one, and this is
 * a screen whose entire job is to say which pages are bad.
 *
 * TOO FEW SAMPLES IS NOT A NUMBER
 *
 * A p75 over a few dozen visits moves every day, and somebody will act on
 * the movement. Below 200 samples in the window the figure is replaced by
 * "not enough data yet" and the count — which is a fact, where the p75
 * would have been a guess with a colour on it.
 *
 * WHERE THE SAMPLE COMES FROM
 *
 * Only visitors who accepted the analytics cookie, and the panel says so
 * with the actual percentage rather than a disclaimer under the fold. A
 * number covering 40% of traffic is still useful; believing it covers all
 * of it is not.
 *
 * Every figure arrives computed — this component does no arithmetic, the
 * same rule AnalyticsTabs already follows.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { GitCommitHorizontal, Info } from "lucide-react";

export type VitalFigureView = {
  metric: string;
  /** Already formatted with its unit: "2.4 s", "0.08". */
  display: string;
  rating: "good" | "needsImprovement" | "poor";
  /** Already worded: "1,204 samples". A count plus a formatter would mean a
   *  function in this component's props, which a Server Component cannot
   *  pass — see the note above toFigureView in the analytics page. */
  samples: string;
  enoughSamples: boolean;
};

export type VitalsRouteView = {
  path: string;
  device: string;
  figures: VitalFigureView[];
};

export type VitalsLabels = {
  title: string;
  subtitle: string;
  empty: string;
  emptyHint: string;
  /** The consent-coverage sentence, already carrying its percentage — or
   *  the "not enough page views to say" wording when there is none. */
  coverage: string;
  ratings: { good: string; needsImprovement: string; poor: string };
  notEnough: string;
  devices: { mobile: string; desktop: string };
  routesTitle: string;
  routesHint: string;
  pageHeader: string;
  deploysTitle: string;
  deploysHint: string;
  metricHints: Record<string, string>;
};

type Props = {
  labels: VitalsLabels;
  overall: { device: string; figures: VitalFigureView[] }[];
  routes: VitalsRouteView[];
  deploys: { day: string; commitSha: string }[];
  empty: boolean;
};

export default function VitalsPanel({ labels, overall, routes, deploys, empty }: Props) {
  if (empty) {
    return (
      <div className="admin-card">
        <p className="text-sm text-ink">{labels.empty}</p>
        <p className="admin-hint mt-1">{labels.emptyHint}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="admin-label mb-0">{labels.title}</h3>
        <p className="admin-hint">{labels.subtitle}</p>
      </div>

      <p className="flex items-start gap-2 rounded-xs border border-primary/10 bg-primary/5 px-3 py-2 text-xs text-ink-muted">
        <Info size={14} className="mt-0.5 shrink-0" aria-hidden />
        {labels.coverage}
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        {overall.map((group) => (
          <div key={group.device} className="admin-card">
            <h4 className="admin-label">
              {labels.devices[group.device as "mobile" | "desktop"] ?? group.device}
            </h4>

            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              {group.figures.map((figure) => (
                <div key={figure.metric} className="rounded-xs border border-primary/10 px-3 py-2.5">
                  <dt className="flex items-baseline justify-between gap-2">
                    <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                      {figure.metric}
                    </span>
                    {figure.enoughSamples && (
                      <span className={`text-[11px] ${ratingTone(figure.rating)}`}>
                        {labels.ratings[figure.rating]}
                      </span>
                    )}
                  </dt>
                  <dd className="mt-1">
                    {figure.enoughSamples ? (
                      <span className={`text-2xl font-semibold tabular-nums ${ratingTone(figure.rating)}`}>
                        {figure.display}
                      </span>
                    ) : (
                      <span className="text-xs text-ink-muted">{labels.notEnough}</span>
                    )}
                  </dd>
                  <p className="mt-1 text-[11px] text-ink-muted">{figure.samples}</p>
                  <p className="mt-1 text-[11px] text-ink-muted">
                    {labels.metricHints[figure.metric]}
                  </p>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>

      <section className="admin-card overflow-x-auto">
        <h4 className="admin-label">{labels.routesTitle}</h4>
        <p className="admin-hint">{labels.routesHint}</p>

        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-ink-muted">
              <th className="pb-2 font-medium">{labels.pageHeader}</th>
              <th className="pb-2 font-medium">{labels.devices.mobile}/{labels.devices.desktop}</th>
              {["LCP", "INP", "CLS", "TTFB"].map((metric) => (
                <th key={metric} className="pb-2 text-right font-medium">
                  {metric}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {routes.map((route) => (
              <tr key={`${route.path}-${route.device}`} className="border-t border-primary/5">
                <td className="py-2 font-mono text-xs text-ink">{route.path}</td>
                <td className="py-2 text-xs text-ink-muted">
                  {labels.devices[route.device as "mobile" | "desktop"] ?? route.device}
                </td>
                {route.figures.map((figure) => (
                  <td key={figure.metric} className="py-2 text-right">
                    {figure.enoughSamples ? (
                      <span className={`tabular-nums ${ratingTone(figure.rating)}`}>
                        {figure.display}
                        <span className="ml-1 text-[10px] text-ink-muted">
                          {labels.ratings[figure.rating]}
                        </span>
                      </span>
                    ) : (
                      <span className="text-[11px] text-ink-muted">—</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {deploys.length > 0 && (
        <section className="admin-card">
          <h4 className="admin-label">{labels.deploysTitle}</h4>
          <p className="admin-hint">{labels.deploysHint}</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {deploys.map((deploy) => (
              <li
                key={`${deploy.day}-${deploy.commitSha}`}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary/5 px-3 py-1 text-xs text-ink"
              >
                <GitCommitHorizontal size={12} className="text-ink-muted" aria-hidden />
                <span className="font-mono">{deploy.commitSha}</span>
                <span className="text-ink-muted">{deploy.day}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** Colour is the second signal; the word beside it is the first. */
function ratingTone(rating: VitalFigureView["rating"]): string {
  if (rating === "good") return "text-emerald-700";
  if (rating === "needsImprovement") return "text-amber-700";
  return "text-red-700";
}
