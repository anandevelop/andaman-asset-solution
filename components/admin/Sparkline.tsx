/**
 * components/admin/Sparkline.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * A day-by-day line for a KPI card. Hand-rolled SVG like KeywordSparkline,
 * and a server component: four of these on the dashboard are not worth
 * shipping recharts to the browser for.
 *
 * Drawn in currentColor, so the card decides the colour and dark mode
 * needs nothing of its own. Decorative — the card's number is the data —
 * so it is hidden from assistive technology.
 * ─────────────────────────────────────────────────────────────────────────
 */

const WIDTH = 120;
const HEIGHT = 36;
const PAD = 2;

export default function Sparkline({ values, className = "" }: { values: number[]; className?: string }) {
  if (values.length < 2) return null;

  const max = Math.max(...values, 1);
  const step = (WIDTH - PAD * 2) / (values.length - 1);
  const points = values.map((value, index) => {
    const x = PAD + index * step;
    const y = HEIGHT - PAD - (value / max) * (HEIGHT - PAD * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      aria-hidden
      className={`h-9 w-full ${className}`}
    >
      <polygon
        points={`${PAD},${HEIGHT} ${points.join(" ")} ${WIDTH - PAD},${HEIGHT}`}
        fill="currentColor"
        opacity={0.1}
      />
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
