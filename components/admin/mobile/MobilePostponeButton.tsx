"use client";

/**
 * components/admin/mobile/MobilePostponeButton.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * One-tap "push to tomorrow" for a due-today lead on the mobile queue —
 * just setLeadFollowUp with tomorrow's date, the same action the desktop
 * follow-up date picker already calls.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { setLeadFollowUp } from "@/app/[locale]/admin/(crm)/leads/actions";

type Props = { locale: string; leadId: string; label: string };

export default function MobilePostponeButton({ locale, leadId, label }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onClick() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const iso = tomorrow.toISOString().slice(0, 10);

    startTransition(async () => {
      const result = await setLeadFollowUp(locale, leadId, iso);
      if (result.ok) router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xs border border-primary/20 text-sm font-medium text-primary disabled:opacity-60"
    >
      {pending && <Loader2 size={14} className="animate-spin" aria-hidden />}
      {label}
    </button>
  );
}
