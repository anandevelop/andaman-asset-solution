"use client";

/**
 * components/admin/WhyUsPointForm.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * One "Why us" card. Doubles as the "add" form and the inline editor for
 * an existing one — same arrangement as AwardForm.
 *
 * `title`/`body` are translated; `icon`/`isActive`/`sortOrder` are not.
 * `lang` selects which locale's title/body this instance shows/saves; the
 * page owns the single language selector shared by every point's form on
 * the page — see AwardForm's file comment for the fuller version of this
 * note.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { AlertCircle, CheckCircle2, Loader2, Trash2 } from "lucide-react";
import SaveToast from "@/components/admin/SaveToast";
import { sectionIcons } from "@/lib/validations";
import type { Locale } from "@/i18n";
import type { WhyUsPointFormState } from "@/app/[locale]/admin/(content)/pages/about/why-us/actions";

export type WhyUsPointValues = {
  icon: string;
  title: string;
  body: string;
  isActive: boolean;
  sortOrder: string;
};

export const EMPTY_WHY_US_POINT: WhyUsPointValues = {
  icon: sectionIcons[0],
  title: "",
  body: "",
  isActive: true,
  sortOrder: "0",
};

/** Plain text labels — a native <select> can't render the glyph itself. */
const ICON_LABELS: Record<(typeof sectionIcons)[number], string> = {
  MOUNTAIN: "Mountain",
  SHIELD_CHECK: "Shield",
  HARD_HAT: "Hard Hat",
  HAND_HEART: "Hand Heart",
  EYE: "Eye",
  HEART_HANDSHAKE: "Heart Handshake",
};

type Props = {
  lang: Locale;
  action: (
    state: WhyUsPointFormState,
    formData: FormData,
  ) => Promise<WhyUsPointFormState>;
  onDelete?: () => Promise<void>;
  values?: WhyUsPointValues;
  submitLabel: string;
};

const INITIAL: WhyUsPointFormState = { ok: false };

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

export default function WhyUsPointForm({
  lang,
  action,
  onDelete,
  values = EMPTY_WHY_US_POINT,
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

        <div>
          <label className="admin-label">{`${t("whyUs.pointTitle")} · ${lang.toUpperCase()}`}</label>
          <input
            name="title"
            defaultValue={values.title}
            required
            className="admin-input"
          />
          {err("title") && <p className="mt-1.5 text-xs text-red-700">{err("title")}</p>}
        </div>

        <div>
          <label className="admin-label">{`${t("whyUs.body")} · ${lang.toUpperCase()}`}</label>
          <textarea
            name="body"
            defaultValue={values.body}
            rows={3}
            required
            className="admin-textarea"
          />
          {err("body") && <p className="mt-1.5 text-xs text-red-700">{err("body")}</p>}
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="admin-label">{t("whyUs.icon")}</label>
            <select name="icon" defaultValue={values.icon} className="admin-input">
              {sectionIcons.map((icon) => (
                <option key={icon} value={icon}>
                  {ICON_LABELS[icon]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="admin-label">{t("whyUs.sortOrder")}</label>
            <input
              name="sortOrder"
              type="number"
              defaultValue={values.sortOrder}
              className="admin-input"
            />
          </div>
        </div>

        <label className="flex items-center gap-3 text-sm text-ink">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={values.isActive}
            className="h-4 w-4 rounded-xs border-primary/30 text-primary focus:ring-primary/30"
          />
          {t("whyUs.active")}
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
