"use client";

/**
 * components/admin/mobile/MobileCheckInButton.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * "Check in" on today's appointment card. The schema has no separate
 * checked-in sub-state (AppointmentStatus is REQUESTED / CONFIRMED /
 * COMPLETED / CANCELLED / NO_SHOW) — COMPLETED is the meaningful
 * transition when a rep is standing in front of the client, so this
 * calls the same updateAppointmentStatus the desktop calendar uses,
 * just with that one status baked in.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { updateAppointmentStatus } from "@/app/[locale]/admin/(crm)/appointments/actions";

type Props = { locale: string; appointmentId: string; label: string };

export default function MobileCheckInButton({ locale, appointmentId, label }: Props) {
  const router = useRouter();
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  function onClick() {
    startTransition(async () => {
      const result = await updateAppointmentStatus(locale, { id: appointmentId, status: "COMPLETED" });
      if (result.ok) {
        setDone(true);
        router.refresh();
      }
    });
  }

  if (done) {
    return (
      <span className="flex min-h-[44px] flex-1 items-center justify-center rounded-xs bg-emerald-50 text-emerald-800">
        <Check size={16} aria-hidden />
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xs border border-primary/20 text-sm font-medium text-primary disabled:opacity-60"
    >
      {pending ? <Loader2 size={14} className="animate-spin" aria-hidden /> : label}
    </button>
  );
}
