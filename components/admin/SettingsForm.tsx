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

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { AlertCircle, CheckCircle2, Loader2, RotateCcw } from "lucide-react";
import SaveToast from "@/components/admin/SaveToast";
import type { SettingsFormState } from "@/app/[locale]/admin/settings/actions";

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

              return (
                <div
                  key={field.key}
                  className={field.multiline ? "sm:col-span-2" : undefined}
                >
                  <div className="mb-1.5 flex items-baseline justify-between gap-3">
                    <label htmlFor={field.key} className="admin-label mb-0">
                      {field.label}
                    </label>

                    <span
                      className={`text-[10px] uppercase tracking-wide ${
                        field.overridden ? "text-accent-700" : "text-ink-muted"
                      }`}
                    >
                      {field.overridden ? labels.overridden : labels.usingDefault}
                    </span>
                  </div>

                  {field.multiline ? (
                    <textarea
                      id={field.key}
                      name={field.key}
                      defaultValue={field.value}
                      placeholder={field.placeholder}
                      rows={2}
                      className="admin-textarea"
                    />
                  ) : (
                    <input
                      id={field.key}
                      name={field.key}
                      type={field.type ?? "text"}
                      defaultValue={field.value}
                      placeholder={field.placeholder}
                      className="admin-input"
                    />
                  )}

                  {field.hint && !error && <p className="admin-hint">{field.hint}</p>}

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
