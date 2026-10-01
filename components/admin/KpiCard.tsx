/**
 * components/admin/KpiCard.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * One headline number on the dashboard, with the small picture that says
 * which way it is going.
 *
 * The whole card is the link, for a role the destination admits; for any
 * other role it is the same card without one (the page decides, from the
 * nav config). The picture goes when the card is narrower than ~190px — a
 * container query, not a breakpoint, because the card is that narrow on a
 * two-up phone and on a four-up laptop alike, and a squeezed line chart is
 * just noise under the number.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { ReactNode } from "react";
import Link from "next/link";

export default function KpiCard({
  href,
  label,
  value,
  hint,
  visual,
}: {
  href: string | null;
  label: string;
  value: string;
  hint: string;
  /** Sparkline, stock bar or progress bar — anything that reads at 36px. */
  visual?: ReactNode;
}) {
  const body = (
    <>
      <span className="text-xs text-ink-muted">{label}</span>
      <span className="mt-1 text-[26px] font-semibold leading-tight tracking-tight tabular-nums text-ink">{value}</span>
      <span className="mt-0.5 truncate text-[11.5px] text-ink-muted">{hint}</span>
      {visual && <span className="mt-3 block text-adm-info @max-[190px]:hidden">{visual}</span>}
    </>
  );

  const className = "admin-card @container flex min-w-0 flex-col p-4!";

  return href ? (
    <Link href={href} className={`${className} transition-colors hover:border-adm-line-strong`}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
