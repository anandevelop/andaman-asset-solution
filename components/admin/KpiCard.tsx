/**
 * components/admin/KpiCard.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * One headline number on the dashboard, with the small picture that says
 * which way it is going.
 *
 * The whole card is the link, for a role the destination admits; for any
 * other role it is the same card without one (the page decides, from the
 * nav config). The sparkline sits in the top-right corner, as in the v4
 * mockup, and goes when the card is narrower than ~190px — a container
 * query, not a breakpoint, because the card is that narrow on a two-up
 * phone and on a four-up laptop alike. A bar (stock, consent) runs along
 * the foot instead.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { ReactNode } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";

/** The card's colour: its icon chip, sparkline and bar. */
export type KpiTone = "info" | "success" | "ocean" | "content";

const TONE: Record<KpiTone, string> = {
  info: "text-adm-status-info",
  success: "text-adm-success",
  ocean: "text-adm-ocean",
  content: "text-adm-content",
};

export default function KpiCard({
  href,
  icon: Icon,
  tone,
  label,
  value,
  unit,
  hint,
  sparkline,
  bar,
}: {
  href: string | null;
  icon: LucideIcon;
  tone: KpiTone;
  label: string;
  value: string;
  /** Smaller and muted after the value: "/137", "ครั้ง", "%". */
  unit?: string;
  hint: string;
  /** Top-right line chart. */
  sparkline?: ReactNode;
  /** Full-width bar under the hint. */
  bar?: ReactNode;
}) {
  const body = (
    <>
      <span className="flex items-center gap-2.5">
        <span className={`relative flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] ${TONE[tone]}`}>
          <span aria-hidden className="absolute inset-0 rounded-[9px] bg-current opacity-[0.14]" />
          <Icon size={15} aria-hidden className="relative" />
        </span>
        <span className="truncate text-[12.5px] text-adm-muted">{label}</span>
      </span>
      <span className="mt-3 text-[30px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-adm-text">
        {value}
        {unit && <span className="ml-1 text-sm font-normal tracking-normal text-adm-muted">{unit}</span>}
      </span>
      <span className="mt-2.5 truncate text-xs text-adm-muted">{hint}</span>
      {bar && <span className={`mt-3 block ${TONE[tone]}`}>{bar}</span>}
      {sparkline && (
        <span className={`absolute right-3.5 top-[54px] @max-[190px]:hidden ${TONE[tone]}`}>{sparkline}</span>
      )}
    </>
  );

  const className = "admin-card @container relative flex min-w-0 flex-col";

  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
