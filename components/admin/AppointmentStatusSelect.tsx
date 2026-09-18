"use client";

/**
 * components/admin/AppointmentStatusSelect.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Inline status change on an appointment card — same optimistic pattern as
 * LeadStatusSelect: the select moves immediately and snaps back only if
 * the server action refuses it (most commonly a SALES rep touching a
 * colleague's appointment).
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useState, useTransition } from "react";
import { AppointmentStatus } from "@prisma/client";
import { updateAppointmentStatus } from "@/app/[locale]/admin/(crm)/appointments/actions";

type Props = {
  locale: string;
  id: string;
  value: AppointmentStatus;
  labels: Record<AppointmentStatus, string>;
  className?: string;
};

export default function AppointmentStatusSelect({ locale, id, value, labels, className }: Props) {
  const [current, setCurrent] = useState(value);
  const [pending, startTransition] = useTransition();

  function onChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const next = event.target.value as AppointmentStatus;
    const previous = current;
    setCurrent(next);

    startTransition(async () => {
      const result = await updateAppointmentStatus(locale, { id, status: next });
      if (!result.ok) setCurrent(previous);
    });
  }

  return (
    <select
      value={current}
      onChange={onChange}
      disabled={pending}
      onClick={(e) => e.stopPropagation()}
      className={className ?? "rounded-xs border border-primary/15 bg-white px-1.5 py-1 text-[10.5px] text-ink"}
    >
      {Object.entries(labels).map(([key, label]) => (
        <option key={key} value={key}>
          {label}
        </option>
      ))}
    </select>
  );
}
