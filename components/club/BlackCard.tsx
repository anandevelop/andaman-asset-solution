/**
 * components/club/BlackCard.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The black member card as drawn everywhere in the portal: nested
 * champagne chevrons, a gold chip, the logo watermark bottom-left and the
 * project name top-right. Text slots are optional so the same artwork
 * serves the login hero, the scan page, home and the mini card.
 *
 * Sizes are in container-query units (cqw) so the type scales with the
 * card, whatever its width — one component, no per-size variants.
 * ─────────────────────────────────────────────────────────────────────────
 */
import type { ReactNode } from "react";
import ClubLogo from "./ClubLogo";

type Props = {
  label?: string;
  number?: string;
  name?: string;
  sub?: string;
  chip?: boolean;
  watermark?: boolean;
  className?: string;
  /** Overlays (QR glyph, VOID stamp) drawn on top of the artwork. */
  children?: ReactNode;
};

export function CardChevrons({ className = "" }: { className?: string }) {
  // Four nested chevrons peaking at x=597 on a 1000×630 card, as in the mockup's chev().
  const peaks = [467, 332, 197, 62];
  return (
    <svg viewBox="0 0 1000 630" preserveAspectRatio="none" className={`pointer-events-none absolute inset-0 h-full w-full ${className}`} aria-hidden>
      <defs>
        <linearGradient id="club-chev" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f6ecd8" />
          <stop offset=".5" stopColor="#d9c4a1" />
          <stop offset="1" stopColor="#a88d64" />
        </linearGradient>
      </defs>
      <g fill="none" stroke="url(#club-chev)" strokeWidth="1.4" opacity=".4">
        {peaks.map((py) => {
          const d = 507 - py;
          return <polyline key={py} points={`${597 - d},507 597,${py} ${597 + d},507`} />;
        })}
      </g>
    </svg>
  );
}

export default function BlackCard({ label, number, name, sub, chip = true, watermark = true, className = "", children }: Props) {
  return (
    <span
      className={`bg-black-card relative block aspect-[1.586/1] overflow-hidden rounded-[4.5cqw] text-left shadow-[inset_0_0_0_0.5px_rgb(217_196_161/0.38),0_24px_44px_-24px_rgb(0_0_0/0.85)] [container-type:inline-size] ${className}`}
    >
      <CardChevrons />
      <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,transparent_30%,rgb(239_226_200/0.07)_45%,transparent_60%)]" aria-hidden />
      {label ? (
        <span className="absolute right-[6%] top-[9%] max-w-[60%] truncate text-[3.1cqw] tracking-[0.38em] text-champagne-300">{label}</span>
      ) : null}
      {chip ? (
        <span
          className="absolute left-[6%] top-[34%] aspect-[1.3] w-[13%] rounded-[1.6cqw] bg-[linear-gradient(135deg,#f4e9d4,#c7ab7f_48%,#efe0c2_70%,#b89a6c)]"
          aria-hidden
        />
      ) : null}
      {number ? (
        <span className="absolute left-[6%] top-[58%] font-mono text-[4.4cqw] tracking-[0.22em] text-titanium-200">{number}</span>
      ) : null}
      {name ? (
        <span className="absolute bottom-[8%] right-[6%] max-w-[58%] text-right text-[3.4cqw] uppercase tracking-[0.12em] text-champagne-100">
          <span className="block truncate">{name}</span>
          {sub ? <span className="mt-[0.6cqw] block truncate text-[3cqw] tracking-[0.2em] text-titanium-400">{sub}</span> : null}
        </span>
      ) : null}
      {watermark ? (
        <span className="absolute bottom-[8%] left-[5.5%] w-[34%]">
          <ClubLogo className="w-full" />
        </span>
      ) : null}
      {children}
    </span>
  );
}
