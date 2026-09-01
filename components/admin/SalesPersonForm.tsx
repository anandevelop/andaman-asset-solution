"use client";

/**
 * components/admin/SalesPersonForm.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * One sales team member. Doubles as the "add" form and the inline editor
 * for an existing one — same arrangement as ProgressForm.
 *
 * Name and position are translated — see SalesPersonTranslation in
 * schema.prisma; whatsappNumber, phoneNumber and email are not, since a
 * phone number or address reads the same in every language. `lang`
 * selects which locale's name/position this instance shows/saves; the
 * page (.../sales-team/page.tsx) owns the single language selector
 * shared by every person's form — see AwardForm's file comment for the
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
import type { SalesPersonFormState } from "@/app/[locale]/admin/sales-team/actions";

export type SalesPersonValues = {
  name: string;
  position: string;
  whatsappNumber: string;
  phoneNumber: string;
  email: string;
  photoUrl: string;
  isActive: boolean;
  sortOrder: string;
};

export const EMPTY_SALES_PERSON: SalesPersonValues = {
  name: "",
  position: "",
  whatsappNumber: "",
  phoneNumber: "",
  email: "",
  photoUrl: "",
  isActive: true,
  sortOrder: "0",
};

type Props = {
  lang: Locale;
  action: (
    state: SalesPersonFormState,
    formData: FormData,
  ) => Promise<SalesPersonFormState>;
  onDelete?: () => Promise<void>;
  values?: SalesPersonValues;
  submitLabel: string;
};

const INITIAL: SalesPersonFormState = { ok: false };

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

export default function SalesPersonForm({
  lang,
  action,
  onDelete,
  values = EMPTY_SALES_PERSON,
  submitLabel,
}: Props) {
  const t = useTranslations("admin");
  const [state, formAction] = useActionState(action, INITIAL);

  const err = (field: string) => state.fields?.[field] ?? null;

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

        {!state.ok && state.message === "NUMBER_TAKEN" && (
          <SaveToast tone="error" token={state}>
            <AlertCircle size={15} aria-hidden />
            {t("salesTeam.numberTaken")}
          </SaveToast>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="admin-label">{`${t("salesTeam.name")} · ${lang.toUpperCase()}`}</label>
            <input
              name="name"
              defaultValue={values.name}
              required
              className="admin-input"
            />
            {err("name") && <p className="mt-1.5 text-xs text-red-700">{err("name")}</p>}
          </div>

          <div>
            <label className="admin-label">{`${t("salesTeam.position")} · ${lang.toUpperCase()}`}</label>
            <input
              name="position"
              defaultValue={values.position}
              required
              className="admin-input"
            />
            {err("position") && (
              <p className="mt-1.5 text-xs text-red-700">{err("position")}</p>
            )}
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="admin-label">{t("salesTeam.whatsapp")}</label>
            <input
              name="whatsappNumber"
              type="tel"
              defaultValue={values.whatsappNumber}
              placeholder="+66812345678"
              required
              className="admin-input"
            />
            <p className="admin-hint">{t("salesTeam.whatsappHint")}</p>
            {err("whatsappNumber") && (
              <p className="mt-1.5 text-xs text-red-700">{err("whatsappNumber")}</p>
            )}
          </div>

          <div>
            <label className="admin-label">{t("salesTeam.phone")}</label>
            <input
              name="phoneNumber"
              type="tel"
              defaultValue={values.phoneNumber}
              placeholder="+66812345678"
              required
              className="admin-input"
            />
            <p className="admin-hint">{t("salesTeam.phoneHint")}</p>
            {err("phoneNumber") && (
              <p className="mt-1.5 text-xs text-red-700">{err("phoneNumber")}</p>
            )}
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="admin-label">{t("salesTeam.email")}</label>
            <input
              name="email"
              type="email"
              defaultValue={values.email}
              placeholder="name@example.com"
              className="admin-input"
            />
            <p className="admin-hint">{t("salesTeam.emailHint")}</p>
            {err("email") && <p className="mt-1.5 text-xs text-red-700">{err("email")}</p>}
          </div>

          <div>
            <label className="admin-label">{t("salesTeam.sortOrder")}</label>
            <input
              name="sortOrder"
              type="number"
              defaultValue={values.sortOrder}
              className="admin-input"
            />
          </div>
        </div>

        <ImageUploader
          name="photoUrl"
          prefix="sales-team"
          defaultValue={values.photoUrl}
          label={t("salesTeam.photo")}
          hint={t("salesTeam.photoHint")}
        />

        <label className="flex items-center gap-3 text-sm text-ink">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={values.isActive}
            className="h-4 w-4 rounded-sm border-primary/30 text-primary focus:ring-primary/30"
          />
          {t("salesTeam.active")}
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
