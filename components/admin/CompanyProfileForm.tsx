"use client";

/**
 * components/admin/CompanyProfileForm.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The CompanyProfile singleton — one textarea for `aboutUs`, translated
 * (see CompanyProfileTranslation in schema.prisma). Small enough that it
 * doesn't need SettingsForm's per-key override/default machinery, which is
 * built for the SiteSetting key-value table, not a single fixed-id row.
 *
 * `lang` selects which locale's aboutUs this instance shows/saves; the
 * page owns the language selector — see AwardForm's file comment for the
 * fuller version of this note.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import SaveToast from "@/components/admin/SaveToast";
import type { Locale } from "@/i18n";
import type { CompanyProfileFormState } from "@/app/[locale]/admin/settings/company/actions";

const INITIAL: CompanyProfileFormState = { ok: false };

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

export default function CompanyProfileForm({
  lang,
  action,
  aboutUs,
  submitLabel,
}: {
  lang: Locale;
  action: (
    state: CompanyProfileFormState,
    formData: FormData,
  ) => Promise<CompanyProfileFormState>;
  aboutUs: string;
  submitLabel: string;
}) {
  const t = useTranslations("admin");
  const [state, formAction] = useActionState(action, INITIAL);

  return (
    <form action={formAction} className="admin-card space-y-5">
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

      <div>
        <label htmlFor="aboutUs" className="admin-label">
          {`${t("settings.company.aboutUsEn")} · ${lang.toUpperCase()}`}
        </label>
        <textarea
          id="aboutUs"
          name="aboutUs"
          defaultValue={aboutUs}
          rows={8}
          required
          className="admin-textarea"
        />
        {state.fields?.aboutUs && (
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-red-700">
            <AlertCircle size={13} aria-hidden />
            {state.fields.aboutUs}
          </p>
        )}
      </div>

      <SubmitButton label={submitLabel} />
    </form>
  );
}
