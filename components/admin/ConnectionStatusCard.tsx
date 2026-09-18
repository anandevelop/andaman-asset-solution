"use client";

/**
 * components/admin/ConnectionStatusCard.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * "สถานะการเชื่อมต่อ" — the seven services, their state, and the one action
 * each row can actually offer.
 *
 * A client component for exactly one reason: the email row's "ทดสอบ" button
 * sends a real test message and reports what happened, which needs state.
 * Everything else is a dot, a line of text the server already formatted,
 * and a link out.
 *
 * A row that is not configured shows the environment variable that would
 * switch it on rather than a button. There is nothing this screen can do
 * about a missing REDIS_URL — that is a deploy, not a form — and a
 * "ตั้งค่า" button that opens nothing would be the one dishonest thing on a
 * panel whose whole job is to be trusted.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useState, useTransition } from "react";
import { AlertTriangle, Check, ExternalLink, Loader2 } from "lucide-react";
import { sendTestEmail } from "@/app/[locale]/admin/(system)/settings/actions";
import type { HealthRow, HealthState } from "@/lib/admin/system-health";

const DOT: Record<HealthState, string> = {
  ok: "bg-emerald-500",
  attention: "bg-amber-500",
  off: "bg-ink-muted/35",
};

type Props = {
  locale: string;
  rows: HealthRow[];
  title: string;
  /** row key → the detail line, already formatted and translated. */
  details: Record<string, string>;
  /** row key → the service's display name. */
  names: Record<string, string>;
  labels: {
    test: string;
    open: string;
    notConfigured: string;
    setVia: string;
    storageNote: string;
  };
};

export default function ConnectionStatusCard({
  locale,
  rows,
  title,
  details,
  names,
  labels,
}: Props) {
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const test = () => {
    setResult(null);
    startTransition(async () => {
      const outcome = await sendTestEmail(locale);
      setResult({ ok: outcome.ok, message: outcome.message });
    });
  };

  return (
    <section className="admin-card space-y-4">
      <h2 className="text-sm font-semibold text-primary">{title}</h2>

      <ul className="space-y-3.5">
        {rows.map((row) => (
          <li key={row.key} className="flex items-start gap-2.5">
            <span
              className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT[row.state]}`}
              aria-hidden
            />

            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-primary">{names[row.key]}</p>
              <p
                className={`mt-0.5 text-xs leading-relaxed ${
                  row.state === "off" ? "text-ink-muted" : "text-ink-muted"
                }`}
              >
                {details[row.key]}
              </p>

              {row.state === "off" && row.envVar && (
                <p className="mt-1 text-xs text-ink-muted/80">
                  {labels.setVia} <code className="font-mono">{row.envVar}</code>
                </p>
              )}

              {row.key === "storage" && row.state === "ok" && (
                <p className="mt-1 text-xs text-ink-muted/80">{labels.storageNote}</p>
              )}
            </div>

            {row.key === "email" && row.state === "ok" && (
              <button
                type="button"
                onClick={test}
                disabled={pending}
                className="admin-btn-ghost shrink-0 px-2.5! py-1! text-xs"
              >
                {pending ? <Loader2 size={12} className="animate-spin" aria-hidden /> : null}
                {labels.test}
              </button>
            )}

            {row.externalHref && (
              <a
                href={row.externalHref}
                target="_blank"
                rel="noreferrer"
                className="admin-btn-ghost shrink-0 px-2.5! py-1! text-xs"
              >
                {labels.open}
                <ExternalLink size={11} aria-hidden />
              </a>
            )}
          </li>
        ))}
      </ul>

      {result && (
        <p
          className={[
            "flex items-start gap-2 rounded-xs px-3 py-2.5 text-xs leading-relaxed",
            result.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800",
          ].join(" ")}
        >
          {result.ok ? (
            <Check size={13} className="mt-0.5 shrink-0" aria-hidden />
          ) : (
            <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden />
          )}
          {result.message}
        </p>
      )}
    </section>
  );
}
