"use client";

/**
 * components/admin/LoginForm.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Credentials sign-in. Uses `redirect: false` so a failed attempt can show
 * an inline error instead of a full-page bounce to NextAuth's error route.
 *
 * The error copy is deliberately identical for "unknown email" and "wrong
 * password" — telling them apart would confirm which addresses are staff.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useTranslations } from "next-intl";
import { AlertCircle, Loader2 } from "lucide-react";

type Props = { callbackUrl: string };

export default function LoginForm({ callbackUrl }: Props) {
  const t = useTranslations("auth");
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (!result || result.error) {
        setError(t("invalidCredentials"));
        setPending(false);
        return;
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
          className="flex items-start gap-2 rounded-sm border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
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
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="admin-input"
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
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="admin-input"
        />
      </div>

      <button type="submit" disabled={pending} className="btn-primary w-full disabled:opacity-60">
        {pending ? (
          <>
            <Loader2 size={16} className="animate-spin" aria-hidden />
            {t("submitting")}
          </>
        ) : (
          t("submit")
        )}
      </button>
    </form>
  );
}
