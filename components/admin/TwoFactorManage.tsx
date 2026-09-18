"use client";

/**
 * components/admin/TwoFactorManage.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Two independent forms for an account that already has 2FA: mint a new set
 * of recovery codes, or turn the whole thing off.
 *
 * Separate forms, separate submits — sharing one would let a mistyped
 * intention do the destructive thing. Disabling asks for the password as
 * well as a code: it is the only action here that lowers the account's
 * security, so it costs the same as signing in from scratch.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useActionState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { AlertCircle, Loader2, RefreshCw, ShieldOff } from "lucide-react";
import RecoveryCodeList from "@/components/admin/RecoveryCodeList";
import type { TwoFactorState } from "@/app/[locale]/admin/account/security/actions";

type Action = (state: TwoFactorState, formData: FormData) => Promise<TwoFactorState>;

type Props = {
  regenerateAction: Action;
  disableAction: Action;
  /** Role is required to use 2FA — disabling only sends them back to setup. */
  mandatory: boolean;
};

const INITIAL: TwoFactorState = { ok: false };

function SubmitButton({
  label,
  icon,
  tone = "default",
}: {
  label: string;
  icon: React.ReactNode;
  tone?: "default" | "danger";
}) {
  const t = useTranslations("admin.common");
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={
        tone === "danger"
          ? "admin-btn border-red-200 text-red-700 hover:bg-red-50"
          : "admin-btn"
      }
    >
      {pending ? (
        <>
          <Loader2 size={15} className="animate-spin" aria-hidden />
          {t("saving")}
        </>
      ) : (
        <>
          {icon}
          {label}
        </>
      )}
    </button>
  );
}

function ErrorBanner({ state }: { state: TwoFactorState }) {
  const t = useTranslations("admin.security");

  if (state.ok || !state.message) return null;

  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-xs border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
    >
      <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden />
      <span>{t(`errors.${state.message}` as never)}</span>
    </div>
  );
}

export default function TwoFactorManage({
  regenerateAction,
  disableAction,
  mandatory,
}: Props) {
  const t = useTranslations("admin.security");
  const { update } = useSession();
  const [regenState, regenerate] = useActionState(regenerateAction, INITIAL);
  const [disableState, disable] = useActionState(disableAction, INITIAL);

  const disabled = disableState.ok && disableState.message === "DISABLED";

  // Same reason as enrolment, in the other direction: middleware reads the
  // cookie, so the claim has to be reissued for the gate to notice that the
  // authenticator is gone.
  useEffect(() => {
    if (disabled) void update();
  }, [disabled, update]);

  if (regenState.ok && regenState.codes) {
    return <RecoveryCodeList codes={regenState.codes} />;
  }

  return (
    <div className="space-y-8">
      {disabled && (
        <div
          role="status"
          className="rounded-xs border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          {mandatory ? t("disabledMandatory") : t("disabledOk")}
        </div>
      )}

      {/* ── New recovery codes ─────────────────────────────────────── */}
      <form action={regenerate} className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-primary">{t("regenTitle")}</h3>
          <p className="mt-1 text-sm text-ink-muted">{t("regenHint")}</p>
        </div>

        <ErrorBanner state={regenState} />

        <div className="max-w-[16rem]">
          <label htmlFor="regen-code" className="admin-label">
            {t("codeLabel")}
          </label>
          <input
            id="regen-code"
            name="code"
            type="text"
            inputMode="text"
            autoComplete="one-time-code"
            required
            className="admin-input font-mono tracking-widest"
            placeholder="000000"
          />
        </div>

        <SubmitButton label={t("regenerate")} icon={<RefreshCw size={15} aria-hidden />} />
      </form>

      {/* ── Turn it off ────────────────────────────────────────────── */}
      <form action={disable} className="space-y-4 border-t border-slate-200 pt-8">
        <div>
          <h3 className="text-sm font-semibold text-primary">{t("disableTitle")}</h3>
          <p className="mt-1 text-sm text-ink-muted">
            {mandatory ? t("disableHintMandatory") : t("disableHint")}
          </p>
        </div>

        <ErrorBanner state={disableState} />

        <div className="grid gap-4 sm:max-w-md sm:grid-cols-2">
          <div>
            <label htmlFor="disable-password" className="admin-label">
              {t("passwordLabel")}
            </label>
            <input
              id="disable-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="admin-input"
            />
          </div>

          <div>
            <label htmlFor="disable-code" className="admin-label">
              {t("codeLabel")}
            </label>
            <input
              id="disable-code"
              name="code"
              type="text"
              inputMode="text"
              autoComplete="one-time-code"
              required
              className="admin-input font-mono tracking-widest"
              placeholder="000000"
            />
          </div>
        </div>

        <SubmitButton
          label={t("disable")}
          icon={<ShieldOff size={15} aria-hidden />}
          tone="danger"
        />
      </form>
    </div>
  );
}
