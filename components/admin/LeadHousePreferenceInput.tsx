"use client";

/**
 * components/admin/LeadHousePreferenceInput.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * A bare text input that saves via setHousePreference — same optimistic,
 * no-separate-save-button pattern as LeadFollowUpInput, except saving on
 * blur rather than on every keystroke: a date picker's onChange fires once
 * per pick, but a text field's would fire once per character, turning a
 * sentence into a request per letter.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useState, useTransition } from "react";
import { Loader2, AlertCircle, Check } from "lucide-react";
import { setHousePreference } from "@/app/[locale]/admin/(crm)/leads/actions";

type Props = {
  locale: string;
  leadId: string;
  value: string | null;
  placeholder: string;
  errorLabel: string;
};

export default function LeadHousePreferenceInput({
  locale,
  leadId,
  value,
  placeholder,
  errorLabel,
}: Props) {
  const [current, setCurrent] = useState(value ?? "");
  const [saved, setSaved] = useState(value ?? "");
  const [state, setState] = useState<"idle" | "saved" | "error">("idle");
  const [pending, startTransition] = useTransition();

  function onBlur() {
    if (current === saved) return;

    const previous = saved;
    setState("idle");

    startTransition(async () => {
      const result = await setHousePreference(locale, leadId, current);
      if (result.ok) {
        setSaved(current);
        setState("saved");
        setTimeout(() => setState("idle"), 2000);
      } else {
        setCurrent(previous);
        setSaved(previous);
        setState("error");
      }
    });
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="text"
        value={current}
        onChange={(event) => setCurrent(event.target.value)}
        onBlur={onBlur}
        disabled={pending}
        placeholder={placeholder}
        className="admin-input flex-1 py-1.5! text-sm disabled:opacity-60"
      />
      {pending && <Loader2 size={13} className="shrink-0 animate-spin text-ink-muted" aria-hidden />}
      {!pending && state === "saved" && (
        <Check size={13} className="shrink-0 text-emerald-600" aria-hidden />
      )}
      {!pending && state === "error" && (
        <span title={errorLabel} className="shrink-0">
          <AlertCircle size={13} className="text-red-600" aria-hidden />
        </span>
      )}
    </div>
  );
}
