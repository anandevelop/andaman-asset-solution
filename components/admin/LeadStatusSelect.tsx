"use client";

/**
 * components/admin/LeadStatusSelect.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Inline status change: the status pill is the button, and its menu lists
 * the stages. Optimistic — the pill changes at once and only snaps back if
 * the server action refuses — because a sales team working a list of fifty
 * leads should never wait on a round-trip per row.
 *
 * A tier-1 action (see UndoToast): no confirm, eight seconds to undo, when
 * the caller passes `undoable`. The undo is just another
 * updateLeadStatus, so it is checked and logged like the change was.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { LeadStatus } from "@prisma/client";
import { ChevronDown, Loader2 } from "lucide-react";
import { updateLeadStatus } from "@/app/[locale]/admin/(crm)/leads/actions";
import { LEAD_STATUS_DOT, LEAD_STATUS_PILL } from "@/lib/admin/lead-status-tone";
import PopoverMenu from "@/components/admin/PopoverMenu";
import { showUndoToast } from "@/components/admin/UndoToast";

type Props = {
  locale: string;
  leadId: string;
  value: LeadStatus;
  labels: Record<LeadStatus, string>;
  errorLabel: string;
  /** Offer the undo toast after a change (tier 1). */
  undoable?: boolean;
};

export default function LeadStatusSelect({ locale, leadId, value, labels, errorLabel, undoable = false }: Props) {
  const router = useRouter();
  const t = useTranslations("admin.leads.table");
  const [current, setCurrent] = useState<LeadStatus>(value);
  const [pending, startTransition] = useTransition();

  const change = (next: LeadStatus, previous: LeadStatus) => {
    setCurrent(next);
    startTransition(async () => {
      const result = await updateLeadStatus(locale, leadId, next);
      if (!result.ok) {
        setCurrent(previous);
        showUndoToast({ message: errorLabel });
        return;
      }
      router.refresh();
      if (undoable) {
        showUndoToast({
          message: t("statusChanged", { status: labels[next] }),
          onUndo: async () => {
            const reverted = await updateLeadStatus(locale, leadId, previous);
            if (!reverted.ok) throw new Error("undo refused");
            setCurrent(previous);
            router.refresh();
          },
        });
      }
    });
  };

  return (
    <PopoverMenu
      label={labels[current]}
      disabled={pending}
      buttonClassName={`inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[11.5px] font-medium transition-opacity hover:opacity-85 disabled:opacity-60 ${LEAD_STATUS_PILL[current]}`}
      buttonContent={
        <>
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
          {labels[current]}
          {pending ? (
            <Loader2 size={11} className="animate-spin" aria-hidden />
          ) : (
            <ChevronDown size={11} aria-hidden className="opacity-70" />
          )}
        </>
      }
      options={Object.values(LeadStatus).map((status) => ({
        value: status,
        label: labels[status],
        dotClassName: LEAD_STATUS_DOT[status],
      }))}
      selected={current}
      onSelect={(next) => change(next as LeadStatus, current)}
    />
  );
}
