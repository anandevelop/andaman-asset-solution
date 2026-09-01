"use client";

/**
 * components/admin/ProjectFacilityForm.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * One facility photo card. Doubles as the "add" form and the inline editor
 * for an existing one — same arrangement as AwardForm/SalesPersonForm.
 *
 * `name` is translated — see ProjectFacilityTranslation in schema.prisma.
 * `lang` selects which locale's name this instance shows/saves; the page
 * (.../facilities/page.tsx) owns the single language selector shared by
 * every facility's form on the page — see LanguageTabs there, and
 * AwardForm's file comment for the fuller version of this note.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { AlertCircle, CheckCircle2, Loader2, Trash2 } from "lucide-react";
import ImageUploader from "@/components/admin/ImageUploader";
import SaveToast from "@/components/admin/SaveToast";
import type { Locale } from "@/i18n";
import type { ProjectFacilityFormState } from "@/app/[locale]/admin/projects/[id]/facilities/actions";

export type ProjectFacilityValues = {
  name: string;
  imageUrl: string;
  isActive: boolean;
  sortOrder: string;
};

export const EMPTY_PROJECT_FACILITY: ProjectFacilityValues = {
  name: "",
  imageUrl: "",
  isActive: true,
  sortOrder: "0",
};

type Props = {
  lang: Locale;
  action: (
    state: ProjectFacilityFormState,
    formData: FormData,
  ) => Promise<ProjectFacilityFormState>;
  onDelete?: () => Promise<void>;
  values?: ProjectFacilityValues;
  submitLabel: string;
};

const INITIAL: ProjectFacilityFormState = { ok: false };

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

export default function ProjectFacilityForm({
  lang,
  action,
  onDelete,
  values = EMPTY_PROJECT_FACILITY,
  submitLabel,
}: Props) {
  const t = useTranslations("admin");
  const [state, formAction] = useActionState(action, INITIAL);

  const err = (name: string) => state.fields?.[name] ?? null;

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

        {!state.ok && state.message === "DUPLICATE" && (
          <SaveToast tone="error" token={state}>
            <AlertCircle size={15} aria-hidden />
            {t("facilities.duplicate")}
          </SaveToast>
        )}

        <div>
          <label className="admin-label">{`${t("facilities.name")} · ${lang.toUpperCase()}`}</label>
          <input
            name="name"
            defaultValue={values.name}
            required
            className="admin-input"
          />
          {err("name") && <p className="mt-1.5 text-xs text-red-700">{err("name")}</p>}
        </div>

        <ImageUploader
          name="imageUrl"
          prefix="facilities"
          defaultValue={values.imageUrl}
          label={t("facilities.image")}
          hint={t("facilities.imageHint")}
        />

        <div>
          <label className="admin-label">{t("facilities.sortOrder")}</label>
          <input
            name="sortOrder"
            type="number"
            defaultValue={values.sortOrder}
            className="admin-input max-w-[10rem]"
          />
        </div>

        <label className="flex items-center gap-3 text-sm text-ink">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={values.isActive}
            className="h-4 w-4 rounded-sm border-primary/30 text-primary focus:ring-primary/30"
          />
          {t("facilities.active")}
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
