"use client";

/**
 * components/admin/RegistrationStatusSelect.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Inline RSVP status change, mirroring LeadStatusSelect: optimistic, with
 * a rollback if the action fails. Working a door list on event day means
 * marking twenty people ATTENDED in a row — a round-trip per row would be
 * unusable.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useState, useTransition } from "react";
import { EventStatus } from "@prisma/client";
import { AlertCircle, Check, Loader2 } from "lucide-react";
import { updateRegistrationStatus } from "@/app/[locale]/admin/events/actions";

type Props = {
  locale: string;
  eventId: string;
  registrationId: string;
  value: EventStatus;
  labels: Record<EventStatus, string>;
  errorLabel: string;
};

const TONE: Record<EventStatus, string> = {
  PENDING: "border-accent-400 bg-accent-50 text-accent-700",
  CONFIRMED: "border-emerald-300 bg-emerald-50 text-emerald-800",
  ATTENDED: "border-primary/30 bg-primary/10 text-primary",
  CANCELLED: "border-primary/10 bg-surface-muted text-ink-muted",
  NO_SHOW: "border-red-200 bg-red-50 text-red-700",
};

export default function RegistrationStatusSelect({
  locale,
  eventId,
  registrationId,
  value,
  labels,
  errorLabel,
}: Props) {
  const [current, setCurrent] = useState<EventStatus>(value);
  const [state, setState] = useState<"idle" | "saved" | "error">("idle");
  const [pending, startTransition] = useTransition();

  function onChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const next = event.target.value as EventStatus;
    const previous = current;

    setCurrent(next);
    setState("idle");

    startTransition(async () => {
      const result = await updateRegistrationStatus(
        locale,
        eventId,
        registrationId,
        next,
      );

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
        aria-label={labels[current]}
        className={`rounded-sm border px-2.5 py-1.5 text-xs font-medium transition-colors focus:outline-none focus:ring-1 focus:ring-primary/30 disabled:opacity-60 ${TONE[current]}`}
      >
        {Object.values(EventStatus).map((status) => (
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
