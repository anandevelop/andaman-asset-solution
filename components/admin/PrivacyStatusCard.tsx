/**
 * components/admin/PrivacyStatusCard.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * "ความเป็นส่วนตัวและ PDPA" — the compliance state in five lines.
 *
 * A Server Component: every value is already resolved by the layout, and
 * there is nothing to interact with but the link at the bottom.
 *
 * The retention line is deliberately muted. Three years is the policy this
 * business works to, not something this application enforces — there is no
 * job that deletes anything (see lib/pdpa.ts), and rendering it in the same
 * weight as the counted numbers would read as a claim that something is
 * running. The note underneath says what actually happens on an erasure.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { ShieldCheck } from "lucide-react";

type Row = {
  key: string;
  label: string;
  value: string;
  /** A policy figure rather than a counted one. */
  muted?: boolean;
  /** Something that needs attention — an outdated consent version. */
  highlight?: boolean;
};

export default function PrivacyStatusCard({
  title,
  rows,
  note,
  cta,
}: {
  locale: string;
  title: string;
  rows: Row[];
  note: string;
  cta: { href: string; label: string };
}) {
  return (
    <section className="admin-card space-y-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-primary">
        <ShieldCheck size={15} className="text-emerald-700" aria-hidden />
        {title}
      </h2>

      <dl className="space-y-2.5 text-sm">
        {rows.map((row) => (
          <div key={row.key} className="flex items-baseline justify-between gap-3">
            <dt className="text-ink-muted">{row.label}</dt>
            <dd
              className={[
                "text-right",
                row.highlight
                  ? "font-semibold text-accent-700"
                  : row.muted
                    ? "text-ink-muted"
                    : "font-medium text-primary",
              ].join(" ")}
            >
              {row.value}
            </dd>
          </div>
        ))}
      </dl>

      <p className="rounded-xs bg-surface-muted/70 px-3.5 py-3 text-xs leading-relaxed text-ink-muted">
        {note}
      </p>

      <Link href={cta.href} className="admin-btn-ghost w-full justify-center py-2! text-sm">
        {cta.label}
      </Link>
    </section>
  );
}
