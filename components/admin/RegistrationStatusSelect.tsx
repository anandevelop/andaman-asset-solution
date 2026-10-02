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
import { updateRegistrationStatus } from "@/app/[locale]/admin/(content)/events/actions";

type Props = {
  locale: string;
  eventId: string;
  registrationId: string;
  value: EventStatus;
  labels: Record<EventStatus, string>;
  errorLabel: string;
};

const TONE: Record<EventStatus, string> = {
  PENDING: "border-accent-400 bg-adm-fill/15 text-adm-accent-ink",
  CONFIRMED: "border-adm-success/30 bg-adm-success-bg text-adm-success",
  ATTENDED: "border-adm-line-strong bg-adm-text/10 text-adm-text",
  CANCELLED: "border-adm-line bg-adm-text/4 text-adm-muted",
  NO_SHOW: "border-adm-danger/30 bg-adm-danger-bg text-adm-danger",
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
        className={`rounded-xs border px-2.5 py-1.5 text-xs font-medium transition-colors focus:outline-hidden focus:ring-1 focus:ring-adm-info/30 disabled:opacity-60 ${TONE[current]}`}
      >
        {Object.values(EventStatus).map((status) => (
          <option key={status} value={status}>
            {labels[status]}
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
