"use client";

/**
 * components/admin/NotificationMatrix.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The seven notification rows and their two channels.
 *
 * A row whose event needs a scheduler renders its switches disabled with
 * the reason beside it. That is the whole design decision on this screen:
 * the alternative — leaving the switch live and letting somebody turn on a
 * notification that will never arrive — is the kind of control that makes
 * a person distrust every other switch on the page.
 *
 * The email column is dimmed as a whole when SMTP is not configured, for
 * the same reason: the preference is still saved and still correct, but
 * nothing will be sent until the server has a mail host.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Info, Loader2 } from "lucide-react";
import { updateNotificationPrefs } from "@/app/[locale]/admin/(system)/settings/notifications/actions";
import type { NotificationChannel, NotificationPrefs } from "@/lib/notifications";

type Row = { key: string; label: string; needsScheduler: boolean };

type Props = {
  locale: string;
  rows: Row[];
  prefs: NotificationPrefs;
  emailConfigured: boolean;
  labels: {
    email: string;
    inApp: string;
    needsScheduler: string;
    emailNotConfigured: string;
    save: string;
    saved: string;
    error: string;
    deliveryNote: string;
  };
};

export default function NotificationMatrix({
  locale,
  rows,
  prefs: initial,
  emailConfigured,
  labels,
}: Props) {
  const router = useRouter();
  const [prefs, setPrefs] = useState<NotificationPrefs>(initial);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [pending, startTransition] = useTransition();

  const toggle = (key: string, channel: NotificationChannel) => {
    setStatus("idle");
    setPrefs((current) => ({
      ...current,
      [key]: { ...current[key], [channel]: !current[key]?.[channel] },
    }));
  };

  const save = () => {
    setStatus("idle");
    startTransition(async () => {
      const result = await updateNotificationPrefs(locale, prefs);
      setStatus(result.ok ? "saved" : "error");
      if (result.ok) router.refresh();
    });
  };

  const Switch = ({
    on,
    disabled,
    label,
    onChange,
  }: {
    on: boolean;
    disabled: boolean;
    label: string;
    onChange: () => void;
  }) => (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={[
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
        disabled ? "cursor-not-allowed bg-primary/10" : on ? "bg-emerald-500" : "bg-primary/20",
      ].join(" ")}
    >
      <span
        className={[
          "inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-xs transition-transform",
          on && !disabled ? "translate-x-[18px]" : "translate-x-[3px]",
        ].join(" ")}
      />
    </button>
  );

  return (
    <div className="space-y-4">
      <section className="admin-card p-0!">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-primary/10 text-xs uppercase tracking-wide text-ink-muted">
              <th className="px-5 py-3 text-left font-medium" />
              <th className="w-28 px-4 py-3 text-center font-medium">
                <span className={emailConfigured ? "" : "text-ink-muted/60"}>{labels.email}</span>
              </th>
              <th className="w-28 px-4 py-3 text-center font-medium">{labels.inApp}</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-primary/5">
            {rows.map((row) => {
              const value = prefs[row.key] ?? { email: false, inApp: false };

              return (
                <tr key={row.key} className={row.needsScheduler ? "bg-surface-muted/40" : ""}>
                  <td className="px-5 py-3.5">
                    <p
                      className={`text-sm ${row.needsScheduler ? "text-ink-muted" : "text-ink"}`}
                    >
                      {row.label}
                    </p>
                    {row.needsScheduler && (
                      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-amber-800">
                        <AlertTriangle size={11} aria-hidden />
                        {labels.needsScheduler}
                      </p>
                    )}
                  </td>

                  <td className="px-4 py-3.5 text-center">
                    <Switch
                      on={value.email && !row.needsScheduler}
                      disabled={row.needsScheduler}
                      label={`${row.label} — ${labels.email}`}
                      onChange={() => toggle(row.key, "email")}
                    />
                  </td>

                  <td className="px-4 py-3.5 text-center">
                    <Switch
                      on={value.inApp && !row.needsScheduler}
                      disabled={row.needsScheduler}
                      label={`${row.label} — ${labels.inApp}`}
                      onChange={() => toggle(row.key, "inApp")}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {!emailConfigured && (
        <p className="flex items-start gap-2 rounded-xs border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden />
          {labels.emailNotConfigured}
        </p>
      )}

      <p className="flex items-start gap-2 text-xs leading-relaxed text-ink-muted">
        <Info size={13} className="mt-0.5 shrink-0" aria-hidden />
        {labels.deliveryNote}
      </p>

      <div className="flex items-center gap-3">
        <button type="button" onClick={save} disabled={pending} className="admin-btn py-2! text-sm">
          {pending ? (
            <Loader2 size={14} className="animate-spin" aria-hidden />
          ) : (
            <Check size={14} aria-hidden />
          )}
          {labels.save}
        </button>

        {status === "saved" && (
          <span className="flex items-center gap-1.5 text-xs text-emerald-700">
            <Check size={13} aria-hidden />
            {labels.saved}
          </span>
        )}

        {status === "error" && (
          <span className="flex items-center gap-1.5 text-xs text-red-700">
            <AlertTriangle size={13} aria-hidden />
            {labels.error}
          </span>
        )}
      </div>
    </div>
  );
}
