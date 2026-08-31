"use client";

/**
 * components/admin/ProgressForm.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * One month of construction progress. Doubles as the "add" form and the
 * inline editor for an existing month.
 *
 * The image list is a textarea of URLs with a live thumbnail strip beside
 * it. That trade — no upload widget, but instant visual confirmation that
 * a URL resolves — is what makes a URL-based gallery workable in practice.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useFormState, useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { AlertCircle, CheckCircle2, Loader2, Trash2, Youtube } from "lucide-react";
import ImageUploader from "@/components/admin/ImageUploader";
import SaveToast from "@/components/admin/SaveToast";
import type { ProgressFormState } from "@/app/[locale]/admin/progress/actions";

export type ProgressValues = {
  month: number;
  year: number;
  videoUrl: string;
  images: string;
  isPublished: boolean;
};

type Props = {
  action: (
    state: ProgressFormState,
    formData: FormData,
  ) => Promise<ProgressFormState>;
  onDelete?: () => Promise<void>;
  values: ProgressValues;
  /** Used as the S3 folder so an object key reads back to its project. */
  projectSlug: string;
  submitLabel: string;
  monthLabels: string[];
};

const INITIAL: ProgressFormState = { ok: false };

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

function DeleteButton({ confirmLabel }: { confirmLabel: string }) {
  const t = useTranslations("admin.common");
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
      {t("delete")}
    </button>
  );
}

export default function ProgressForm({
  action,
  onDelete,
  values,
  projectSlug,
  submitLabel,
  monthLabels,
}: Props) {
  const t = useTranslations("admin");
  const [state, formAction] = useFormState(action, INITIAL);

  return (
    <>
      <form action={formAction} className="space-y-5">
        {state.ok && state.message === "SAVED" && (
          <SaveToast tone="success" token={state}>
            <CheckCircle2 size={15} aria-hidden />
            {t("common.saved")}
          </SaveToast>
        )}

        {!state.ok && state.message && (
          <SaveToast tone="error" token={state}>
            <AlertCircle size={15} aria-hidden />
            {state.message === "DUPLICATE_MONTH"
              ? t("progress.duplicate")
              : state.message === "STALE_SESSION"
                ? t("progress.staleSession")
                : t("common.error")}
          </SaveToast>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor={`month-${values.year}-${values.month}`} className="admin-label">
              {t("progress.month")}
            </label>
            <select
              id={`month-${values.year}-${values.month}`}
              name="month"
              defaultValue={values.month}
              className="admin-input"
            >
              {monthLabels.map((label, index) => (
                <option key={label} value={index + 1}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor={`year-${values.year}-${values.month}`} className="admin-label">
              {t("progress.year")}
            </label>
            <input
              id={`year-${values.year}-${values.month}`}
              name="year"
              type="number"
              min="2000"
              max="2100"
              defaultValue={values.year}
              className="admin-input"
            />
          </div>
        </div>

        <div>
          <label className="admin-label flex items-center gap-1.5">
            <Youtube size={15} className="text-ink-muted" aria-hidden />
            {t("progress.videoUrl")}
          </label>
          <input
            name="videoUrl"
            type="url"
            placeholder="https://youtu.be/..."
            defaultValue={values.videoUrl}
            className="admin-input"
          />
          <p className="mt-1.5 text-xs text-ink-muted">{t("progress.videoUrlHint")}</p>
        </div>

        <ImageUploader
          name="images"
          prefix="progress"
          slug={projectSlug}
          defaultValue={values.images}
          multiple
          label={t("progress.images")}
          hint={t("progress.imagesHint")}
        />

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

      {/* Separate form — a nested submit would fire the save action. */}
      {onDelete && (
        <form action={onDelete} className="mt-5 border-t border-primary/10 pt-5">
          <DeleteButton confirmLabel={t("common.confirmDelete")} />
        </form>
      )}
    </>
  );
}
