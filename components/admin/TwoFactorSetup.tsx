"use client";

/**
 * components/admin/TwoFactorSetup.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Enrolment: scan, then prove it worked.
 *
 * The code field is what completes setup — not the scan. Storing a secret
 * the user never successfully generated a code from is how people end up
 * locked out of an account they think they configured, so nothing is
 * switched on until a live code comes back.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useActionState, useEffect } from "react";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { AlertCircle, Loader2, ShieldCheck } from "lucide-react";
import RecoveryCodeList from "@/components/admin/RecoveryCodeList";
import type { TwoFactorState } from "@/app/[locale]/admin/account/security/actions";

type Props = {
  action: (state: TwoFactorState, formData: FormData) => Promise<TwoFactorState>;
  qrDataUri: string;
  secret: string;
};

const INITIAL: TwoFactorState = { ok: false };

function SubmitButton() {
  const t = useTranslations("admin");
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} className="admin-btn">
      {pending ? (
        <>
          <Loader2 size={15} className="animate-spin" aria-hidden />
          {t("common.saving")}
        </>
      ) : (
        <>
          <ShieldCheck size={15} aria-hidden />
          {t("security.enable")}
        </>
      )}
    </button>
  );
}

export default function TwoFactorSetup({ action, qrDataUri, secret }: Props) {
  const t = useTranslations("admin.security");
  const { update } = useSession();
  const [state, formAction] = useActionState(action, INITIAL);

  const enrolled = state.ok && Boolean(state.codes);

  /*
    Rewrite the session cookie the moment enrolment lands.

    The enrolment gate in middleware.ts reads the JWT cookie directly — it
    never runs the jwt callback — so until the cookie is reissued it still
    says "no authenticator" and would bounce the user straight back here
    after they finished. update() forces NextAuth to mint a fresh token.
  */
  useEffect(() => {
    if (enrolled) void update();
  }, [enrolled, update]);

  // Enrolment succeeded — the codes replace the form entirely, so nobody
  // navigates away from the only screen that will ever show them.
  if (state.ok && state.codes) {
    return <RecoveryCodeList codes={state.codes} />;
  }

  return (
    <div className="space-y-6">
      <ol className="space-y-6">
        <li>
          <p className="text-sm font-medium text-primary">{t("step1")}</p>
          <p className="mt-1 text-sm text-ink-muted">{t("step1Hint")}</p>
        </li>

        <li>
          <p className="text-sm font-medium text-primary">{t("step2")}</p>
          <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start">
            <Image
              src={qrDataUri}
              alt={t("qrAlt")}
              width={200}
              height={200}
              unoptimized
              className="rounded-xs border border-slate-200 bg-white p-2"
            />
            <div className="min-w-0">
              <p className="text-sm text-ink-muted">{t("manualHint")}</p>
              <code className="mt-2 block break-all rounded-xs bg-slate-100 px-3 py-2 font-mono text-sm tracking-wider text-ink">
                {secret}
              </code>
            </div>
          </div>
        </li>

        <li>
          <p className="text-sm font-medium text-primary">{t("step3")}</p>

          <form action={formAction} className="mt-3 space-y-4">
            {!state.ok && state.message && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-xs border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
              >
                <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden />
                <span>{t(`errors.${state.message}` as never)}</span>
              </div>
            )}

            <div className="max-w-[16rem]">
              <label htmlFor="code" className="admin-label">
                {t("codeLabel")}
              </label>
              <input
                id="code"
                name="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                className="admin-input font-mono tracking-widest"
                placeholder="000000"
              />
            </div>

            <SubmitButton />
          </form>
        </li>
      </ol>
    </div>
  );
}
