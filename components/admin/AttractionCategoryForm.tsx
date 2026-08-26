"use client";

/**
 * components/admin/AttractionCategoryForm.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * One category's name + its items (via AttractionItemsEditor), saved
 * as a single server action call. Used for both "add a category" (no
 * onDelete prop) and each existing category on
 * app/[locale]/admin/attractions/[projectId]/page.tsx.
 *
 * categoryName and each item's name are translated (see
 * NearbyAttractionCategoryTranslation / NearbyAttractionItemTranslation in
 * schema.prisma). `lang` selects which locale this instance shows/saves;
 * the page owns the single language selector shared by every category's
 * form — see AwardForm's file comment for the fuller version of this note.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useFormState, useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { AlertCircle, CheckCircle2, Loader2, Trash2 } from "lucide-react";
import AttractionItemsEditor, {
  type AttractionItemRow,
} from "@/components/admin/AttractionItemsEditor";
import SaveToast from "@/components/admin/SaveToast";
import type { Locale } from "@/i18n";
import type { AttractionFormState } from "@/app/[locale]/admin/attractions/actions";

const INITIAL: AttractionFormState = { ok: false };

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

export default function AttractionCategoryForm({
  lang,
  action,
  onDelete,
  categoryName = "",
  sortOrder = "0",
  items = [],
  submitLabel,
}: {
  lang: Locale;
  action: (state: AttractionFormState, formData: FormData) => Promise<AttractionFormState>;
  onDelete?: () => Promise<void>;
  categoryName?: string;
  sortOrder?: string;
  items?: AttractionItemRow[];
  submitLabel: string;
}) {
  const t = useTranslations("admin");
  const [state, formAction] = useFormState(action, INITIAL);

  return (
    <div className="admin-card space-y-5">
      <form action={formAction} className="space-y-5">
        <input type="hidden" name="locale" value={lang} />

        {state.ok && state.message === "SAVED" && (
          <SaveToast tone="success" token={state}>
            <CheckCircle2 size={16} aria-hidden />
            {t("common.saved")}
          </SaveToast>
        )}
        {!state.ok && state.message === "SAVE_FAILED" && (
          <SaveToast tone="error" token={state}>
            <AlertCircle size={16} aria-hidden />
            {t("common.error")}
          </SaveToast>
        )}

        <div className="grid gap-4 sm:grid-cols-[1fr_110px]">
          <div>
            <label className="admin-label">{`${t("attractions.categoryName")} · ${lang.toUpperCase()}`}</label>
            <input
              name="categoryName"
              defaultValue={categoryName}
              required
              className="admin-input"
            />
            {state.fields?.categoryName && (
              <p className="mt-1.5 text-xs text-red-700">{state.fields.categoryName}</p>
            )}
          </div>
          <div>
            <label className="admin-label">{t("attractions.sortOrder")}</label>
            <input
              name="sortOrder"
              type="number"
              defaultValue={sortOrder}
              className="admin-input"
            />
          </div>
        </div>

        <div>
          <span className="admin-label">{t("attractions.items")}</span>
          <p className="admin-hint">{t("attractions.itemsHint")}</p>
          <div className="mt-3">
            <AttractionItemsEditor
              name="items"
              defaultValue={JSON.stringify(items)}
              addLabel={t("attractions.addItem")}
              removeLabel={t("common.delete")}
              namePlaceholder={`${t("attractions.name")} · ${lang.toUpperCase()}`}
              distanceLabel={t("attractions.distanceKm")}
              durationLabel={t("attractions.durationMin")}
            />
          </div>
        </div>

        <SubmitButton label={submitLabel} />
      </form>

      {onDelete && (
        <form
          action={onDelete}
          className="border-t border-primary/10 pt-5"
        >
          <DeleteButton
            label={t("attractions.deleteCategory")}
            confirmLabel={t("common.confirmDelete")}
          />
        </form>
      )}
    </div>
  );
}
