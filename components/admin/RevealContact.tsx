"use client";

/**
 * components/admin/RevealContact.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * A lead's phone or email, masked, with a "show" button that asks the
 * server for the real value — revealLeadContact, which checks scope and
 * writes the audit row. The value lives in this component's state only:
 * it is not cached, not put in the URL, and gone on the next navigation,
 * so a second look is a second (logged) reveal.
 *
 * Also exports revealThen(), which the drawer's call and WhatsApp buttons
 * use: dialling a number is looking at it, and is logged the same way.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useState, useTransition } from "react";
import { Eye, Loader2 } from "lucide-react";
import { revealLeadContact } from "@/app/[locale]/admin/(crm)/leads/actions";
import { showUndoToast } from "@/components/admin/UndoToast";

export async function revealThen(
  leadId: string,
  field: "email" | "phone",
  onValue: (value: string) => void,
  failedMessage: string,
) {
  const result = await revealLeadContact(leadId, field);
  if (result.ok) onValue(result.value);
  else showUndoToast({ message: failedMessage });
}

export default function RevealContact({
  leadId,
  field,
  masked,
  labels,
}: {
  leadId: string;
  field: "email" | "phone";
  masked: string;
  labels: { show: string; failed: string };
}) {
  const [value, setValue] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (value) {
    return (
      <a href={`${field === "email" ? "mailto" : "tel"}:${value}`} className="admin-mono text-primary-500 hover:underline">
        {value}
      </a>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="admin-mono text-ink">{masked}</span>
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => revealThen(leadId, field, setValue, labels.failed))}
        className="inline-flex items-center gap-1 rounded-full border border-adm-line-strong px-2 py-0.5 text-[11px] font-medium text-ink-muted transition-colors hover:border-adm-info hover:text-adm-info disabled:opacity-60"
      >
        {pending ? <Loader2 size={11} className="animate-spin" aria-hidden /> : <Eye size={11} aria-hidden />}
        {labels.show}
      </button>
    </span>
  );
}
