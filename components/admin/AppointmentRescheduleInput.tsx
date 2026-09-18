"use client";

/**
 * components/admin/AppointmentRescheduleInput.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * A single datetime-local input that saves on change — the "เลื่อน"
 * (postpone) action from the unassigned queue and any appointment card.
 * Same optimistic-save shape as the other inline editors in this admin;
 * see rescheduleAppointment's own scoping note in appointments/actions.ts.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { rescheduleAppointment } from "@/app/[locale]/admin/(crm)/appointments/actions";

type Props = {
  locale: string;
  id: string;
  value: string;
  label: string;
};

export default function AppointmentRescheduleInput({ locale, id, value, label }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className="text-[11px] font-medium text-accent-700 hover:underline"
      >
        {label}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      <input
        type="datetime-local"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        className="rounded-xs border border-primary/15 px-1.5 py-1 text-[11px]"
      />
      <button
        type="button"
        disabled={pending || !draft}
        onClick={() => {
          startTransition(async () => {
            const result = await rescheduleAppointment(locale, { id, scheduledAt: draft });
            if (result.ok) {
              setSaved(true);
              setOpen(false);
            }
          });
        }}
        className="admin-btn-ghost px-2 py-1 text-[11px]"
      >
        {pending ? <Loader2 size={12} className="animate-spin" aria-hidden /> : saved ? <Check size={12} aria-hidden /> : null}
      </button>
    </div>
  );
}
