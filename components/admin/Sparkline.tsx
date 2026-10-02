import { useId } from "react";

/**
 * components/admin/Sparkline.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * A day-by-day line for a KPI card. Hand-rolled SVG like KeywordSparkline,
 * and a server component: four of these on the dashboard are not worth
 * shipping recharts to the browser for.
 *
 * Drawn in currentColor, so the card decides the colour and dark mode
 * needs nothing of its own: a line, an area fading to nothing under it,
 * and a dot on today. Decorative — the card's number is the data — so it
 * is hidden from assistive technology.
 *
 * A series of all zeros draws nothing. A flat line along the bottom edge
 * read as a broken chart, not as "no leads this fortnight", which the
 * number beside it already says.
 * ─────────────────────────────────────────────────────────────────────────
 */

const WIDTH = 90;
const HEIGHT = 34;
const PAD = 3;

export default function Sparkline({ values, className = "" }: { values: number[]; className?: string }) {
  const fadeId = useId();
  if (values.length < 2 || values.every((value) => value === 0)) return null;

  const max = Math.max(...values, 1);
  const step = (WIDTH - PAD * 2) / (values.length - 1);
  const xy = values.map((value, index) => ({
    x: PAD + index * step,
    y: HEIGHT - PAD - (value / max) * (HEIGHT - PAD * 2),
  }));
  const points = xy.map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const last = xy[xy.length - 1];

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-hidden className={`h-[34px] w-[90px] overflow-visible ${className}`}>
      <defs>
        <linearGradient id={fadeId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity={0.28} />
          <stop offset="1" stopColor="currentColor" stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon points={`${PAD},${HEIGHT} ${points} ${WIDTH - PAD},${HEIGHT}`} fill={`url(#${fadeId})`} />
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={last.x} cy={last.y} r={2.6} fill="currentColor" />
    </svg>
  );
}
