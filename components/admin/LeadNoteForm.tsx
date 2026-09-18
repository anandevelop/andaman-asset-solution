"use client";

/**
 * components/admin/LeadNoteForm.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Adds one timestamped entry to a lead's activity timeline. Deliberately
 * not optimistic like the inline selects above — a note is new content,
 * not a value flipping between known states, so it only appears once the
 * server has actually stored it (router.refresh() re-fetches the list).
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { addLeadNote } from "@/app/[locale]/admin/(crm)/leads/actions";

type Props = {
  locale: string;
  leadId: string;
  placeholder: string;
  submitLabel: string;
  errorLabel: string;
};

export default function LeadNoteForm({
  locale,
  leadId,
  placeholder,
  submitLabel,
  errorLabel,
}: Props) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;

    setError(false);

    startTransition(async () => {
      const result = await addLeadNote(locale, leadId, trimmed);
      if (result.ok) {
        setBody("");
        router.refresh();
      } else {
        setError(true);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder={placeholder}
        rows={3}
        disabled={pending}
        className="admin-input w-full resize-none"
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || body.trim().length === 0}
          className="admin-btn text-xs px-4 py-2"
        >
          {pending && <Loader2 size={14} className="animate-spin" aria-hidden />}
          {submitLabel}
        </button>
        {error && <span className="text-xs text-red-700">{errorLabel}</span>}
      </div>
    </form>
  );
}
