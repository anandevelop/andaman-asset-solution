"use client";

/**
 * components/admin/LeadNextStepCard.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The drawer's "ขั้นถัดไปที่แนะนำ" card: the suggestion from
 * lib/admin/lead-next-step.ts (worded by the server), the one button that
 * does it, and the three quick actions every lead gets — call, WhatsApp,
 * book a viewing.
 *
 * Call and WhatsApp go through revealThen(): the number is masked on
 * screen, and dialling it is a reveal like any other, audited. After a
 * call the composer is opened on its Call tab, since the next thing a rep
 * does after hanging up is write down what was said.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, MessageCircle, Phone, Sparkles } from "lucide-react";
import { assignLead } from "@/app/[locale]/admin/(crm)/leads/actions";
import { updateAppointmentStatus } from "@/app/[locale]/admin/(crm)/appointments/actions";
import { whatsAppDigits } from "@/lib/contact-mask";
import { focusComposer } from "@/components/admin/LeadActivityComposer";
import { revealThen } from "@/components/admin/RevealContact";
import { showUndoToast } from "@/components/admin/UndoToast";

export type NextStepAction =
  | { kind: "claim"; userId: string }
  | { kind: "closeAppointment"; appointmentId: string }
  | null;

type Labels = {
  title: string;
  call: string;
  whatsapp: string;
  scheduleViewing: string;
  claim: string;
  visited: string;
  noShow: string;
  claimed: string;
  closedVisited: string;
  closedNoShow: string;
  failed: string;
  revealFailed: string;
};

export default function LeadNextStepCard({
  locale,
  leadId,
  headline,
  detail,
  action,
  canContact,
  labels,
}: {
  locale: string;
  leadId: string;
  /** null = no suggestion; the quick actions still show. */
  headline: string | null;
  detail: string | null;
  action: NextStepAction;
  /** viewCustomerContact — without it, call and WhatsApp are not offered. */
  canContact: boolean;
  labels: Labels;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const run = (message: string, doIt: () => Promise<{ ok: boolean }>, undo: () => Promise<{ ok: boolean }>) =>
    startTransition(async () => {
      const result = await doIt();
      if (!result.ok) {
        showUndoToast({ message: labels.failed });
        return;
      }
      router.refresh();
      showUndoToast({
        message,
        onUndo: async () => {
          if (!(await undo()).ok) throw new Error("undo refused");
          router.refresh();
        },
      });
    });

  const closeAppointment = (appointmentId: string, status: "COMPLETED" | "NO_SHOW") =>
    run(
      status === "COMPLETED" ? labels.closedVisited : labels.closedNoShow,
      () => updateAppointmentStatus(locale, { id: appointmentId, status }),
      () => updateAppointmentStatus(locale, { id: appointmentId, status: "REQUESTED" }),
    );

  return (
    <section className="rounded-card border border-adm-fill/40 bg-linear-to-br from-adm-fill/10 to-transparent p-4">
      <p className="flex items-center gap-1.5 text-[11.5px] font-medium text-adm-accent-ink">
        <Sparkles size={13} aria-hidden />
        {labels.title}
      </p>

      {headline && (
        <>
          <p className="mt-1.5 text-sm font-semibold text-ink">{headline}</p>
          {detail && <p className="mt-0.5 text-xs text-ink-muted">{detail}</p>}
        </>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {action?.kind === "claim" && (
          <button
            type="button"
            disabled={pending}
            className="admin-btn"
            onClick={() =>
              run(
                labels.claimed,
                () => assignLead(locale, leadId, action.userId),
                () => assignLead(locale, leadId, ""),
              )
            }
          >
            {labels.claim}
          </button>
        )}
        {action?.kind === "closeAppointment" && (
          <>
            <button
              type="button"
              disabled={pending}
              className="admin-btn"
              onClick={() => closeAppointment(action.appointmentId, "COMPLETED")}
            >
              {labels.visited}
            </button>
            <button
              type="button"
              disabled={pending}
              className="admin-btn-ghost"
              onClick={() => closeAppointment(action.appointmentId, "NO_SHOW")}
            >
              {labels.noShow}
            </button>
          </>
        )}

        {canContact && (
          <>
            <button
              type="button"
              className="admin-btn-ghost"
              onClick={() =>
                revealThen(
                  leadId,
                  "phone",
                  (phone) => {
                    window.location.href = `tel:${phone}`;
                    focusComposer("CALL");
                  },
                  labels.revealFailed,
                )
              }
            >
              <Phone size={14} aria-hidden />
              {labels.call}
            </button>
            <button
              type="button"
              className="admin-btn-ghost"
              onClick={() =>
                revealThen(
                  leadId,
                  "phone",
                  (phone) => {
                    const url = `https://wa.me/${whatsAppDigits(phone)}`;
                    // Opened after an await, which some browsers no longer
                    // count as the click — fall back to this tab. Not the
                    // "noopener" feature: with it window.open always
                    // returns null, so the fallback could not tell.
                    const tab = window.open(url, "_blank");
                    if (tab) tab.opener = null;
                    else window.location.href = url;
                  },
                  labels.revealFailed,
                )
              }
            >
              <MessageCircle size={14} aria-hidden />
              {labels.whatsapp}
            </button>
          </>
        )}
        <button type="button" className="admin-btn-ghost" onClick={() => focusComposer("APPOINTMENT")}>
          <CalendarPlus size={14} aria-hidden />
          {labels.scheduleViewing}
        </button>
      </div>
    </section>
  );
}
