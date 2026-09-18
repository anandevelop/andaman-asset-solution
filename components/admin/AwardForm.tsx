"use client";

/**
 * components/admin/AwardForm.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * One award. Doubles as the "add" form and the inline editor for an
 * existing one — same arrangement as SalesPersonForm.
 *
 * `title` is translated — see AwardTranslation in schema.prisma;
 * organization, projectName, year and trophyImageUrl are not — an
 * awarding body's name and a project's name aren't translated. `lang`
 * selects which locale's title this instance shows/saves; the page
 * (app/[locale]/admin/pages/about/awards/page.tsx) owns the single language selector
 * shared by every award's form on the page — see LanguageTabs there.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { AlertCircle, CheckCircle2, Loader2, Trash2 } from "lucide-react";
import ImageUploader from "@/components/admin/ImageUploader";
import SaveToast from "@/components/admin/SaveToast";
import type { Locale } from "@/i18n";
import type { AwardFormState } from "@/app/[locale]/admin/(content)/pages/about/awards/actions";

export type AwardValues = {
  title: string;
  organization: string;
  projectName: string;
  year: string;
  trophyImageUrl: string;
  isActive: boolean;
  sortOrder: string;
};

export const EMPTY_AWARD: AwardValues = {
  title: "",
  organization: "",
  projectName: "",
  year: String(new Date().getFullYear()),
  trophyImageUrl: "",
  isActive: true,
  sortOrder: "0",
};

type Props = {
  lang: Locale;
  action: (state: AwardFormState, formData: FormData) => Promise<AwardFormState>;
  onDelete?: () => Promise<void>;
  values?: AwardValues;
  submitLabel: string;
};

const INITIAL: AwardFormState = { ok: false };

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

export default function AwardForm({
  lang,
  action,
  onDelete,
  values = EMPTY_AWARD,
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
            {t("awards.duplicate")}
          </SaveToast>
        )}

        <div>
          <label className="admin-label">{`${t("awards.awardTitle")} · ${lang.toUpperCase()}`}</label>
          <input
            name="title"
            defaultValue={values.title}
            required
            className="admin-input"
          />
          {err("title") && <p className="mt-1.5 text-xs text-red-700">{err("title")}</p>}
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="admin-label">{t("awards.organization")}</label>
            <input
              name="organization"
              defaultValue={values.organization}
              required
              className="admin-input"
            />
            <p className="admin-hint">{t("awards.organizationHint")}</p>
            {err("organization") && (
              <p className="mt-1.5 text-xs text-red-700">{err("organization")}</p>
            )}
          </div>

          <div>
            <label className="admin-label">{t("awards.year")}</label>
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
            <label className="admin-label">{t("awards.projectName")}</label>
            <input
              name="projectName"
              defaultValue={values.projectName}
              className="admin-input"
            />
            <p className="admin-hint">{t("awards.projectNameHint")}</p>
            {err("projectName") && (
              <p className="mt-1.5 text-xs text-red-700">{err("projectName")}</p>
            )}
          </div>

          <div>
            <label className="admin-label">{t("awards.sortOrder")}</label>
            <input
              name="sortOrder"
              type="number"
              defaultValue={values.sortOrder}
              className="admin-input"
            />
          </div>
        </div>

        <ImageUploader
          name="trophyImageUrl"
          prefix="awards"
          defaultValue={values.trophyImageUrl}
          label={t("awards.trophyImage")}
          hint={t("awards.trophyImageHint")}
        />

        <label className="flex items-center gap-3 text-sm text-ink">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={values.isActive}
            className="h-4 w-4 rounded-xs border-primary/30 text-primary focus:ring-primary/30"
          />
          {t("awards.active")}
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
