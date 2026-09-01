"use client";

/**
 * components/admin/FaqForm.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * One FAQ entry, add and edit in the same component.
 *
 * Answers are Markdown — an ownership question almost always wants a list
 * and a link — rendered through the same sanitizer as article bodies.
 *
 * question/answer are translated — see FaqTranslation in schema.prisma.
 * `lang` selects which locale this instance shows/saves; the page owns
 * the language selector — see AwardForm's file comment for the fuller
 * version of this note.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { AlertCircle, CheckCircle2, Loader2, Trash2 } from "lucide-react";
import { FAQ_CATEGORIES } from "@/lib/validations";
import SaveToast from "@/components/admin/SaveToast";
import type { Locale } from "@/i18n";
import type { FaqFormState } from "@/app/[locale]/admin/faqs/actions";

export type FaqValues = {
  question: string;
  answer: string;
  category: string;
  isPublished: boolean;
  sortOrder: string;
};

export const EMPTY_FAQ: FaqValues = {
  question: "",
  answer: "",
  category: "",
  isPublished: false,
  sortOrder: "0",
};

type Props = {
  lang: Locale;
  action: (state: FaqFormState, formData: FormData) => Promise<FaqFormState>;
  onDelete?: () => Promise<void>;
  values?: FaqValues;
  /** Categories already in use, offered alongside the known set. */
  existingCategories: string[];
  submitLabel: string;
  /** Unique per instance so the datalist ids do not collide. */
  formId: string;
};

const INITIAL: FaqFormState = { ok: false };

function SubmitButton({ label }: { label: string }) {
  const t = useTranslations("admin.common");
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} className="admin-btn">
      {pending ? (
        <>
          <Loader2 size={15} className="animate-spin" aria-hidden />
          {t("saving")}
        </>
      ) : (
        label
      )}
    </button>
  );
}

function DeleteButton({ label, confirmLabel }: { label: string; confirmLabel: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(event) => {
        if (!window.confirm(confirmLabel)) event.preventDefault();
      }}
      className="admin-btn-danger"
    >
      <Trash2 size={15} aria-hidden />
      {label}
    </button>
  );
}

export default function FaqForm({
  lang,
  action,
  onDelete,
  values = EMPTY_FAQ,
  existingCategories,
  submitLabel,
  formId,
}: Props) {
  const t = useTranslations("admin");
  const [state, formAction] = useActionState(action, INITIAL);

  const err = (name: string) => state.fields?.[name] ?? null;

  // The four the project page filters on, plus anything already in use.
  const categories = [...new Set([...FAQ_CATEGORIES, ...existingCategories])];

  return (
    <>
      <form action={formAction} className="space-y-5">
        <input type="hidden" name="locale" value={lang} />

        {state.ok && (
          <SaveToast tone="success" token={state}>
            <CheckCircle2 size={15} aria-hidden />
            {t("common.saved")}
          </SaveToast>
        )}

        {!state.ok && state.message === "SAVE_FAILED" && (
          <SaveToast tone="error" token={state}>
            <AlertCircle size={15} aria-hidden />
            {t("common.error")}
          </SaveToast>
        )}

        <div>
          <label className="admin-label">{`${t("faqs.question")} · ${lang.toUpperCase()}`}</label>
          <input
            name="question"
            defaultValue={values.question}
            required
            className="admin-input"
          />
          {err("question") && <p className="mt-1.5 text-xs text-red-700">{err("question")}</p>}
        </div>

        <div>
          <label className="admin-label">{`${t("faqs.answer")} · ${lang.toUpperCase()}`}</label>
          <textarea
            name="answer"
            defaultValue={values.answer}
            rows={5}
            required
            className="admin-textarea font-mono text-xs"
          />
          {err("answer") && <p className="mt-1.5 text-xs text-red-700">{err("answer")}</p>}
        </div>
        <p className="admin-hint -mt-3">{t("faqs.answerHint")}</p>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="admin-label">{t("faqs.category")}</label>
            <input
              name="category"
              defaultValue={values.category}
              list={`${formId}-categories`}
              className="admin-input"
            />
            {/* Suggestions rather than a fixed select: free text is allowed,
                but only the four known ids appear on project pages. */}
            <datalist id={`${formId}-categories`}>
              {categories.map((category) => (
                <option key={category} value={category} />
              ))}
            </datalist>
            <p className="admin-hint">{t("faqs.categoryHint")}</p>
          </div>

          <div>
            <label className="admin-label">{t("projects.sortOrder")}</label>
            <input
              name="sortOrder"
              type="number"
              defaultValue={values.sortOrder}
              className="admin-input max-w-[140px]"
            />
          </div>
        </div>

        <label className="flex items-center gap-3 text-sm text-ink">
          <input
            type="checkbox"
            name="isPublished"
            defaultChecked={values.isPublished}
            className="h-4 w-4 rounded-sm border-primary/30 text-primary focus:ring-primary/30"
          />
          {t("common.published")}
        </label>

        <SubmitButton label={submitLabel} />
      </form>

      {onDelete && (
        <form action={onDelete} className="mt-5 border-t border-primary/10 pt-5">
          <DeleteButton
            label={t("common.delete")}
            confirmLabel={t("common.confirmDelete")}
          />
        </form>
      )}
    </>
  );
}
