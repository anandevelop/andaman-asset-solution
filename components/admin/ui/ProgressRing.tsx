/**
 * components/admin/ui/ProgressRing.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * A share as a ring with the number in the middle — the mockup's `.ring`:
 * a conic gradient over the line colour, an inner disc in the solid
 * surface, 26 / 40 / 92 / 130px. Colour by threshold: ≥80 success, ≥50 sand
 * ink, below that warning — a ring is a nudge, not an alarm, so nothing
 * here goes red.
 *
 * Replaces the SVG ring of phase F (components/admin/ProgressRing.tsx),
 * which had no number and its own thresholds.
 * ─────────────────────────────────────────────────────────────────────────
 */

const SIZE = {
  sm: { box: "h-[26px] w-[26px]", inset: "inset-[3px]", text: "text-[9px]" },
  md: { box: "h-10 w-10", inset: "inset-[4px]", text: "text-[11px]" },
  lg: { box: "h-[92px] w-[92px]", inset: "inset-[8px]", text: "text-[22px]" },
  xl: { box: "h-[130px] w-[130px]", inset: "inset-[10px]", text: "text-[32px]" },
} as const;

export function ringTone(value: number): string {
  if (value >= 80) return "var(--adm-success)";
  if (value >= 50) return "var(--adm-accent-ink)";
  return "var(--adm-warning)";
}

export default function ProgressRing({
  value,
  size = "md",
  showValue = true,
  suffix = "",
  label,
}: {
  /** 0–100. */
  value: number;
  size?: keyof typeof SIZE;
  showValue?: boolean;
  /** After the number, e.g. "%" on the large ring. */
  suffix?: string;
  /** Accessible text; without it the ring is decorative. */
  label?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  const s = SIZE[size];
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={`relative inline-flex shrink-0 items-center justify-center rounded-full ${s.box}`}
      style={{ background: `conic-gradient(${ringTone(clamped)} ${clamped * 3.6}deg, var(--adm-line) 0)` }}
    >
      <span className={`absolute rounded-full bg-adm-solid ${s.inset}`} />
      {showValue && (
        <span className={`relative font-semibold tabular-nums text-adm-text ${s.text}`}>
          {clamped}
          {suffix && <span className="text-[0.6em] font-normal text-adm-muted">{suffix}</span>}
        </span>
      )}
    </span>
  );
}
