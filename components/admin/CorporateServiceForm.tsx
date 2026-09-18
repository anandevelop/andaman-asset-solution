"use client";

/**
 * components/admin/CorporateServiceForm.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * One Corporate services tile. Doubles as the "add" form and the inline
 * editor for an existing one — same arrangement as AwardForm.
 *
 * `label`/`imageAlt` are translated; `imageUrl`/`isActive`/`sortOrder` are
 * not. `lang` selects which locale's label/imageAlt this instance
 * shows/saves; the page owns the single language selector shared by every
 * service's form on the page — see AwardForm's file comment for the
 * fuller version of this note.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { AlertCircle, CheckCircle2, Loader2, Trash2 } from "lucide-react";
import ImageUploader from "@/components/admin/ImageUploader";
import SaveToast from "@/components/admin/SaveToast";
import type { Locale } from "@/i18n";
import type { CorporateServiceFormState } from "@/app/[locale]/admin/(content)/pages/about/corporate/actions";

export type CorporateServiceValues = {
  label: string;
  imageAlt: string;
  imageUrl: string;
  isActive: boolean;
  sortOrder: string;
};

export const EMPTY_CORPORATE_SERVICE: CorporateServiceValues = {
  label: "",
  imageAlt: "",
  imageUrl: "",
  isActive: true,
  sortOrder: "0",
};

type Props = {
  lang: Locale;
  action: (
    state: CorporateServiceFormState,
    formData: FormData,
  ) => Promise<CorporateServiceFormState>;
  onDelete?: () => Promise<void>;
  values?: CorporateServiceValues;
  submitLabel: string;
};

const INITIAL: CorporateServiceFormState = { ok: false };

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

export default function CorporateServiceForm({
  lang,
  action,
  onDelete,
  values = EMPTY_CORPORATE_SERVICE,
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

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="admin-label">{`${t("corporate.label")} · ${lang.toUpperCase()}`}</label>
            <input
              name="label"
              defaultValue={values.label}
              required
              className="admin-input"
            />
            {err("label") && <p className="mt-1.5 text-xs text-red-700">{err("label")}</p>}
          </div>

          <div>
            <label className="admin-label">{`${t("corporate.imageAlt")} · ${lang.toUpperCase()}`}</label>
            <input
              name="imageAlt"
              defaultValue={values.imageAlt}
              required
              className="admin-input"
            />
            <p className="admin-hint">{t("corporate.imageAltHint")}</p>
            {err("imageAlt") && (
              <p className="mt-1.5 text-xs text-red-700">{err("imageAlt")}</p>
            )}
          </div>
        </div>

        <ImageUploader
          name="imageUrl"
          prefix="corporate"
          defaultValue={values.imageUrl}
          label={t("corporate.image")}
        />
        {err("imageUrl") && <p className="mt-1.5 text-xs text-red-700">{err("imageUrl")}</p>}

        <div>
          <label className="admin-label">{t("corporate.sortOrder")}</label>
          <input
            name="sortOrder"
            type="number"
            defaultValue={values.sortOrder}
            className="admin-input max-w-40"
          />
        </div>

        <label className="flex items-center gap-3 text-sm text-ink">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={values.isActive}
            className="h-4 w-4 rounded-xs border-primary/30 text-primary focus:ring-primary/30"
          />
          {t("corporate.active")}
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
