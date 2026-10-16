"use client";

/**
 * components/admin/SearchPerformancePanel.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Google Search Console's Performance report, inside the Traffic tab: the
 * four totals, the line over time, and the breakdown table, with Search
 * Console's own ranges, search types and filters. The data and its rules
 * are lib/seo/search-performance.ts; this file only draws them and asks for
 * the next answer.
 *
 * Laid out the way Search Console lays it out, on purpose. The people
 * reading this already know that screen, and a panel that put the same
 * four numbers in a different order would be read against the original
 * and assumed wrong. The metric colours are Search Console's too.
 *
 * Clicking a row filters by it, as in Search Console: a query narrows the
 * line to that query, a country to that country. The filters show as chips
 * above the chart, each with its own ×.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useMemo, useState, useTransition } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDown, ArrowUp, Download, Search, X } from "lucide-react";
import { fetchSearchPerformance } from "@/app/[locale]/admin/(growth)/analytics/search-actions";
import type { SearchPerformance } from "@/lib/seo/search-performance";
import type { Locale } from "@/i18n";
import { intlLocale } from "@/lib/format";
import type {
  Breakdown,
  BreakdownRow,
  Metrics,
  SearchFilters,
  SearchRange,
  SearchType,
} from "@/lib/seo/search-performance-shape";

type Metric = keyof Metrics;

const METRICS: Metric[] = ["clicks", "impressions", "ctr", "position"];

/** Search Console's own colours, so the panel reads like the report. */
const COLOURS: Record<Metric, string> = {
  clicks: "#4285f4",
  impressions: "#5e35b1",
  ctr: "#00897b",
  position: "#e8710a",
};

const MAIN_RANGES: SearchRange[] = ["24h", "7d", "28d", "3m"];
const MORE_RANGES: SearchRange[] = ["6m", "12m", "16m"];
const TYPES: SearchType[] = ["web", "image", "video", "news", "discover", "googleNews"];
const TABS: Breakdown[] = ["query", "page", "country", "device", "searchAppearance"];
const PAGE_SIZES = [10, 25, 50, 100];

export type SearchPanelLabels = {
  title: string;
  subtitle: string;
  property: string;
  updated: string;
  fresh: string;
  hourlyNote: string;
  ranges: Record<SearchRange, string>;
  more: string;
  types: Record<SearchType, string>;
  searchType: string;
  metrics: Record<Metric, string>;
  vsPrevious: string;
  tabs: Record<Breakdown, string>;
  devices: Record<"DESKTOP" | "MOBILE" | "TABLET", string>;
  filterQuery: string;
  filterPage: string;
  filterCountry: string;
  filterDevice: string;
  addFilter: string;
  apply: string;
  reset: string;
  searchRows: string;
  rowsPerPage: string;
  pageOf: string;
  export: string;
  empty: string;
  loading: string;
  withheld: string;
  truncated: string;
  appearanceNote: string;
  notConfigured: string;
  notConfiguredHint: string;
  noAccess: string;
  noAccessHint: string;
  failed: string;
  clickToFilter: string;
};

type Props = {
  locale: Locale;
  labels: SearchPanelLabels;
};

