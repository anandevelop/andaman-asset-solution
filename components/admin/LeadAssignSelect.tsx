"use client";

/**
 * components/admin/LeadAssignSelect.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Inline "assign to" change — same optimistic pattern as
 * LeadStatusSelect: the select moves immediately and only snaps back if
 * the server action rejects it (a SALES rep trying to reach into another
 * rep's lead, most commonly — see assignLead's file header).
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useState, useTransition } from "react";
import { Check, Loader2, AlertCircle } from "lucide-react";
import { assignLead } from "@/app/[locale]/admin/(crm)/leads/actions";

type Assignee = { id: string; name: string };

type Props = {
  locale: string;
  leadId: string;
  value: string | null;
  assignees: Assignee[];
  unassignedLabel: string;
  errorLabel: string;
};

export default function LeadAssignSelect({
  locale,
  leadId,
  value,
  assignees,
  unassignedLabel,
  errorLabel,
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
      const result = await assignLead(locale, leadId, next);

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
    <div className="flex items-center gap-2">
      <select
        value={current}
        onChange={onChange}
        disabled={pending}
        className="rounded-xs border border-adm-line-strong bg-adm-solid px-2.5 py-1.5 text-xs font-medium text-adm-text transition-colors focus:outline-hidden focus:ring-1 focus:ring-adm-info/30 disabled:opacity-60"
      >
        <option value="">{unassignedLabel}</option>
        {assignees.map((person) => (
          <option key={person.id} value={person.id}>
            {person.name}
          </option>
        ))}
      </select>

      {pending && <Loader2 size={14} className="animate-spin text-adm-muted" aria-hidden />}
      {!pending && state === "saved" && (
        <Check size={14} className="text-adm-success" aria-hidden />
      )}
      {!pending && state === "error" && (
        <span title={errorLabel}>
          <AlertCircle size={14} className="text-adm-danger" aria-hidden />
        </span>
      )}
    </div>
  );
}
