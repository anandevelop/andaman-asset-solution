"use client";

/**
 * components/admin/SettingsForm.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Site settings.
 *
 * Every field shows its committed default as the placeholder, and a field
 * left blank falls back to it. That makes "reset this to the default" a
 * discoverable action — clear the box — rather than a button nobody finds,
 * and it shows the operator what they are overriding before they type.
 *
 * Overridden fields are marked, so the difference between "this is the
 * value from the codebase" and "someone changed this" is visible at a
 * glance six months from now.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { AlertCircle, CheckCircle2, Loader2, RotateCcw } from "lucide-react";
import SaveToast from "@/components/admin/SaveToast";
import ImageUploader from "@/components/admin/ImageUploader";
import type { SettingsFormState } from "@/app/[locale]/admin/(system)/settings/actions";

export type SettingField = {
  key: string;
  label: string;
  hint?: string;
  /** The committed value from config/site.ts. */
  placeholder: string;
  value: string;
  overridden: boolean;
  type?: "text" | "url" | "email" | "tel";
  multiline?: boolean;
  /**
   * "image" swaps the text input for an ImageUploader.
   *
   * An image has no placeholder — there is nothing to grey out behind an
   * empty box — so `effective` below carries what the uploader previews
   * and the Changed/Default badge does the job the placeholder does for
   * text fields.
   */
  kind?: "text" | "image";
  /**
   * Image fields: the value in force — the override, or the committed
   * default when there is none. The action treats a submitted value equal
   * to the default as a clear, so previewing the default here cannot
   * accidentally write a row.
   */
  effective?: string;
  /**
   * Soft budget for a meta title or description, rendered as a counter.
   *
   * Advice, not a limit. Google truncates on pixel width rather than
   * character count, and the same 60 characters are two different widths
   * in Thai and in Chinese — so going over is a shortened search snippet,
   * not an invalid value, and the field still saves.
   */
  recommendedLength?: number;
};

export type SettingGroup = { title: string; fields: SettingField[] };

type Props = {
  action: (
    state: SettingsFormState,
    formData: FormData,
  ) => Promise<SettingsFormState>;
  groups: SettingGroup[];
  labels: { save: string; overridden: string; usingDefault: string };
};

const INITIAL: SettingsFormState = { ok: false };

/**
 * One text or textarea setting, with an optional length counter.
 *
 * A component rather than inline JSX because the counter needs state, and
 * a hook cannot live inside the `.map()` that renders the group.
 */
function TextSetting({
  field,
  error,
}: {
  field: SettingField;
  error?: string;
}) {
  /*
    Counts what is live, which for an untouched field is the placeholder.

    Counting field.value would read 0 under a box that visibly contains a
    96-character default — technically true (the box is empty, that text is
    a placeholder) and useless as an answer to "will Google truncate this".
    Typing replaces the default, so the count jumping from 96 to 1 on the
    first keystroke is the honest reading of what just happened.
  */
  const [length, setLength] = useState(
    field.value.length > 0 ? field.value.length : field.placeholder.length,
  );
  const budget = field.recommendedLength;
  const over = budget !== undefined && length > budget;

  const shared = {
    id: field.key,
    name: field.key,
    defaultValue: field.value,
    placeholder: field.placeholder,
    onChange: (event: { target: { value: string } }) =>
      setLength(event.target.value.length),
  };

  return (
    <>
      {field.multiline ? (
        <textarea {...shared} rows={2} className="admin-textarea" />
      ) : (
        <input {...shared} type={field.type ?? "text"} className="admin-input" />
      )}

      {budget !== undefined && (
        <p
          className={`mt-1 text-right text-[11px] tabular-nums ${
            over ? "text-amber-700" : "text-ink-muted"
          }`}
        >
          {/* Amber, never red, and the field still saves: over budget means
              a search engine will shorten the snippet, not that the value
              is wrong. */}
          {length} / {budget}
        </p>
      )}

      {field.hint && !error && <p className="admin-hint">{field.hint}</p>}
    </>
  );
}

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

export default function SettingsForm({ action, groups, labels }: Props) {
  const t = useTranslations("admin");
  const [state, formAction] = useActionState(action, INITIAL);

  return (
    <form action={formAction} className="space-y-6">
      {state.ok && (
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

      {groups.map((group) => (
        <section key={group.title} className="admin-card space-y-5">
          <h2 className="admin-section-title">{group.title}</h2>

          <div className="grid gap-5 sm:grid-cols-2">
            {group.fields.map((field) => {
              const error = state.fields?.[field.key];
              const isImage = field.kind === "image";

              const badge = (
                <span
                  className={`text-[10px] uppercase tracking-wide ${
                    field.overridden ? "text-accent-700" : "text-ink-muted"
                  }`}
                >
                  {field.overridden ? labels.overridden : labels.usingDefault}
                </span>
              );

              return (
                <div
                  key={field.key}
                  className={
                    field.multiline || isImage ? "sm:col-span-2" : undefined
                  }
                >
                  {/* ImageUploader renders its own label row (with the
                      paste-a-URL toggle in the same slot this badge would
                      take), so an image field gets the badge alone above
                      it rather than a second label beside it. */}
                  {isImage ? (
                    <div className="mb-1 flex justify-end">{badge}</div>
                  ) : (
                    <div className="mb-1.5 flex items-baseline justify-between gap-3">
                      <label htmlFor={field.key} className="admin-label mb-0">
                        {field.label}
                      </label>
                      {badge}
                    </div>
                  )}

                  {isImage ? (
                    <ImageUploader
                      name={field.key}
                      prefix="branding"
                      /* The value in force, not the override: an uploader
                         has to preview something, and showing the current
                         icon is the only useful thing to show. Clearing it
                         with the trash button posts "", which the action
                         reads as "restore the default" — the same reset
                         affordance every text field here has. */
                      defaultValue={field.effective ?? ""}
                      label={field.label}
                      hint={field.hint}
                    />
                  ) : (
                    <TextSetting field={field} error={error} />
                  )}

                  {error && (
                    <p className="mt-1.5 flex items-center gap-1.5 text-xs text-red-700">
                      <AlertCircle size={13} aria-hidden />
                      {error}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <div className="flex flex-wrap items-center gap-4">
        <SubmitButton label={labels.save} />

        <p className="flex items-center gap-1.5 text-xs text-ink-muted">
          <RotateCcw size={12} aria-hidden />
          {t("settings.resetHint")}
        </p>
      </div>
    </form>
  );
}
