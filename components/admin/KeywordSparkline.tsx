/**
 * components/admin/KeywordSparkline.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * A tiny inbound-rank trend line for one row of the keyword library's
 * table — hand-rolled `<svg><polyline>`, no recharts (this codebase's only
 * chart dependency has zero LineChart/sparkline usage anywhere; one
 * recharts instance per table row would be real weight for a repeated
 * small visual). Same "no charting dependency for one small stat visual"
 * spirit as this file's only real precedent, NewsSeoPanel.tsx's
 * ScoreDonut.
 *
 * The Y axis is inverted on purpose: rank 1 (best) plots at the TOP.
 * Plotting rank directly (bigger number = higher on screen, the naive
 * mapping) would draw a keyword climbing toward #1 as a line falling
 * toward the bottom — backwards from what "doing well" should look like.
 * ─────────────────────────────────────────────────────────────────────────
 */

const WIDTH = 96;
const HEIGHT = 28;
const PADDING = 3;

export default function KeywordSparkline({ points }: { points: { w: number; rank: number }[] }) {
  if (points.length === 0) {
    return <span className="text-xs text-ink-muted">—</span>;
  }

  const ranks = points.map((p) => p.rank);
  const min = Math.min(...ranks);
  const max = Math.max(...ranks);
  const span = max - min || 1;

  const usableWidth = WIDTH - PADDING * 2;
  const usableHeight = HEIGHT - PADDING * 2;

  const coords = points.map((point, index) => {
    const x = points.length === 1 ? WIDTH / 2 : PADDING + (index / (points.length - 1)) * usableWidth;
    // Inverted: the best rank (lowest number) maps to the smallest y (top).
    const y = PADDING + ((point.rank - min) / span) * usableHeight;
    return { x, y };
  });

  const improving = points.length > 1 && points[points.length - 1].rank < points[0].rank;

  if (coords.length === 1) {
    return (
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-7 w-24" role="img" aria-label={`rank ${points[0].rank}`}>
        <circle cx={coords[0].x} cy={coords[0].y} r={2} className="fill-ink-muted" />
      </svg>
    );
  }

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="h-7 w-24"
      role="img"
      aria-label={`rank trend, ${points[0].rank} to ${points[points.length - 1].rank}`}
    >
      <polyline
        points={coords.map((c) => `${c.x},${c.y}`).join(" ")}
        fill="none"
        strokeWidth={1.5}
        className={improving ? "stroke-emerald-600" : "stroke-ink-muted"}
      />
      <circle
        cx={coords[coords.length - 1].x}
        cy={coords[coords.length - 1].y}
        r={2}
        className={improving ? "fill-emerald-600" : "fill-ink-muted"}
      />
    </svg>
  );
}
