"use client";

/**
 * components/admin/mobile/MobileClaimLeadButton.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * One-tap "claim" on an unassigned lead in the mobile queue — calls the
 * same assignLead action the desktop LeadAssignSelect uses, just always
 * targeting the caller's own id (which is all a SALES session is allowed
 * to do with an unassigned lead anyway — see assignLead's file header).
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { assignLead } from "@/app/[locale]/admin/(crm)/leads/actions";

type Props = { locale: string; leadId: string; userId: string; label: string };

export default function MobileClaimLeadButton({ locale, leadId, userId, label }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onClick() {
    startTransition(async () => {
      const result = await assignLead(locale, leadId, userId);
      if (result.ok) router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="flex min-h-[40px] shrink-0 items-center justify-center gap-2 rounded-xs bg-primary px-3.5 text-xs font-medium text-white disabled:opacity-60"
    >
      {pending && <Loader2 size={13} className="animate-spin" aria-hidden />}
      {label}
    </button>
  );
}
