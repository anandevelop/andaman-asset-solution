/**
 * components/admin/report/ReportCharts.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The printed analytics report's charts: plain server-rendered SVG and
 * divs, in the brand's own colours.
 *
 * Not the screen's chart library, for two reasons. The report has to look
 * the same on paper as in the preview, and a canvas or animated chart
 * prints as whatever frame it was on, or as nothing. And the colours are
 * hex rather than admin tokens, because the back office has a dark theme
 * that remaps those tokens, and a PDF exported from a dark-themed session
 * should still come out navy on white.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { formatNumber } from "@/lib/format";

export const BRAND = {
  navy: "#083551",
  navyDeep: "#041d2c",
  gold: "#e8b384",
  goldDeep: "#c47b3a",
  ink: "#0d2635",
  muted: "#516573",
  line: "#dfe6eb",
  wash: "#f4f7f9",
} as const;

type Column = { label: string; value: number; highlight?: number };

/**
 * Columns, one per point, every bar carrying its own number.
 *
 * A reader of this report is deciding something from it, not exploring it,
 * so the figure is printed on the bar rather than left to be estimated
 * against an axis. With more than 45 columns (a 90-day range) there is no
 * room above each bar, so only the highest is labelled; the summary line
 * the page prints under the chart carries the rest. The left scale marks
 * 0, half and the top. Zero bars get no label, because a row of "0"s
 * buries the days that matter.
 *
 * `highlight` draws a second, gold column inside the first (won leads
 * inside all leads), with its own number inside it when it fits.
 * x-axis labels are thinned to about eight so a 30-day series stays
 * legible on A4.
 */
export function ColumnChart({
  points,
  locale,
  height = 160,
  width = 640,
}: {
  points: Column[];
  locale: string;
  height?: number;
  /** viewBox width: 320 for a half-width chart keeps its labels as large as
   *  a full-width one's, since the SVG scales to its column. */
  width?: number;
}) {
  if (points.length === 0) return null;
  const n = (value: number) => formatNumber(locale, value);
  const left = 30;
  const top = 18;
  const bottom = 22;
  const plotW = width - left;
  const plot = height - top - bottom;
  const max = Math.max(1, ...points.map((p) => p.value));
  const step = plotW / points.length;
  const bar = Math.max(2, step * 0.62);
  const every = Math.max(1, Math.ceil(points.length / 8));
  const dense = points.length > 45;
  const peak = points.findIndex((p) => p.value === max);
  const labelSize = step < 16 ? 8 : 10;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="block h-auto w-full" role="img">
      {[0, 0.5, 1].map((f) => {
        const y = top + plot * (1 - f);
        return (
          <g key={f}>
            <line
              x1={left}
              x2={width}
              y1={y}
              y2={y}
              stroke={f === 0 ? BRAND.muted : BRAND.line}
              strokeOpacity={f === 0 ? 0.4 : 1}
              strokeDasharray={f === 0.5 ? "3 4" : undefined}
            />
            <text x={left - 6} y={y + 3} textAnchor="end" fontSize={9} fill={BRAND.muted}>
              {n(Math.round(max * f))}
            </text>
          </g>
        );
      })}
      {points.map((point, i) => {
        const x = left + i * step + (step - bar) / 2;
        const h = (point.value / max) * plot;
        const hh = point.highlight ? (point.highlight / max) * plot : 0;
        const showValue = point.value > 0 && (!dense || i === peak);
        return (
          <g key={i}>
            <rect x={x} y={top + plot - h} width={bar} height={h} rx={1.5} fill={BRAND.navy} />
            {hh > 0 && <rect x={x} y={top + plot - hh} width={bar} height={hh} rx={1.5} fill={BRAND.gold} />}
            {showValue && (
              <text
                x={x + bar / 2}
                y={top + plot - h - 4}
                textAnchor="middle"
                fontSize={labelSize}
                fontWeight={600}
                fill={BRAND.navy}
              >
                {n(point.value)}
              </text>
            )}
            {hh >= 14 && (
              <text
                x={x + bar / 2}
                y={top + plot - hh / 2 + 3}
                textAnchor="middle"
                fontSize={labelSize}
                fontWeight={600}
                fill={BRAND.navyDeep}
              >
                {n(point.highlight ?? 0)}
              </text>
            )}
            {i % every === 0 && (
              <text x={x + bar / 2} y={height - 6} textAnchor="middle" fontSize={10} fill={BRAND.muted}>
                {point.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** Labelled horizontal bars, largest first as given. */
export function BarList({
  rows,
  locale,
  tone = "navy",
}: {
  rows: { label: string; value: number; display?: string; flag?: string }[];
  locale: string;
  tone?: "navy" | "gold";
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const total = rows.reduce((sum, r) => sum + r.value, 0);
  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li key={row.label} className="grid grid-cols-[9rem_1fr_auto] items-center gap-3 text-[11px]">
          <span className="truncate" style={{ color: BRAND.ink }}>
            {row.label}
            {row.flag && (
              <span
                className="ml-1.5 rounded-sm px-1 py-px text-[9px] font-semibold uppercase tracking-wide"
                style={{ background: "#fdecea", color: "#b42318" }}
              >
                {row.flag}
              </span>
            )}
          </span>
          <span className="h-2.5 overflow-hidden rounded-full" style={{ background: BRAND.wash }}>
            {/* Nothing for a zero: a 2% stub read as a small number. */}
            {row.value > 0 && (
              <span
                className="block h-full rounded-full"
                style={{
                  width: `${Math.max(2, (row.value / max) * 100)}%`,
                  background: tone === "gold" ? BRAND.gold : BRAND.navy,
                }}
              />
            )}
          </span>
          {/* The count, and its share of the list, so "4" reads as "all of
              them" without adding the rows up. */}
          <span className="w-20 text-right tabular-nums" style={{ color: BRAND.ink }}>
            <b className="font-semibold">{row.display ?? formatNumber(locale, row.value)}</b>
            {total > 0 && (
              <span className="ml-1.5 text-[9.5px]" style={{ color: BRAND.muted }}>
                {formatNumber(locale, Math.round((row.value / total) * 100))}%
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
