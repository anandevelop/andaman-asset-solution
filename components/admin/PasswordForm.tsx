"use client";

/**
 * components/admin/PasswordForm.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Serves both password flows. `requireCurrent` switches on the current-
 * password field: an admin resetting someone else's credentials does not
 * know it, but a user changing their own must prove they hold it — that
 * check is what stops an unlocked laptop becoming a permanent takeover.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useActionState, useRef } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { AlertCircle, CheckCircle2, KeyRound, Loader2 } from "lucide-react";
import SaveToast from "@/components/admin/SaveToast";
import type { UserFormState } from "@/app/[locale]/admin/(system)/users/actions";

type Props = {
  action: (state: UserFormState, formData: FormData) => Promise<UserFormState>;
  requireCurrent?: boolean;
};

const INITIAL: UserFormState = { ok: false };

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
        <>
          <KeyRound size={15} aria-hidden />
          {label}
        </>
      )}
    </button>
  );
}

export default function PasswordForm({ action, requireCurrent = false }: Props) {
  const t = useTranslations("admin");
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState(action, INITIAL);

  const err = (name: string) => {
    const code = state.fields?.[name];
    if (!code) return null;
    return code === "WRONG_PASSWORD" ? t("users.wrongPassword") : code;
  };

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await formAction(formData);
        // Never leave a password sitting in the DOM after submit.
        formRef.current?.reset();
      }}
      className="space-y-5"
    >
      {state.ok && state.message === "PASSWORD_SET" && (
        <SaveToast tone="success" token={state}>
          <CheckCircle2 size={15} aria-hidden />
          {t("users.passwordChanged")}
        </SaveToast>
      )}

      {!state.ok && state.message === "SAVE_FAILED" && (
        <SaveToast tone="error" token={state}>
          <AlertCircle size={15} aria-hidden />
          {t("common.error")}
        </SaveToast>
      )}

      {requireCurrent && (
        <div>
          <label htmlFor="currentPassword" className="admin-label">
            {t("users.currentPassword")}
          </label>
          <input
            id="currentPassword"
            name="currentPassword"
            type="password"
            required
            autoComplete="current-password"
            className="admin-input max-w-md"
          />
          {err("currentPassword") && (
            <p className="mt-1.5 text-xs text-red-700">{err("currentPassword")}</p>
          )}
        </div>
      )}

      <div>
        <label htmlFor="new-password" className="admin-label">
          {t("users.newPassword")}
        </label>
        <input
          id="new-password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          className="admin-input max-w-md"
        />
        <p className="admin-hint">{t("users.passwordHint")}</p>
        {err("password") && (
          <p className="mt-1.5 text-xs text-red-700">{err("password")}</p>
        )}
      </div>

      <div>
        <label htmlFor="confirmPassword" className="admin-label">
          {t("users.confirmPassword")}
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          required
          autoComplete="new-password"
          className="admin-input max-w-md"
        />
        {err("confirmPassword") && (
          <p className="mt-1.5 text-xs text-red-700">{err("confirmPassword")}</p>
        )}
      </div>

      <SubmitButton label={t("users.setPassword")} />
    </form>
  );
}
