"use client";

/**
 * components/admin/SearchQueryViews.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * What the site is actually found for — three views of the same Search
 * Console data, inside the keywords tab rather than a tab of its own.
 *
 *   Tracked    the phrases somebody chose, with what they really get
 *   Untracked  phrases Google already sends people on, that nobody listed
 *   Opportunity phrases just off the first page, clicked less than this
 *              site's own rows at a similar position
 *
 * "Untracked" is usually the most interesting of the three, which is why
 * it is not buried: it is what the site *is* found for, as opposed to what
 * somebody hoped it would be found for, and the gap between those two
 * lists is most of what this screen is for.
 *
 * BRAND AND NON-BRAND ARE NEVER ADDED TOGETHER
 *
 * Somebody searching the company name already knows the company. Counted
 * in with everyone else, a month of existing customers reads as the site
 * being found by new people — the one thing these figures exist to
 * measure. Both are shown; the non-brand one leads.
 *
 * THE ROWS DO NOT ADD UP TO THE TOTAL
 *
 * Said on screen, every time, because otherwise it is reported as a bug
 * once a month for ever. Google withholds queries searched by very few
 * people; the missing clicks are real traffic from searches it will not
 * name.
 *
 * Every figure arrives computed. This component does no arithmetic — the
 * same rule AnalyticsTabs and VitalsPanel already follow.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useState } from "react";
import { Info, Plus, Search } from "lucide-react";

type View = "tracked" | "untracked" | "opportunity";

export type QueryRow = {
  query: string;
  clicks: number;
  impressions: number;
  /** Already formatted: "3.2%". */
  ctr: string;
  /** Already formatted: "8.4". */
  position: string;
  isBrand: boolean;
  /** Opportunity rows only, already worded. */
  potential?: string;
};

export type SearchQueryLabels = {
  title: string;
  subtitle: string;
  tabs: Record<View, string>;
  tabHints: Record<View, string>;
  columnQuery: string;
  columnClicks: string;
  columnImpressions: string;
  columnCtr: string;
  columnPosition: string;
  columnPotential: string;
  brand: string;
  nonBrand: string;
  brandSplit: string;
  noBrandTerms: string;
  withheld: string;
  dataUpTo: string;
  empty: string;
  emptyHint: string;
  emptyView: string;
  track: string;
};

type Props = {
  labels: SearchQueryLabels;
  views: Record<View, QueryRow[]>;
  /** Already formatted by the page, which owns the locale's date format. */
  dataUpTo: string | null;
  totals: { brandClicks: number; nonBrandClicks: number; withheldClicks: number };
  brandTermsConfigured: boolean;
  empty: boolean;
  /**
   * Prefix for the "+ track" link; the query is appended, encoded.
   *
   * A string and not a builder function. A function in a Client
   * Component's props is not a serialisation warning but a server render
   * error — the whole page hits its error boundary — and this is the
   * second time that has been written in this codebase. See the note
   * above toFigureView in the analytics page.
   */
  trackHrefPrefix: string;
};

export default function SearchQueryViews({
  labels,
  views,
  dataUpTo,
  totals,
  brandTermsConfigured,
  empty,
  trackHrefPrefix,
}: Props) {
  const [view, setView] = useState<View>("untracked");

  if (empty) {
    return (
      <section className="admin-card">
        <h2 className="text-sm font-semibold text-primary">{labels.title}</h2>
        <p className="mt-2 text-sm text-ink">{labels.empty}</p>
        <p className="admin-hint mt-1">{labels.emptyHint}</p>
      </section>
    );
  }

  const rows = views[view];

  return (
    <section className="admin-card overflow-hidden p-0!">
      <div className="border-b border-primary/10 px-5 py-3.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-primary">
            <Search size={15} strokeWidth={1.75} className="text-accent-700" aria-hidden />
            {labels.title}
          </h2>
          {dataUpTo && (
            <span className="text-xs text-ink-muted">
              {labels.dataUpTo} {dataUpTo}
            </span>
          )}
        </div>
        <p className="admin-hint mt-1">{labels.subtitle}</p>

        {/* Non-brand first, and never summed with brand — see the header. */}
        <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
          <span>
            <span className="text-ink-muted">{labels.nonBrand}: </span>
            <span className="font-semibold tabular-nums text-ink">{totals.nonBrandClicks}</span>
          </span>
          <span>
            <span className="text-ink-muted">{labels.brand}: </span>
            <span className="tabular-nums text-ink-muted">{totals.brandClicks}</span>
          </span>
        </div>

        <p className="admin-hint mt-2 flex items-start gap-1.5">
          <Info size={12} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            {brandTermsConfigured ? labels.brandSplit : labels.noBrandTerms}{" "}
            {totals.withheldClicks > 0 && labels.withheld}
          </span>
        </p>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-primary/10 px-5 py-2.5">
        {(["untracked", "tracked", "opportunity"] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setView(key)}
            aria-pressed={view === key}
            className={`rounded-xs px-3 py-1.5 text-sm transition-colors ${
              view === key
                ? "bg-primary font-semibold text-white"
                : "text-ink-muted hover:text-primary"
            }`}
          >
            {labels.tabs[key]}
          </button>
        ))}
      </div>

      <p className="border-b border-primary/5 px-5 py-2 text-xs text-ink-muted">
        {labels.tabHints[view]}
      </p>

      {rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-ink-muted">{labels.emptyView}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-primary/10 text-left text-xs uppercase tracking-wide text-ink-muted">
                <th className="px-5 py-2 font-medium">{labels.columnQuery}</th>
                <th className="px-3 py-2 text-right font-medium">{labels.columnClicks}</th>
                <th className="px-3 py-2 text-right font-medium">{labels.columnImpressions}</th>
                <th className="px-3 py-2 text-right font-medium">{labels.columnCtr}</th>
                <th className="px-3 py-2 text-right font-medium">{labels.columnPosition}</th>
                {view === "opportunity" && (
                  <th className="px-3 py-2 text-right font-medium">{labels.columnPotential}</th>
                )}
                {view === "untracked" && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.query} className="border-b border-primary/5 last:border-b-0">
                  <td className="px-5 py-2.5 text-ink">
                    {row.query}
                    {row.isBrand && (
                      <span className="ml-2 rounded-full bg-primary/5 px-1.5 py-0.5 text-[10px] text-ink-muted">
                        {labels.brand}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right font-medium tabular-nums text-ink">
                    {row.clicks}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-ink-muted">
                    {row.impressions}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-ink-muted">{row.ctr}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-ink-muted">
                    {row.position}
                  </td>
                  {view === "opportunity" && (
                    <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700">
                      {row.potential}
                    </td>
                  )}
                  {view === "untracked" && (
                    <td className="px-3 py-2.5 text-right">
                      <a
                        href={`${trackHrefPrefix}${encodeURIComponent(row.query)}`}
                        className="inline-flex items-center gap-1 text-xs text-primary underline"
                      >
                        <Plus size={11} aria-hidden />
                        {labels.track}
                      </a>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
