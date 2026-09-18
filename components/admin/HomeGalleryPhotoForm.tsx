"use client";

/**
 * components/admin/HomeGalleryPhotoForm.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * One "Who we are" gallery photo. Doubles as the "add" form and the
 * inline editor for an existing one — same arrangement as MilestoneForm,
 * minus the year field: `label` is a proper noun, not editorial copy, so
 * there is nothing here to translate.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { AlertCircle, CheckCircle2, Loader2, Trash2 } from "lucide-react";
import ImageUploader from "@/components/admin/ImageUploader";
import SaveToast from "@/components/admin/SaveToast";
import type { HomeGalleryPhotoFormState } from "@/app/[locale]/admin/(content)/pages/home/gallery/actions";

export type HomeGalleryPhotoValues = {
  imageUrl: string;
  label: string;
  isActive: boolean;
  sortOrder: string;
};

export const EMPTY_HOME_GALLERY_PHOTO: HomeGalleryPhotoValues = {
  imageUrl: "",
  label: "",
  isActive: true,
  sortOrder: "0",
};

type Props = {
  action: (
    state: HomeGalleryPhotoFormState,
    formData: FormData,
  ) => Promise<HomeGalleryPhotoFormState>;
  onDelete?: () => Promise<void>;
  values?: HomeGalleryPhotoValues;
  submitLabel: string;
};

const INITIAL: HomeGalleryPhotoFormState = { ok: false };

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

export default function HomeGalleryPhotoForm({
  action,
  onDelete,
  values = EMPTY_HOME_GALLERY_PHOTO,
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
            {t("homeGallery.duplicate")}
          </SaveToast>
        )}

        <div>
          <label className="admin-label">{t("homeGallery.label")}</label>
          <input
            name="label"
            defaultValue={values.label}
            required
            className="admin-input"
          />
          <p className="admin-hint">{t("homeGallery.labelHint")}</p>
          {err("label") && <p className="mt-1.5 text-xs text-red-700">{err("label")}</p>}
        </div>

        <ImageUploader
          name="imageUrl"
          prefix="home-gallery"
          defaultValue={values.imageUrl}
          label={t("homeGallery.image")}
        />
        {err("imageUrl") && <p className="mt-1.5 text-xs text-red-700">{err("imageUrl")}</p>}

        <div>
          <label className="admin-label">{t("homeGallery.sortOrder")}</label>
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
          {t("homeGallery.active")}
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
