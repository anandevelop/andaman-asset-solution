"use client";

/**
 * components/admin/UnitStatusSelect.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Inline status editor for one row on the units list — a single <select>
 * wrapped in its own <form>, submitted via requestSubmit() the moment
 * the value changes. No visible Save button: a status flip is a
 * one-field change an admin expects to take effect immediately.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useActionState, useRef } from "react";
import type { UnitStatusFormState } from "@/app/[locale]/admin/projects/[id]/units/actions";

type Props = {
  action: (state: UnitStatusFormState, formData: FormData) => Promise<UnitStatusFormState>;
  status: "AVAILABLE" | "RESERVED" | "SOLD";
  labels: { AVAILABLE: string; RESERVED: string; SOLD: string };
};

const INITIAL: UnitStatusFormState = { ok: false };

export default function UnitStatusSelect({ action, status, labels }: Props) {
  const [, formAction] = useActionState(action, INITIAL);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={formAction}>
      <select
        name="status"
        defaultValue={status}
        onChange={() => formRef.current?.requestSubmit()}
        className="rounded-sm border border-primary/15 bg-surface-raised px-2.5 py-1.5 text-xs text-ink focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20"
      >
        <option value="AVAILABLE">{labels.AVAILABLE}</option>
        <option value="RESERVED">{labels.RESERVED}</option>
        <option value="SOLD">{labels.SOLD}</option>
      </select>
    </form>
  );
}
