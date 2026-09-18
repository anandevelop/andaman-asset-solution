"use client";

/**
 * components/admin/LeadFollowUpInput.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * A bare <input type="date"> that saves on change/blur via setLeadFollowUp
 * — no separate save button in the table row (LeadDetail's copy of this
 * gets an explicit one, see that page). Overdue styling is computed from
 * `value` alone, no server round-trip needed to know a date is in the past.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useState, useTransition } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { setLeadFollowUp } from "@/app/[locale]/admin/(crm)/leads/actions";

type Props = {
  locale: string;
  leadId: string;
  value: string | null; // "YYYY-MM-DD" or null
  overdueLabel: string;
  errorLabel: string;
};

function toDateInputValue(value: string | null): string {
  return value ?? "";
}

export default function LeadFollowUpInput({
  locale,
  leadId,
  value,
  overdueLabel,
  errorLabel,
}: Props) {
  const [current, setCurrent] = useState(toDateInputValue(value));
  const [state, setState] = useState<"idle" | "error">("idle");
  const [pending, startTransition] = useTransition();

  const isOverdue =
    current.length > 0 && new Date(current) < new Date(new Date().toDateString());

  function onChange(event: React.ChangeEvent<HTMLInputElement>) {
    const next = event.target.value;
    const previous = current;

    setCurrent(next);
    setState("idle");

    startTransition(async () => {
      const result = await setLeadFollowUp(locale, leadId, next);
      if (!result.ok) {
        setCurrent(previous);
        setState("error");
      }
    });
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="date"
        value={current}
        onChange={onChange}
        disabled={pending}
        className={`rounded-xs border px-2 py-1 text-xs transition-colors focus:outline-hidden focus:ring-1 focus:ring-primary/30 disabled:opacity-60 ${
          isOverdue
            ? "border-red-300 bg-red-50 text-red-800"
            : "border-primary/15 bg-surface-raised text-primary"
        }`}
      />
      {pending && <Loader2 size={13} className="animate-spin text-ink-muted" aria-hidden />}
      {!pending && isOverdue && (
        <span className="text-[11px] font-medium text-red-700">{overdueLabel}</span>
      )}
      {!pending && state === "error" && (
        <span title={errorLabel}>
          <AlertCircle size={13} className="text-red-600" aria-hidden />
        </span>
      )}
    </div>
  );
}
