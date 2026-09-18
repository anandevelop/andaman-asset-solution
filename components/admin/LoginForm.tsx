"use client";

/**
 * components/admin/LoginForm.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Credentials sign-in, in one or two steps.
 *
 * Uses `redirect: false` so a failed attempt can show an inline error
 * instead of a full-page bounce to NextAuth's error route.
 *
 * Step two only appears once the server says the account has 2FA — asking
 * everyone for a code up front would tell a stranger which accounts are
 * protected. Email and password are resubmitted with the code rather than
 * held in a server-side "half-authenticated" record: no pending-login state
 * to expire, invalidate, or leak.
 *
 * The error copy is deliberately identical for "unknown email" and "wrong
 * password" — telling them apart would confirm which addresses are staff.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useTranslations } from "next-intl";
import { AlertCircle, Loader2, ShieldCheck } from "lucide-react";

type Props = { callbackUrl: string };

/** Mirrors the constants thrown by authorize() in lib/auth.ts. */
const TOTP_REQUIRED = "TOTP_REQUIRED";
const TOTP_INVALID = "TOTP_INVALID";
const TOTP_LOCKED = "TOTP_LOCKED";

export default function LoginForm({ callbackUrl }: Props) {
  const t = useTranslations("auth");
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [needsCode, setNeedsCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const codeRef = useRef<HTMLInputElement>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      const result = await signIn("credentials", {
        email,
        password,
        totp: code,
        redirect: false,
      });

      if (!result || result.error) {
        switch (result?.error) {
          case TOTP_REQUIRED:
            // Password accepted. Reveal the code field and move focus to it
            // so an authenticator can be typed without reaching for a mouse.
            setNeedsCode(true);
            setPending(false);
            requestAnimationFrame(() => codeRef.current?.focus());
            return;

          case TOTP_INVALID:
            setNeedsCode(true);
            setCode("");
            setError(t("invalidCode"));
            setPending(false);
            return;

          case TOTP_LOCKED:
            setNeedsCode(true);
            setCode("");
            setError(t("codeLocked"));
            setPending(false);
            return;

          default:
            // Back to step one: the password itself was rejected.
            setNeedsCode(false);
            setCode("");
            setError(t("invalidCredentials"));
            setPending(false);
            return;
        }
      }

      // refresh() clears the router cache so the admin layout re-renders
      // server-side with the new session instead of a stale anonymous one.
      router.replace(callbackUrl);
      router.refresh();
    } catch {
      setError(t("unexpectedError"));
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xs border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      )}

      <div>
        <label htmlFor="email" className="admin-label">
          {t("email")}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          readOnly={needsCode}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="admin-input read-only:bg-slate-50 read-only:text-ink-muted"
        />
      </div>

      <div>
        <label htmlFor="password" className="admin-label">
          {t("password")}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          readOnly={needsCode}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="admin-input read-only:bg-slate-50 read-only:text-ink-muted"
        />
      </div>

      {needsCode && (
        <div className="rounded-xs border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 flex items-start gap-2 text-sm text-ink-muted">
            <ShieldCheck size={16} className="mt-0.5 shrink-0 text-primary" aria-hidden />
            <span>{t("codePrompt")}</span>
          </div>

          <label htmlFor="totp" className="admin-label">
            {t("codeLabel")}
          </label>
          <input
            ref={codeRef}
            id="totp"
            name="totp"
            type="text"
            /* Not `type="number"`: a recovery code goes in this same box, and
               a numeric input would refuse it. */
            inputMode="text"
            autoComplete="one-time-code"
            autoCapitalize="characters"
            spellCheck={false}
            required
            value={code}
            onChange={(event) => setCode(event.target.value)}
            className="admin-input font-mono tracking-widest"
            placeholder="000000"
          />
          <p className="mt-2 text-xs text-ink-muted">{t("codeHint")}</p>
        </div>
      )}

      <button type="submit" disabled={pending} className="btn-primary w-full disabled:opacity-60">
        {pending ? (
          <>
            <Loader2 size={16} className="animate-spin" aria-hidden />
            {t("submitting")}
          </>
        ) : needsCode ? (
          t("verify")
        ) : (
          t("submit")
        )}
      </button>
    </form>
  );
}
