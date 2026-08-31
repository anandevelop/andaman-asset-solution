"use client";

/**
 * components/admin/HeroStorySlideForm.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * One story-banner slide. Doubles as the "add" form and the inline editor
 * for an existing one — same arrangement as AwardForm.
 *
 * `caption`/`ctaLabel` are translated (HeroStorySlideTranslation); every
 * other field is not — a media URL, a CTA link and a duration don't have a
 * language. `lang` selects which locale's caption/CTA this instance
 * shows/saves; the page (app/[locale]/admin/hero-banner/page.tsx) owns the
 * single language selector shared by every slide's form — see LanguageTabs
 * there.
 *
 * The mediaType radio drives one bit of client-only visibility, nothing
 * else: durationSeconds only means anything for an IMAGE slide (a VIDEO
 * advances on its own `onEnded`), and posterImageUrl only means anything
 * for a VIDEO slide (an IMAGE has no loading gap to cover). Every field
 * stays an uncontrolled input regardless — this local state only toggles
 * which ones are rendered.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { AlertCircle, CheckCircle2, Loader2, Trash2 } from "lucide-react";
import ImageUploader from "@/components/admin/ImageUploader";
import SaveToast from "@/components/admin/SaveToast";
import type { Locale } from "@/i18n";
import type { HeroStorySlideFormState } from "@/app/[locale]/admin/hero-banner/actions";

export type HeroStorySlideValues = {
  mediaType: "IMAGE" | "VIDEO";
  mediaUrl: string;
  posterImageUrl: string;
  durationSeconds: string;
  ctaUrl: string;
  caption: string;
  tagline: string;
  ctaLabel: string;
  isActive: boolean;
  sortOrder: string;
};

export const EMPTY_HERO_STORY_SLIDE: HeroStorySlideValues = {
  mediaType: "IMAGE",
  mediaUrl: "",
  posterImageUrl: "",
  durationSeconds: "5",
  ctaUrl: "",
  caption: "",
  tagline: "",
  ctaLabel: "",
  isActive: true,
  sortOrder: "0",
};

type Props = {
  lang: Locale;
  action: (state: HeroStorySlideFormState, formData: FormData) => Promise<HeroStorySlideFormState>;
  onDelete?: () => Promise<void>;
  values?: HeroStorySlideValues;
  submitLabel: string;
};

const INITIAL: HeroStorySlideFormState = { ok: false };

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

export default function HeroStorySlideForm({
  lang,
  action,
  onDelete,
  values = EMPTY_HERO_STORY_SLIDE,
  submitLabel,
}: Props) {
  const t = useTranslations("admin");
  const [state, formAction] = useFormState(action, INITIAL);
  // Purely for conditional field visibility — see the file comment.
  const [mediaType, setMediaType] = useState<"IMAGE" | "VIDEO">(values.mediaType);

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
            {t("heroBanner.duplicate")}
          </SaveToast>
        )}

        {/* ── Media type ────────────────────────────────────────────── */}
        <div>
          <span className="admin-label">{t("heroBanner.mediaType")}</span>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="radio"
                name="mediaType"
                value="IMAGE"
                checked={mediaType === "IMAGE"}
                onChange={() => setMediaType("IMAGE")}
                className="h-4 w-4 border-primary/30 text-primary focus:ring-primary/30"
              />
              {t("heroBanner.mediaTypeImage")}
            </label>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="radio"
                name="mediaType"
                value="VIDEO"
                checked={mediaType === "VIDEO"}
                onChange={() => setMediaType("VIDEO")}
                className="h-4 w-4 border-primary/30 text-primary focus:ring-primary/30"
              />
              {t("heroBanner.mediaTypeVideo")}
            </label>
          </div>
          {err("mediaType") && <p className="mt-1.5 text-xs text-red-700">{err("mediaType")}</p>}
        </div>

        <ImageUploader
          name="mediaUrl"
          prefix="hero-banner"
          acceptVideo
          defaultValue={values.mediaUrl}
          label={t("heroBanner.media")}
          hint={t("heroBanner.mediaHint")}
        />
        {err("mediaUrl") && <p className="-mt-3 text-xs text-red-700">{err("mediaUrl")}</p>}

        {mediaType === "VIDEO" && (
          <ImageUploader
            name="posterImageUrl"
            prefix="hero-banner"
            defaultValue={values.posterImageUrl}
            label={t("heroBanner.poster")}
            hint={t("heroBanner.posterHint")}
          />
        )}

        {mediaType === "IMAGE" && (
          <div>
            <label className="admin-label">{t("heroBanner.durationSeconds")}</label>
            <input
              name="durationSeconds"
              type="number"
              min={1}
              max={60}
              defaultValue={values.durationSeconds}
              required
              className="admin-input max-w-[10rem]"
            />
            <p className="admin-hint">{t("heroBanner.durationSecondsHint")}</p>
            {err("durationSeconds") && (
              <p className="mt-1.5 text-xs text-red-700">{err("durationSeconds")}</p>
            )}
          </div>
        )}

        {/* Hidden mirror so a VIDEO slide still submits a valid (if
            unused) durationSeconds — the column is NOT NULL with a
            default of 5, and the field above is unmounted rather than
            just visually hidden when mediaType is VIDEO. */}
        {mediaType === "VIDEO" && (
          <input
            type="hidden"
            name="durationSeconds"
            value={values.durationSeconds || "5"}
            readOnly
          />
        )}

        <div>
          <label className="admin-label">{`${t("heroBanner.caption")} · ${lang.toUpperCase()}`}</label>
          <textarea
            name="caption"
            defaultValue={values.caption}
            rows={2}
            className="admin-input"
          />
          <p className="admin-hint">{t("heroBanner.captionHint")}</p>
          {err("caption") && <p className="mt-1.5 text-xs text-red-700">{err("caption")}</p>}
        </div>

        <div>
          <label className="admin-label">{`${t("heroBanner.tagline")} · ${lang.toUpperCase()}`}</label>
          <input
            name="tagline"
            defaultValue={values.tagline}
            className="admin-input"
          />
          <p className="admin-hint">{t("heroBanner.taglineHint")}</p>
          {err("tagline") && <p className="mt-1.5 text-xs text-red-700">{err("tagline")}</p>}
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="admin-label">{`${t("heroBanner.ctaLabel")} · ${lang.toUpperCase()}`}</label>
            <input
              name="ctaLabel"
              defaultValue={values.ctaLabel}
              className="admin-input"
            />
            {err("ctaLabel") && <p className="mt-1.5 text-xs text-red-700">{err("ctaLabel")}</p>}
          </div>

          <div>
            <label className="admin-label">{t("heroBanner.ctaUrl")}</label>
            <input
              name="ctaUrl"
              defaultValue={values.ctaUrl}
              placeholder="/projects"
              className="admin-input"
            />
            <p className="admin-hint">{t("heroBanner.ctaUrlHint")}</p>
            {err("ctaUrl") && <p className="mt-1.5 text-xs text-red-700">{err("ctaUrl")}</p>}
          </div>
        </div>

        <div>
          <label className="admin-label">{t("heroBanner.sortOrder")}</label>
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
          {t("heroBanner.active")}
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
