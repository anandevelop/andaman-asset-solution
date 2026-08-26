"use client";

/**
 * components/admin/LeadStatusSelect.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Inline status change. Optimistic: the select moves immediately and only
 * snaps back if the server action fails, because a sales team working a
 * list of fifty leads should never wait on a round-trip per row.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useState, useTransition } from "react";
import { LeadStatus } from "@prisma/client";
import { Check, Loader2, AlertCircle } from "lucide-react";
import { updateLeadStatus } from "@/app/[locale]/admin/leads/actions";

type Props = {
  locale: string;
  leadId: string;
  value: LeadStatus;
  labels: Record<LeadStatus, string>;
  errorLabel: string;
};

/** Colour carries the pipeline stage at a glance, before the label is read. */
const TONE: Record<LeadStatus, string> = {
  NEW: "border-accent-400 bg-accent-50 text-accent-700",
  CONTACTED: "border-primary/20 bg-primary/5 text-primary",
  QUALIFIED: "border-primary/20 bg-primary/5 text-primary",
  VIEWING_SCHEDULED: "border-primary/30 bg-primary/10 text-primary",
  NEGOTIATING: "border-primary/30 bg-primary/10 text-primary",
  WON: "border-emerald-300 bg-emerald-50 text-emerald-800",
  LOST: "border-primary/10 bg-surface-muted text-ink-muted",
};

export default function LeadStatusSelect({
  locale,
  leadId,
  value,
  labels,
  errorLabel,
}: Props) {
  const [current, setCurrent] = useState<LeadStatus>(value);
  const [state, setState] = useState<"idle" | "saved" | "error">("idle");
  const [pending, startTransition] = useTransition();

  function onChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const next = event.target.value as LeadStatus;
    const previous = current;

    setCurrent(next);
    setState("idle");

    startTransition(async () => {
      const result = await updateLeadStatus(locale, leadId, next);

      if (result.ok) {
        setState("saved");
        // Clear the tick so the row settles back to a neutral state.
        setTimeout(() => setState("idle"), 2000);
      } else {
        setCurrent(previous);
        setState("error");
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={current}
        onChange={onChange}
        disabled={pending}
        aria-label={labels[current]}
        className={`rounded-sm border px-2.5 py-1.5 text-xs font-medium transition-colors focus:outline-none focus:ring-1 focus:ring-primary/30 disabled:opacity-60 ${TONE[current]}`}
      >
        {Object.values(LeadStatus).map((status) => (
          <option key={status} value={status}>
            {labels[status]}
          </option>
        ))}
      </select>

      {pending && <Loader2 size={14} className="animate-spin text-ink-muted" aria-hidden />}
      {!pending && state === "saved" && (
        <Check size={14} className="text-emerald-600" aria-hidden />
      )}
      {!pending && state === "error" && (
        <span title={errorLabel}>
          <AlertCircle size={14} className="text-red-600" aria-hidden />
        </span>
      )}
    </div>
  );
}
