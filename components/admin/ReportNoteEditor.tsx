"use client";

/**
 * components/admin/ReportNoteEditor.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * "What we should do this month", before it goes out.
 *
 * The textarea starts on whatever exists: a saved note, or — when nobody
 * has written one — the text the system drafted from this month's figures,
 * handed in as `draft`. Both are editable and the difference is visible,
 * because a person about to send this to the CEO needs to know whether
 * they are reading their colleague's sentences or a machine's.
 *
 * Saving is what makes it stop being a draft; the action sets the editor
 * and the label disappears. Until somebody saves, the report and the
 * scheduled email both carry "automatic draft" — never silently passing
 * off generated text as written.
 *
 * useActionState + useFormStatus against a server action, which is the
 * house pattern for every admin form here. Not react-hook-form.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Sparkles } from "lucide-react";
import type { NoteResult } from "@/app/[locale]/admin/(growth)/reports/actions";

export type NoteEditorLabels = {
  title: string;
  hint: string;
  draftBadge: string;
  editedBy: string;
  save: string;
  saving: string;
  saved: string;
  failed: string;
  tooLong: string;
  useDraft: string;
};

type Props = {
  labels: NoteEditorLabels;
  /** Bound server-side to locale, period, audience and report language. */
  action: (body: string) => Promise<NoteResult>;
  body: string;
  /** The system's proposal, offered when the note is empty or unchanged. */
  draft: string;
  isDraft: boolean;
  editedBy: string | null;
};

export default function ReportNoteEditor({
  labels,
  action,
  body,
  draft,
  isDraft,
  editedBy,
}: Props) {
  const [value, setValue] = useState(body.trim() === "" ? draft : body);

  const [state, formAction] = useActionState(
    async (_previous: NoteResult | null, formData: FormData) =>
      action(String(formData.get("body") ?? "")),
    null,
  );

  return (
    <form action={formAction} className="admin-card print:hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="admin-label mb-0">{labels.title}</h3>

        {isDraft ? (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-900">
            {labels.draftBadge}
          </span>
        ) : (
          editedBy && (
            <span className="text-[11px] text-ink-muted">
              {labels.editedBy} {editedBy}
            </span>
          )
        )}
      </div>

      <p className="admin-hint">{labels.hint}</p>

      <textarea
        name="body"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        rows={6}
        className="admin-textarea mt-3"
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <SaveButton label={labels.save} pending={labels.saving} />

        {draft.trim() !== "" && value !== draft && (
          <button
            type="button"
            onClick={() => setValue(draft)}
            className="admin-btn-ghost"
          >
            <Sparkles size={14} aria-hidden />
            {labels.useDraft}
          </button>
        )}

        {state?.ok && (
          <span className="text-xs text-emerald-700">{labels.saved}</span>
        )}
        {state && !state.ok && (
          <span className="text-xs text-red-700">
            {state.error === "TOO_LONG" ? labels.tooLong : labels.failed}
          </span>
        )}
      </div>
    </form>
  );
}

function SaveButton({ label, pending }: { label: string; pending: string }) {
  const status = useFormStatus();

  return (
    <button type="submit" className="admin-btn" disabled={status.pending}>
      {status.pending ? pending : label}
    </button>
  );
}
