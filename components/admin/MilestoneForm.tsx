"use client";

/**
 * components/admin/MilestoneForm.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * One milestone. Doubles as the "add" form and the inline editor for an
 * existing one — same arrangement as AwardForm, minus the language tab:
 * year, projectName and brand are proper nouns, not editorial copy, so
 * there is nothing here to translate.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { AlertCircle, CheckCircle2, Loader2, Trash2 } from "lucide-react";
import ImageUploader from "@/components/admin/ImageUploader";
import SaveToast from "@/components/admin/SaveToast";
import type { MilestoneFormState } from "@/app/[locale]/admin/(content)/pages/about/milestones/actions";

export type MilestoneValues = {
  year: string;
  projectName: string;
  brand: string;
  imageUrl: string;
  isActive: boolean;
  sortOrder: string;
};

export const EMPTY_MILESTONE: MilestoneValues = {
  year: String(new Date().getFullYear()),
  projectName: "",
  brand: "",
  imageUrl: "",
  isActive: true,
  sortOrder: "0",
};

type Props = {
  action: (state: MilestoneFormState, formData: FormData) => Promise<MilestoneFormState>;
  onDelete?: () => Promise<void>;
  values?: MilestoneValues;
  submitLabel: string;
};

const INITIAL: MilestoneFormState = { ok: false };

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

export default function MilestoneForm({
  action,
  onDelete,
  values = EMPTY_MILESTONE,
  submitLabel,
}: Props) {
  const t = useTranslations("admin");
  const [state, formAction] = useActionState(action, INITIAL);

  const err = (name: string) => state.fields?.[name] ?? null;

  return (
    <>
      <form action={formAction} className="space-y-5">
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

        {!state.ok && state.message === "DUPLICATE" && (
          <SaveToast tone="error" token={state}>
            <AlertCircle size={15} aria-hidden />
            {t("milestones.duplicate")}
          </SaveToast>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="admin-label">{t("milestones.projectName")}</label>
            <input
              name="projectName"
              defaultValue={values.projectName}
              required
              className="admin-input"
            />
            <p className="admin-hint">{t("milestones.projectNameHint")}</p>
            {err("projectName") && (
              <p className="mt-1.5 text-xs text-red-700">{err("projectName")}</p>
            )}
          </div>

          <div>
            <label className="admin-label">{t("milestones.year")}</label>
            <input
              name="year"
              type="number"
              defaultValue={values.year}
              required
              className="admin-input"
            />
            {err("year") && <p className="mt-1.5 text-xs text-red-700">{err("year")}</p>}
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="admin-label">{t("milestones.brand")}</label>
            <input name="brand" defaultValue={values.brand} className="admin-input" />
            <p className="admin-hint">{t("milestones.brandHint")}</p>
            {err("brand") && <p className="mt-1.5 text-xs text-red-700">{err("brand")}</p>}
          </div>

          <div>
            <label className="admin-label">{t("milestones.sortOrder")}</label>
            <input
              name="sortOrder"
              type="number"
              defaultValue={values.sortOrder}
              className="admin-input"
            />
          </div>
        </div>

        <ImageUploader
          name="imageUrl"
          prefix="milestones"
          defaultValue={values.imageUrl}
          label={t("milestones.image")}
          hint={t("milestones.imageHint")}
        />

        <label className="flex items-center gap-3 text-sm text-ink">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={values.isActive}
            className="h-4 w-4 rounded-xs border-primary/30 text-primary focus:ring-primary/30"
          />
          {t("milestones.active")}
        </label>

        <SubmitButton label={submitLabel} />
      </form>

      {/* Separate form — a nested submit would fire the save action. */}
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
