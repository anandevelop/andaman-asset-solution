"use client";

/**
 * components/admin/AppointmentAssignSelect.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Same optimistic assign pattern as LeadAssignSelect, pointed at
 * appointments/actions.ts's assignAppointment instead — see that file's
 * header for the SALES-role scoping (claim unassigned, or reassign when
 * EDITOR+).
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useState, useTransition } from "react";
import { Check, Loader2, AlertCircle } from "lucide-react";
import { assignAppointment } from "@/app/[locale]/admin/(crm)/appointments/actions";

type Assignee = { id: string; name: string };

type Props = {
  locale: string;
  appointmentId: string;
  value: string | null;
  assignees: Assignee[];
  unassignedLabel: string;
  errorLabel: string;
  className?: string;
};

export default function AppointmentAssignSelect({
  locale,
  appointmentId,
  value,
  assignees,
  unassignedLabel,
  errorLabel,
  className,
}: Props) {
  const [current, setCurrent] = useState<string>(value ?? "");
  const [state, setState] = useState<"idle" | "saved" | "error">("idle");
  const [pending, startTransition] = useTransition();

  function onChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const next = event.target.value;
    const previous = current;

    setCurrent(next);
    setState("idle");

    startTransition(async () => {
      const result = await assignAppointment(locale, { id: appointmentId, assignedToId: next });

      if (result.ok) {
        setState("saved");
        setTimeout(() => setState("idle"), 2000);
      } else {
        setCurrent(previous);
        setState("error");
      }
    });
  }

  return (
    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      <select
        value={current}
        onChange={onChange}
        disabled={pending}
        className={
          className ??
          "rounded-xs border border-primary/15 bg-surface-raised px-2 py-1 text-[11px] font-medium text-primary disabled:opacity-60"
        }
      >
        <option value="">{unassignedLabel}</option>
        {assignees.map((person) => (
          <option key={person.id} value={person.id}>
            {person.name}
          </option>
        ))}
      </select>
      {pending && <Loader2 size={12} className="animate-spin text-ink-muted" aria-hidden />}
      {!pending && state === "saved" && <Check size={12} className="text-emerald-600" aria-hidden />}
      {!pending && state === "error" && (
        <span title={errorLabel}>
          <AlertCircle size={12} className="text-red-600" aria-hidden />
        </span>
      )}
    </div>
  );
}
