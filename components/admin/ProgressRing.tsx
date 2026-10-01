/**
 * components/admin/ProgressRing.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * A small share-of-a-whole ring for matrix cells and cards. Colour by
 * threshold — green from 100%, amber from half, red below — the same three
 * steps the completeness chips use, so a ring and a chip for the same
 * figure never disagree. Decorative: the caller prints the number.
 * ─────────────────────────────────────────────────────────────────────────
 */

export default function ProgressRing({ share, size = 22 }: { share: number; size?: number }) {
  const clamped = Math.max(0, Math.min(1, share));
  const radius = 9;
  const circumference = 2 * Math.PI * radius;
  const tone = clamped >= 1 ? "stroke-adm-success" : clamped >= 0.5 ? "stroke-adm-warning" : "stroke-adm-danger";

  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className="-rotate-90 shrink-0" aria-hidden>
      <circle cx="12" cy="12" r={radius} fill="none" strokeWidth="3" className="stroke-adm-line" />
      {clamped > 0 && (
        <circle
          cx="12"
          cy="12"
          r={radius}
          fill="none"
          strokeWidth="3"
          strokeLinecap="round"
          className={tone}
          strokeDasharray={`${clamped * circumference} ${circumference}`}
        />
      )}
    </svg>
  );
}
