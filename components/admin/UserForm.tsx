"use client";

/**
 * components/admin/UserForm.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Create and edit an account. The password field only appears on create;
 * changing an existing password goes through PasswordForm, so a routine
 * name correction can never silently reset someone's credentials.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { ROLES } from "@/lib/validations";
import SaveToast from "@/components/admin/SaveToast";
import type { UserFormState } from "@/app/[locale]/admin/(system)/users/actions";

type Props = {
  action: (state: UserFormState, formData: FormData) => Promise<UserFormState>;
  mode: "create" | "edit";
  values?: {
    name: string;
    email: string;
    role: string;
    isActive: boolean;
  };
  /** True when this row is the signed-in user — role and active are frozen. */
  isSelf?: boolean;
  /** True when demoting this user would leave no super admin. */
  isLastSuperAdmin?: boolean;
  submitLabel: string;
};

const INITIAL: UserFormState = { ok: false };

const EMPTY = { name: "", email: "", role: "EDITOR", isActive: true };

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

export default function UserForm({
  action,
  mode,
  values = EMPTY,
  isSelf = false,
  isLastSuperAdmin = false,
  submitLabel,
}: Props) {
  const t = useTranslations("admin");
  const [state, formAction] = useActionState(action, INITIAL);

  // Freezing role/active for these two cases keeps the UI honest about a
  // rule the server enforces anyway.
  const locked = isSelf || isLastSuperAdmin;

  const err = (name: string) => {
    const code = state.fields?.[name];
    if (!code) return null;
    return code === "EMAIL_TAKEN" ? t("users.emailTaken") : code;
  };

  const banner = (() => {
    if (state.ok) return { tone: "ok" as const, text: t("common.saved") };
    switch (state.message) {
      case "CANNOT_DEMOTE_SELF":
        return { tone: "bad" as const, text: t("users.cannotDemoteSelf") };
      case "LAST_SUPER_ADMIN":
        return { tone: "bad" as const, text: t("users.lastSuperAdmin") };
      case "SAVE_FAILED":
      case "NOT_FOUND":
        return { tone: "bad" as const, text: t("common.error") };
      default:
        return null;
    }
  })();

  return (
    <form action={formAction} className="space-y-5">
      {banner && (
        <SaveToast tone={banner.tone === "ok" ? "success" : "error"} token={state}>
          {banner.tone === "ok" ? (
            <CheckCircle2 size={15} aria-hidden />
          ) : (
            <AlertCircle size={15} aria-hidden />
          )}
          {banner.text}
        </SaveToast>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className="admin-label">
            {t("users.name")}
          </label>
          <input
            id="name"
            name="name"
            defaultValue={values.name}
            required
            autoComplete="off"
            className="admin-input"
          />
          {err("name") && (
            <p className="mt-1.5 text-xs text-red-700">{err("name")}</p>
          )}
        </div>

        <div>
          <label htmlFor="email" className="admin-label">
            {t("users.email")}
          </label>
          <input
            id="email"
            name="email"
            type="email"
            defaultValue={values.email}
            required
            autoComplete="off"
            className="admin-input"
          />
          {err("email") && (
            <p className="mt-1.5 text-xs text-red-700">{err("email")}</p>
          )}
        </div>
      </div>

      <div>
        <label htmlFor="role" className="admin-label">
          {t("users.role")}
        </label>
        <select
          id="role"
          name="role"
          defaultValue={values.role}
          disabled={locked}
          className="admin-input max-w-xs disabled:bg-surface-muted disabled:text-ink-muted"
        >
          {ROLES.map((role) => (
            <option key={role} value={role}>
              {t(`roles.${role}` as never)}
            </option>
          ))}
        </select>

        {/* A disabled control submits nothing, so mirror the value. */}
        {locked && <input type="hidden" name="role" value={values.role} />}

        {isSelf && <p className="admin-hint">{t("users.selfLocked")}</p>}
        {!isSelf && isLastSuperAdmin && (
          <p className="admin-hint">{t("users.lastSuperAdminHint")}</p>
        )}
      </div>

      {mode === "create" && (
        <div>
          <label htmlFor="password" className="admin-label">
            {t("users.password")}
          </label>
          <input
            id="password"
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
      )}

      <label className="flex items-start gap-3 text-sm text-ink">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={values.isActive}
          disabled={locked}
          className="mt-0.5 h-4 w-4 rounded-xs border-primary/30 text-primary focus:ring-primary/30"
        />
        <span>
          {t("users.isActive")}
          <span className="mt-0.5 block text-xs text-ink-muted">
            {t("users.isActiveHint")}
          </span>
        </span>
      </label>

      {locked && values.isActive && (
        <input type="hidden" name="isActive" value="on" />
      )}

      <SubmitButton label={submitLabel} />
    </form>
  );
}
