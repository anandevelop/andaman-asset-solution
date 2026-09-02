"use client";

/**
 * components/admin/DashboardCharts.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Recharts wrappers for the dashboard.
 *
 * One client component holding both charts rather than two, so recharts is
 * requested once. It is roughly 100kB — acceptable behind a login, and the
 * reason it appears nowhere on the public site.
 *
 * Data arrives pre-aggregated and pre-labelled from the server. These
 * components do no arithmetic: a chart that computes its own totals is a
 * second implementation of the report, and the two drift.
 * ─────────────────────────────────────────────────────────────────────────
 */

import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/** Brand palette — accent first, since it carries the primary series. */
const SERIES = {
  total: "#083551",
  won: "#e8b384",
};

/** Pie slices, ordered so adjacent segments stay distinguishable. */
const SLICE_COLOURS = [
  "#083551",
  "#e8b384",
  "#296682",
  "#dd9758",
  "#7099af",
  "#9c602c",
  "#c3d3dd",
];

const AXIS = { fontSize: 11, fill: "#516573" };

const TOOLTIP_STYLE = {
  contentStyle: {
    borderRadius: 2,
    border: "1px solid rgba(8,53,81,0.1)",
    fontSize: 12,
    boxShadow: "0 10px 40px -12px rgba(8, 53, 81, 0.18)",
  },
} as const;

export type MonthlyPoint = { label: string; total: number; won: number };
export type SourcePoint = { label: string; count: number };

export function MonthlyLeadsChart({
  data,
  labels,
}: {
  data: MonthlyPoint[];
  labels: { total: string; won: string; empty: string };
}) {
  const hasData = data.some((point) => point.total > 0);

  if (!hasData) {
    return (
      <p className="flex h-[260px] items-center justify-center text-sm text-ink-muted">
        {labels.empty}
      </p>
    );
  }

  return (
    // ResponsiveContainer needs a parent with a resolved height; the fixed
    // wrapper below is what stops it collapsing to zero on first paint.
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
          <XAxis
            dataKey="label"
            tick={AXIS}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={AXIS}
            axisLine={false}
            tickLine={false}
            // Lead counts are whole numbers; "2.5 leads" is meaningless.
            allowDecimals={false}
          />
          <Tooltip {...TOOLTIP_STYLE} cursor={{ fill: "rgba(8,53,81,0.04)" }} />
          <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />

          <Bar dataKey="total" name={labels.total} fill={SERIES.total} radius={[2, 2, 0, 0]} />
          <Bar dataKey="won" name={labels.won} fill={SERIES.won} radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function LeadSourceChart({
  data,
  emptyLabel,
}: {
  data: SourcePoint[];
  emptyLabel: string;
}) {
  if (data.length === 0) {
    return (
      <p className="flex h-[260px] items-center justify-center text-sm text-ink-muted">
        {emptyLabel}
      </p>
    );
  }

  return (
    <div className="h-[260px] w-full">
      {/*
        The donut is decorative, and the list is the chart.

        recharts renders each slice as a `role="img"` path it owns, with no
        accessible name — axe reports `svg-img-alt` on `.recharts-sector`.
        Naming every wedge would only trade that for a screen reader
        announcing eight anonymous images; the accessible form of a chart
        is its numbers. So the numbers are here, and the drawing is hidden.

        This surfaced late because the pie only renders with data, and the
        dashboard a11y spec ran against a database that had none until
        another spec started creating a lead ahead of it. It has been wrong
        for as long as the chart has had anything in it.
      */}
      <dl className="sr-only">
        {data.map((entry) => (
          <div key={entry.label}>
            <dt>{entry.label}</dt>
            <dd>{entry.count}</dd>
          </div>
        ))}
      </dl>

      <div aria-hidden="true" className="h-full w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="count"
              nameKey="label"
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={85}
              paddingAngle={2}
              // A donut, not a pie: the hole makes small slices easier to
              // compare by arc length than by wedge area.
              strokeWidth={0}
              /*
                recharts gives the pie's own <g> tabIndex=0, and a focusable
                node inside an aria-hidden subtree is its own axe violation
                (aria-hidden-focus): a tab stop that screen readers are told
                does not exist. -1 takes it out of the tab order and leaves
                the hover tooltip working, which `inert` would not.

                It is `rootTabIndex` on <Pie>, not `tabIndex` on <PieChart>:
                the chart-level prop is only read when `accessibilityLayer`
                is enabled, which it is not, so setting it there looks like
                a fix and changes nothing.
              */
              rootTabIndex={-1}
            >
              {data.map((entry, index) => (
                <Cell
                  key={entry.label}
                  fill={SLICE_COLOURS[index % SLICE_COLOURS.length]}
                />
              ))}
            </Pie>

            <Tooltip {...TOOLTIP_STYLE} />
            <Legend
              wrapperStyle={{ fontSize: 11 }}
              iconType="circle"
              iconSize={8}
              layout="vertical"
              align="right"
              verticalAlign="middle"
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