export default function SearchPerformancePanel({ locale, labels }: Props) {
  /*
    Fetched after mount, not with the page: Search Console takes one to
    three seconds to answer, and the rest of /admin/analytics should not
    wait for it.
  */
  const [data, setData] = useState<SearchPerformance | null>(null);
  const [range, setRange] = useState<SearchRange>("28d");
  const [type, setType] = useState<SearchType>("web");
  const [tab, setTab] = useState<Breakdown>("query");
  const [filters, setFilters] = useState<SearchFilters>({});
  const [shown, setShown] = useState<Record<Metric, boolean>>({
    clicks: true,
    impressions: true,
    ctr: false,
    position: false,
  });
  const [pending, startTransition] = useTransition();

  function load(next: Partial<{ range: SearchRange; type: SearchType; tab: Breakdown; filters: SearchFilters }>) {
    const request = {
      range: next.range ?? range,
      type: next.type ?? type,
      tab: next.tab ?? tab,
      filters: next.filters ?? filters,
    };
    setRange(request.range);
    setType(request.type);
    setTab(request.tab);
    setFilters(request.filters);
    startTransition(async () => {
      setData(
        await fetchSearchPerformance({
          locale,
          range: request.range,
          type: request.type,
          breakdown: request.tab,
          filters: request.filters,
        }),
      );
    });
  }

  useEffect(() => {
    let cancelled = false;
    fetchSearchPerformance({ locale, range: "28d", type: "web", breakdown: "query", filters: {} }).then((first) => {
      if (!cancelled) setData(first);
    });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  const fmt = useMemo(() => formatters(intlLocale(locale)), [locale]);

  return (
    <section className="admin-card space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-adm-text">{labels.title}</h2>
          <p className="mt-1 text-sm text-adm-muted">{labels.subtitle}</p>
        </div>
        {data?.ok && (
          <p className="text-xs text-adm-muted">
            {labels.property}: <span className="font-mono">{data.siteUrl}</span>
            <br />
            {labels.updated}: {fmt.time(data.fetchedAt)}
          </p>
        )}
      </header>

      <Controls
        labels={labels}
        range={range}
        type={type}
        filters={filters}
        pending={pending}
        onRange={(value) => load({ range: value })}
        onType={(value) => load({ type: value })}
        onFilters={(value) => load({ filters: value })}
      />

      {data === null ? (
        <p className="flex h-[280px] items-center justify-center text-sm text-adm-muted">{labels.loading}</p>
      ) : !data.ok ? (
        <Problem labels={labels} data={data} />
      ) : (
        <div className={`space-y-5 transition-opacity ${pending ? "opacity-50" : ""}`} aria-busy={pending}>
          <MetricCards
            labels={labels}
            totals={data.totals}
            previous={data.previous}
            shown={shown}
            fmt={fmt}
            onToggle={(metric) => setShown((current) => ({ ...current, [metric]: !current[metric] }))}
          />

          <Chart data={data} shown={shown} labels={labels} fmt={fmt} />

          <p className="text-xs text-adm-muted">{data.hourly ? labels.hourlyNote : labels.fresh}</p>

          <BreakdownTable
            key={`${tab}-${range}-${type}-${JSON.stringify(filters)}`}
            labels={labels}
            tab={tab}
            rows={data.rows}
            fmt={fmt}
            withheldClicks={data.withheldClicks}
            truncated={data.truncated}
            hourly={data.hourly}
            onTab={(value) => load({ tab: value })}
            onPick={(row) => {
              const filter: SearchFilters =
                tab === "query"
                  ? { query: row.key }
                  : tab === "page"
                    ? { page: row.key }
                    : tab === "country"
                      ? { country: row.key }
                      : tab === "device"
                        ? { device: row.key as SearchFilters["device"] }
                        : {};
              if (Object.keys(filter).length > 0) load({ filters: { ...filters, ...filter } });
            }}
          />
        </div>
      )}
    </section>
  );
}

/* ───────────────────────────── controls ───────────────────────────── */

function Controls({
  labels,
  range,
  type,
  filters,
  pending,
  onRange,
  onType,
  onFilters,
}: {
  labels: SearchPanelLabels;
  range: SearchRange;
  type: SearchType;
  filters: SearchFilters;
  pending: boolean;
  onRange: (range: SearchRange) => void;
  onType: (type: SearchType) => void;
  onFilters: (filters: SearchFilters) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<SearchFilters>(filters);
  const active = (Object.entries(filters) as [keyof SearchFilters, string | undefined][]).filter(([, value]) => value);

  const filterName: Record<keyof SearchFilters, string> = {
    query: labels.filterQuery,
    page: labels.filterPage,
    country: labels.filterCountry,
    device: labels.filterDevice,
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-xs border border-adm-line" role="group" aria-label={labels.ranges["28d"]}>
          {MAIN_RANGES.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={range === value}
              disabled={pending}
              onClick={() => onRange(value)}
              className={`border-r border-adm-line px-3 py-1.5 text-xs last:border-r-0 ${
                range === value ? "bg-adm-strong text-adm-on-strong" : "text-adm-text hover:bg-adm-fill"
              }`}
            >
              {labels.ranges[value]}
            </button>
          ))}
          <select
            aria-label={labels.more}
            value={MORE_RANGES.includes(range) ? range : ""}
            disabled={pending}
            onChange={(event) => event.target.value && onRange(event.target.value as SearchRange)}
            className={`border-0 bg-transparent px-2 py-1.5 text-xs ${
              MORE_RANGES.includes(range) ? "bg-adm-strong text-adm-on-strong" : "text-adm-text"
            }`}
          >
            <option value="">{labels.more}</option>
            {MORE_RANGES.map((value) => (
              <option key={value} value={value}>
                {labels.ranges[value]}
              </option>
            ))}
          </select>
        </div>

        <label className="flex items-center gap-1.5 text-xs text-adm-muted">
          {labels.searchType}
          <select
            value={type}
            disabled={pending}
            onChange={(event) => onType(event.target.value as SearchType)}
            className="rounded-xs border border-adm-line bg-transparent px-2 py-1.5 text-xs text-adm-text"
          >
            {TYPES.map((value) => (
              <option key={value} value={value}>
                {labels.types[value]}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={() => {
            setDraft(filters);
            setOpen((value) => !value);
          }}
          aria-expanded={open}
          className="rounded-xs border border-adm-line px-3 py-1.5 text-xs text-adm-text hover:bg-adm-fill"
        >
          + {labels.addFilter}
        </button>

        {active.length > 0 && (
          <button type="button" onClick={() => onFilters({})} className="text-xs text-adm-accent-ink underline-offset-2 hover:underline">
            {labels.reset}
          </button>
        )}
      </div>

      {active.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {active.map(([key, value]) => (
            <li key={key} className="flex items-center gap-1.5 rounded-full bg-adm-fill px-3 py-1 text-xs text-adm-text">
              <span className="text-adm-muted">{filterName[key]}:</span>
              <span className="max-w-[28ch] truncate">{key === "device" ? labels.devices[value as "DESKTOP"] ?? value : value}</span>
              <button
                type="button"
                aria-label={`${labels.reset} ${filterName[key]}`}
                onClick={() => onFilters({ ...filters, [key]: undefined })}
                className="text-adm-muted hover:text-adm-text"
              >
                <X size={12} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <form
          className="grid gap-3 rounded-xs border border-adm-line p-3 sm:grid-cols-2 lg:grid-cols-4"
          onSubmit={(event) => {
            event.preventDefault();
            setOpen(false);
            onFilters(draft);
          }}
        >
          <FilterInput label={labels.filterQuery} value={draft.query} onChange={(query) => setDraft({ ...draft, query })} />
          <FilterInput label={labels.filterPage} value={draft.page} onChange={(page) => setDraft({ ...draft, page })} />
          <label className="text-xs text-adm-muted">
            {labels.filterDevice}
            <select
              value={draft.device ?? ""}
              onChange={(event) => setDraft({ ...draft, device: (event.target.value || undefined) as SearchFilters["device"] })}
              className="mt-1 block w-full rounded-xs border border-adm-line bg-transparent px-2 py-1.5 text-sm text-adm-text"
            >
              <option value="">—</option>
              {(["DESKTOP", "MOBILE", "TABLET"] as const).map((device) => (
                <option key={device} value={device}>
                  {labels.devices[device]}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <button type="submit" className="w-full rounded-xs bg-adm-strong px-3 py-2 text-xs font-medium text-adm-on-strong">
              {labels.apply}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function FilterInput({ label, value, onChange }: { label: string; value?: string; onChange: (value: string) => void }) {
  return (
    <label className="text-xs text-adm-muted">
      {label}
      <input
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        maxLength={200}
        className="mt-1 block w-full rounded-xs border border-adm-line bg-transparent px-2 py-1.5 text-sm text-adm-text"
      />
    </label>
  );
}

/* ───────────────────────────── problems ───────────────────────────── */

function Problem({ labels, data }: { labels: SearchPanelLabels; data: Exclude<SearchPerformance, { ok: true }> }) {
  if (data.reason === "NOT_CONFIGURED") {
    return <Notice title={labels.notConfigured} body={labels.notConfiguredHint} />;
  }
  if (data.reason === "NO_ACCESS") {
    return (
      <Notice
        title={labels.noAccess}
        body={labels.noAccessHint.replace("{property}", data.siteUrl).replace("{email}", data.serviceAccount ?? "—")}
        detail={data.detail}
      />
    );
  }
  return <Notice title={labels.failed} body="" detail={data.detail} />;
}

function Notice({ title, body, detail }: { title: string; body: string; detail?: string }) {
  return (
    <div className="rounded-xs border border-adm-line bg-adm-fill/50 p-4 text-sm">
      <p className="font-medium text-adm-text">{title}</p>
      {body && <p className="mt-1 whitespace-pre-line text-adm-muted">{body}</p>}
      {detail && <p className="mt-2 break-all font-mono text-[11px] text-adm-muted">{detail}</p>}
    </div>
  );
}

/* ───────────────────────────── totals ───────────────────────────── */

type Fmt = ReturnType<typeof formatters>;

function formatters(locale: string) {
  const int = new Intl.NumberFormat(locale);
  const compact = new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 2 });
  const pct = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 });
  const dec = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const time = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });
  return {
    metric(metric: Metric, value: number, short = false): string {
      if (metric === "ctr") return pct.format(value);
      if (metric === "position") return value > 0 ? dec.format(value) : "—";
      return short && value >= 10_000 ? compact.format(value) : int.format(value);
    },
    time: (iso: string) => time.format(new Date(iso)),
    pct,
    dec,
  };
}

function MetricCards({
  labels,
  totals,
  previous,
  shown,
  fmt,
  onToggle,
}: {
  labels: SearchPanelLabels;
  totals: Metrics;
  previous: Metrics | null;
  shown: Record<Metric, boolean>;
  fmt: Fmt;
  onToggle: (metric: Metric) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {METRICS.map((metric) => {
        const on = shown[metric];
        return (
          <button
            key={metric}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(metric)}
            className="rounded-xs p-4 text-left transition-colors"
            style={on ? { background: COLOURS[metric], color: "white" } : { border: "1px solid var(--adm-line)" }}
          >
            <span className="flex items-center gap-2 text-xs">
              <span
                aria-hidden
                className="grid h-3.5 w-3.5 place-items-center rounded-[3px] border"
                style={{ borderColor: on ? "white" : COLOURS[metric] }}
              >
                {on && <span className="h-2 w-2 rounded-[1px] bg-white" />}
              </span>
              <span className={on ? "" : "text-adm-muted"}>{labels.metrics[metric]}</span>
            </span>
            <span className={`mt-2 block text-3xl font-light tabular-nums ${on ? "" : "text-adm-text"}`}>
              {fmt.metric(metric, totals[metric], true)}
            </span>
            {previous && <Delta metric={metric} now={totals[metric]} before={previous[metric]} fmt={fmt} on={on} label={labels.vsPrevious} />}
          </button>
        );
      })}
    </div>
  );
}

/** Change against the period before. Position falls when it improves, so
 *  its arrow is read the other way round. */
function Delta({ metric, now, before, fmt, on, label }: { metric: Metric; now: number; before: number; fmt: Fmt; on: boolean; label: string }) {
  let text: string;
  let better: boolean | null;

  if (metric === "position") {
    if (now === 0 || before === 0) return null;
    const diff = now - before;
    text = fmt.dec.format(Math.abs(diff));
    better = diff === 0 ? null : diff < 0;
  } else if (metric === "ctr") {
    const diff = now - before;
    text = `${fmt.dec.format(Math.abs(diff) * 100)} pp`;
    better = diff === 0 ? null : diff > 0;
  } else {
    if (before === 0) return null;
    const ratio = (now - before) / before;
    text = fmt.pct.format(Math.abs(ratio));
    better = ratio === 0 ? null : ratio > 0;
  }

  const up = metric === "position" ? better === false : better === true;
  const tone = on ? "text-white/85" : better === null ? "text-adm-muted" : better ? "text-adm-success" : "text-adm-danger";

  return (
    <span className={`mt-1 flex items-center gap-1 text-[11px] ${tone}`} title={label}>
      {better !== null && (up ? <ArrowUp size={11} aria-hidden /> : <ArrowDown size={11} aria-hidden />)}
      {text} <span className="opacity-70">{label}</span>
    </span>
  );
}

/* ───────────────────────────── chart ───────────────────────────── */

function Chart({
  data,
  shown,
  labels,
  fmt,
}: {
  data: Extract<SearchPerformance, { ok: true }>;
  shown: Record<Metric, boolean>;
  labels: SearchPanelLabels;
  fmt: Fmt;
}) {
  if (data.series.length === 0 || data.series.every((point) => point.impressions === 0)) {
    return <p className="flex h-[280px] items-center justify-center text-sm text-adm-muted">{labels.empty}</p>;
  }

  // Position has no value on a day with no impressions. Null leaves a gap;
  // the 0 Google sends would read as "ranked first".
  const points = data.series.map((point) => ({ ...point, position: point.impressions > 0 ? point.position : null }));

  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <CartesianGrid vertical={false} stroke="rgba(8,53,81,0.08)" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "#516573" }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={24}
          />
          {/* One hidden axis per metric: clicks in tens and impressions in
              thousands on one scale would flatten the clicks line. Position
              runs top-down, 1 at the top, as Search Console draws it. */}
          {METRICS.map((metric) => (
            <YAxis key={metric} yAxisId={metric} hide reversed={metric === "position"} domain={metric === "position" ? [1, "auto"] : [0, "auto"]} />
          ))}
          <Tooltip
            formatter={(value, name) => [fmt.metric(name as Metric, Number(value)), labels.metrics[name as Metric]]}
            contentStyle={{ borderRadius: 2, border: "1px solid rgba(8,53,81,0.1)", fontSize: 12 }}
          />
          {METRICS.filter((metric) => shown[metric]).map((metric) => (
            <Line
              key={metric}
              yAxisId={metric}
              dataKey={metric}
              name={metric}
              stroke={COLOURS[metric]}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ───────────────────────────── table ───────────────────────────── */

function BreakdownTable({
  labels,
  tab,
  rows,
  fmt,
  withheldClicks,
  truncated,
  hourly,
  onTab,
  onPick,
}: {
  labels: SearchPanelLabels;
  tab: Breakdown;
  rows: BreakdownRow[];
  fmt: Fmt;
  withheldClicks: number;
  truncated: boolean;
  hourly: boolean;
  onTab: (tab: Breakdown) => void;
  onPick: (row: BreakdownRow) => void;
}) {
  const [sort, setSort] = useState<{ by: Metric; desc: boolean }>({ by: "clicks", desc: true });
  const [needle, setNeedle] = useState("");
  const [size, setSize] = useState(10);
  const [page, setPage] = useState(0);

  const visible = useMemo(() => {
    const term = needle.trim().toLowerCase();
    const filtered = term ? rows.filter((row) => `${row.label} ${row.key}`.toLowerCase().includes(term)) : rows;
    const sign = sort.desc ? -1 : 1;
    return [...filtered].sort((a, b) => sign * (a[sort.by] - b[sort.by]) || b.impressions - a.impressions);
  }, [rows, needle, sort]);

  const pages = Math.max(1, Math.ceil(visible.length / size));
  const current = Math.min(page, pages - 1);
  const slice = visible.slice(current * size, current * size + size);
  const pickable = tab !== "searchAppearance";

  function exportCsv() {
    const header = [labels.tabs[tab], ...METRICS.map((metric) => labels.metrics[metric])];
    const lines = visible.map((row) => [
      row.label,
      String(row.clicks),
      String(row.impressions),
      (row.ctr * 100).toFixed(2) + "%",
      row.position.toFixed(1),
    ]);
    const csv = [header, ...lines].map((line) => line.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")).join("\n");
    // The BOM is what makes Excel read the Thai as UTF-8.
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `search-${tab}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="rounded-xs border border-adm-line">
      <div className="flex overflow-x-auto border-b border-adm-line" role="tablist">
        {TABS.map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => onTab(value)}
            className={`shrink-0 border-b-2 px-4 py-3 text-sm ${
              tab === value ? "border-adm-strong font-medium text-adm-text" : "border-transparent text-adm-muted hover:text-adm-text"
            }`}
          >
            {labels.tabs[value]}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <label className="flex items-center gap-2 text-sm">
          <Search size={14} className="text-adm-muted" aria-hidden />
          <input
            value={needle}
            onChange={(event) => {
              setNeedle(event.target.value);
              setPage(0);
            }}
            placeholder={labels.searchRows}
            aria-label={labels.searchRows}
            className="w-56 border-0 bg-transparent text-sm text-adm-text outline-none placeholder:text-adm-muted"
          />
        </label>
        <button
          type="button"
          onClick={exportCsv}
          disabled={visible.length === 0}
          className="flex items-center gap-1.5 text-xs text-adm-text hover:text-adm-accent-ink disabled:opacity-40"
        >
          <Download size={14} aria-hidden /> {labels.export}
        </button>
      </div>

      {visible.length === 0 ? (
        <p className="px-4 pb-6 pt-2 text-center text-sm text-adm-muted">{labels.empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-adm-line text-xs text-adm-muted">
                <th className="px-4 py-2.5 text-left font-normal">{labels.tabs[tab]}</th>
                {METRICS.map((metric) => (
                  <th key={metric} className="px-4 py-2.5 text-right font-normal">
                    <button
                      type="button"
                      onClick={() => setSort((current) => ({ by: metric, desc: current.by === metric ? !current.desc : true }))}
                      className={`inline-flex items-center gap-1 ${sort.by === metric ? "font-medium text-adm-text" : ""}`}
                    >
                      {sort.by === metric && (sort.desc ? <ArrowDown size={12} aria-hidden /> : <ArrowUp size={12} aria-hidden />)}
                      {labels.metrics[metric]}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slice.map((row) => (
                <tr key={row.key} className="border-b border-adm-line last:border-b-0 hover:bg-adm-fill/50">
                  <td className="max-w-[48ch] px-4 py-2.5">
                    <RowLabel row={row} tab={tab} labels={labels} pickable={pickable} onPick={onPick} />
                  </td>
                  {METRICS.map((metric) => (
                    <td key={metric} className="px-4 py-2.5 text-right tabular-nums" style={{ color: COLOURS[metric] }}>
                      {fmt.metric(metric, row[metric])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-adm-line px-4 py-3 text-xs text-adm-muted">
        <div className="space-y-1">
          {tab === "query" && withheldClicks > 0 && <p>{labels.withheld.replace("{count}", fmt.metric("clicks", withheldClicks))}</p>}
          {truncated && <p>{labels.truncated}</p>}
          {tab === "searchAppearance" && hourly && <p>{labels.appearanceNote}</p>}
          {pickable && visible.length > 0 && <p>{labels.clickToFilter}</p>}
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5">
            {labels.rowsPerPage}
            <select
              value={size}
              onChange={(event) => {
                setSize(Number(event.target.value));
                setPage(0);
              }}
              className="border-0 bg-transparent text-xs text-adm-text"
            >
              {PAGE_SIZES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <span className="tabular-nums">
            {labels.pageOf
              .replace("{from}", String(visible.length === 0 ? 0 : current * size + 1))
              .replace("{to}", String(Math.min(visible.length, current * size + size)))
              .replace("{total}", String(visible.length))}
          </span>
          <button type="button" aria-label="‹" disabled={current === 0} onClick={() => setPage(current - 1)} className="px-1 disabled:opacity-30">
            ‹
          </button>
          <button type="button" aria-label="›" disabled={current >= pages - 1} onClick={() => setPage(current + 1)} className="px-1 disabled:opacity-30">
            ›
          </button>
        </div>
      </div>
    </div>
  );
}

function RowLabel({
  row,
  tab,
  labels,
  pickable,
  onPick,
}: {
  row: BreakdownRow;
  tab: Breakdown;
  labels: SearchPanelLabels;
  pickable: boolean;
  onPick: (row: BreakdownRow) => void;
}) {
  const text =
    tab === "device"
      ? labels.devices[row.key as "DESKTOP"] ?? row.label
      : tab === "page"
        ? pathOf(row.key)
        : row.label;

  const content = (
    <span className="flex min-w-0 items-center gap-2">
      {row.flag && (
        // eslint-disable-next-line @next/next/no-img-element -- a 16px same-origin SVG; next/image adds nothing here
        <img src={`/flags/${row.flag.toLowerCase()}.svg`} alt="" width={16} height={12} className="shrink-0 rounded-[2px]" />
      )}
      <span className="truncate" title={tab === "page" ? row.key : text}>
        {text}
      </span>
    </span>
  );

  if (!pickable) return content;
  return (
    <button type="button" onClick={() => onPick(row)} className="block w-full text-left text-adm-text hover:text-adm-accent-ink">
      {content}
    </button>
  );
}

/** A page row as its path: every URL in a property starts the same way,
 *  and the full one is in the title. */
function pathOf(url: string): string {
  try {
    const parsed = new URL(url);
    return decodeURI(parsed.pathname) + parsed.search || "/";
  } catch {
    return url;
  }
}
