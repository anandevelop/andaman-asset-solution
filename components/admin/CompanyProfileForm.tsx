"use client";

/**
 * components/admin/CompanyProfileForm.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The CompanyProfile singleton. Two kinds of field share one form:
 *
 *  - Translated, per `lang` tab: `aboutUs`, and the About page Story
 *    section's `storyEyebrow`/`storyTitle` — same as AwardForm's `title`.
 *  - Untranslated, shown and saved regardless of `lang`: the Story
 *    section's photo (`storyImageUrl`) and the four Vision & Mission
 *    figures on the home page (`stat*`) — plain strings/an image, same
 *    reasoning AwardForm's `organization`/`trophyImageUrl` already
 *    documents for why those don't move with the language tab either.
 *
 * `lang` selects which locale's translated fields this instance
 * shows/saves; the page owns the language selector — see AwardForm's file
 * comment for the fuller version of this note.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import ImageUploader from "@/components/admin/ImageUploader";
import SaveToast from "@/components/admin/SaveToast";
import type { Locale } from "@/i18n";
import type { CompanyProfileFormState } from "@/app/[locale]/admin/(system)/settings/company/actions";

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

export type CompanyProfileValues = {
  aboutUs: string;
  storyEyebrow: string;
  storyTitle: string;
  storyImageUrl: string;
  aboutHeroImageUrl: string;
  foundedYear: string;
};

export default function CompanyProfileForm({
  lang,
  action,
  values,
  submitLabel,
}: {
  lang: Locale;
  action: (
    state: CompanyProfileFormState,
    formData: FormData,
  ) => Promise<CompanyProfileFormState>;
  values: CompanyProfileValues;
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
          defaultValue={values.aboutUs}
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

      {/* ── Header hero (About page) ──────────────────────────────── */}
      <div className="border-t border-primary/10 pt-5">
        <p className="admin-section-title">{t("settings.company.heroHeading")}</p>

        <div className="mt-4">
          <ImageUploader
            name="aboutHeroImageUrl"
            prefix="company"
            defaultValue={values.aboutHeroImageUrl}
            label={t("settings.company.heroImage")}
            hint={t("settings.company.heroImageHint")}
          />
          {state.fields?.aboutHeroImageUrl && (
            <p className="mt-1.5 text-xs text-red-700">{state.fields.aboutHeroImageUrl}</p>
          )}
        </div>
      </div>

      {/* ── Story section (About page) ─────────────────────────────── */}
      <div className="border-t border-primary/10 pt-5">
        <p className="admin-section-title">{t("settings.company.storyHeading")}</p>

        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="storyEyebrow" className="admin-label">
              {`${t("settings.company.storyEyebrow")} · ${lang.toUpperCase()}`}
            </label>
            <input
              id="storyEyebrow"
              name="storyEyebrow"
              defaultValue={values.storyEyebrow}
              required
              className="admin-input"
            />
            {state.fields?.storyEyebrow && (
              <p className="mt-1.5 text-xs text-red-700">{state.fields.storyEyebrow}</p>
            )}
          </div>

          <div>
            <label htmlFor="storyTitle" className="admin-label">
              {`${t("settings.company.storyTitle")} · ${lang.toUpperCase()}`}
            </label>
            <input
              id="storyTitle"
              name="storyTitle"
              defaultValue={values.storyTitle}
              required
              className="admin-input"
            />
            {state.fields?.storyTitle && (
              <p className="mt-1.5 text-xs text-red-700">{state.fields.storyTitle}</p>
            )}
          </div>
        </div>

        <div className="mt-5">
          <ImageUploader
            name="storyImageUrl"
            prefix="company"
            defaultValue={values.storyImageUrl}
            label={t("settings.company.storyImage")}
            hint={t("settings.company.storyImageHint")}
          />
          {state.fields?.storyImageUrl && (
            <p className="mt-1.5 text-xs text-red-700">{state.fields.storyImageUrl}</p>
          )}
        </div>
      </div>

      {/* ── Vision & Mission figures (home page) ───────────────────── */}
      <div className="border-t border-primary/10 pt-5">
        <p className="admin-section-title">{t("settings.company.statsHeading")}</p>
        <p className="admin-hint mt-1">{t("settings.company.statsHint")}</p>

        <div className="mt-4 max-w-xs">
          <label htmlFor="foundedYear" className="admin-label">
            {t("settings.company.foundedYear")}
          </label>
          <input
            id="foundedYear"
            name="foundedYear"
            inputMode="numeric"
            maxLength={4}
            placeholder="2005"
            defaultValue={values.foundedYear}
            className="admin-input"
          />
          <p className="admin-hint">{t("settings.company.foundedYearHint")}</p>
          {state.fields?.foundedYear && (
            <p className="mt-1.5 text-xs text-red-700">{state.fields.foundedYear}</p>
          )}
        </div>
      </div>

      <SubmitButton label={submitLabel} />
    </form>
  );
}
