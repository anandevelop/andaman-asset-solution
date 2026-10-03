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
 *
 * THE TWO STEPS ARE TWO SCREENS (redesign, docs: Claude outputs/admin-login-
 * redesign.md). Step two replaces step one in the card rather than growing
 * under it; the email and password stay in state and are sent again with
 * the code, exactly as before. The code goes in six boxes that are one
 * real input (login/CodeInput.tsx) and submits itself at the sixth digit.
 *
 * ONE SUBMIT AT A TIME. The auto-submit and a following Enter or click on
 * "Verify code" would otherwise post the same code twice, and the second
 * is refused as a replay. A ref, not the `pending` state, decides: two
 * events in one tick both read the state as it was before either ran.
 * For the same reason the verify button stays enabled and keeps its name
 * while a code is in flight — a click on it is simply ignored, rather than
 * left waiting on a button that has changed its label or gone disabled.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useTranslations } from "next-intl";
import { AlertCircle, ArrowLeft, CheckCircle2, ClipboardPaste, Eye, EyeOff, Loader2, TriangleAlert } from "lucide-react";
import CodeInput, { acceptCode, type CodeMode, type CodeState } from "@/components/admin/login/CodeInput";

type Props = { callbackUrl: string };

/** Mirrors the constants thrown by authorize() in lib/auth.ts. */
const TOTP_REQUIRED = "TOTP_REQUIRED";
const TOTP_INVALID = "TOTP_INVALID";
const TOTP_LOCKED = "TOTP_LOCKED";

function greetingKey(hour: number) {
  if (hour < 12) return "greetingMorning";
  if (hour < 17) return "greetingAfternoon";
  if (hour < 21) return "greetingEvening";
  return "greetingNight";
}

const FIELD =
  "login-field peer h-[52px] w-full rounded-xl border border-[rgba(41,102,130,.35)] bg-surface-raised pb-1.5 pl-3.5 pr-11 pt-5 text-[15px] text-ink outline-none transition-[border-color,box-shadow] focus:border-primary-500 focus:shadow-[0_0_0_4px_rgba(41,102,130,.22)]";
const FLOAT_LABEL =
  "pointer-events-none absolute left-3.5 top-4 text-sm text-ink-muted transition-all duration-200 peer-focus:top-1.5 peer-focus:text-[11px] peer-[:not(:placeholder-shown)]:top-1.5 peer-[:not(:placeholder-shown)]:text-[11px]";

export default function LoginForm({ callbackUrl }: Props) {
  const t = useTranslations("auth");
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"credentials" | "code">("credentials");
  const [codeMode, setCodeMode] = useState<CodeMode>("totp");
  const [codeState, setCodeState] = useState<CodeState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  /** Set after mount: the server cannot know the reader's hour. */
  const [greeting, setGreeting] = useState<string | null>(null);
  /** The card shakes once on a refused code. A class toggled off when its
   *  animation ends — not a key, which would remount the form and take
   *  focus out of the code field. */
  const [shaking, setShaking] = useState(false);

  const pendingRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  /** Move focus to the code once step two has rendered — only on arrival. */
  const focusCodeNext = useRef(false);

  useEffect(() => {
    setGreeting(t(greetingKey(new Date().getHours())));
  }, [t]);

  useEffect(() => {
    if (step === "code" && focusCodeNext.current) {
      focusCodeNext.current = false;
      codeRef.current?.focus();
    }
  }, [step]);

  // The sixth digit submits — through requestSubmit, so it is the same
  // path (and the same guard) as Enter and the button.
  useEffect(() => {
    if (step === "code" && codeMode === "totp" && code.length === 6 && !pendingRef.current) {
      formRef.current?.requestSubmit();
    }
  }, [code, step, codeMode]);

  function finish() {
    pendingRef.current = false;
    setPending(false);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setError(null);
    if (step === "code") setCodeState("idle");

    try {
      const result = await signIn("credentials", {
        email,
        password,
        totp: step === "code" ? code : "",
        redirect: false,
      });

      if (!result || result.error) {
        switch (result?.error) {
          case TOTP_REQUIRED:
            // Password accepted. Show step two and put focus in the code,
            // so an authenticator can be typed without reaching for a mouse.
            focusCodeNext.current = true;
            setStep("code");
            finish();
            return;

          case TOTP_INVALID:
            // Focus stays where it is — in the code field — so the next
            // code can simply be typed (the e2e suite relies on this).
            setCode("");
            setCodeState("error");
            setShaking(true);
            setError(t("invalidCode"));
            finish();
            return;

          case TOTP_LOCKED:
            setCode("");
            setCodeState("locked");
            setError(t("codeLocked"));
            finish();
            return;

          default:
            // Back to step one: the password itself was rejected.
            setStep("credentials");
            setCode("");
            setPassword("");
            setCodeMode("totp");
            setCodeState("idle");
            setError(t("invalidCredentials"));
            finish();
            requestAnimationFrame(() => passwordRef.current?.focus());
            return;
        }
      }

      // Stays pending until the page changes; no success screen to wait on.
      if (step === "code") setCodeState("success");
      // refresh() clears the router cache so the admin layout re-renders
      // server-side with the new session instead of a stale anonymous one.
      router.replace(callbackUrl);
      router.refresh();
    } catch {
      setError(t("unexpectedError"));
      finish();
    }
  }

  function changeAccount() {
    setStep("credentials");
    setCode("");
    setPassword("");
    setError(null);
    setCodeMode("totp");
    setCodeState("idle");
    requestAnimationFrame(() => passwordRef.current?.focus());
  }

  async function pasteCode() {
    try {
      const text = await navigator.clipboard.readText();
      const next = acceptCode(text.trim(), codeMode);
      setCodeMode(next.mode);
      setCode(next.value);
    } catch {
      // Permission refused or no clipboard: the field takes a normal paste.
    }
    codeRef.current?.focus();
  }

  const onCapsKey = (event: React.KeyboardEvent<HTMLInputElement>) =>
    setCapsLock(event.getModifierState("CapsLock"));

  const alert = error && (
    <div
      role="alert"
      className="login-error mb-4 flex items-start gap-2 rounded-[10px] bg-[#fdeceb] px-3 py-2.5 text-[13px] text-[#b3261e]"
    >
      <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden />
      <span>{error}</span>
    </div>
  );

  return (
    <div
      className={shaking ? "login-shake" : undefined}
      onAnimationEnd={(event) => {
        // Only the shake itself — the boxes' and bars' animations bubble.
        if (event.target === event.currentTarget) setShaking(false);
      }}
    >
      {/* Two steps, as two bars; the heading already says which. */}
      <div aria-hidden className="mb-[18px] flex gap-1.5">
        {[0, 1].map((index) => (
          <span key={index} className="relative h-1 flex-1 overflow-hidden rounded-full bg-primary/15">
            {(index === 0 || step === "code") && (
              <span className="login-fill absolute inset-0 rounded-full bg-linear-to-r from-[#296682] to-[#e8b384]" />
            )}
          </span>
        ))}
      </div>

      <form ref={formRef} onSubmit={onSubmit} noValidate>
        {step === "credentials" ? (
          <>
            <p className="min-h-5 text-[13px] text-ink-muted">{greeting}</p>
            <h1 className="mt-0.5 text-2xl font-semibold tracking-[-0.01em] text-ink">{t("signInTitle")}</h1>
            <p className="mb-[22px] mt-1 text-[13px] leading-relaxed text-ink-muted">{t("signInSubtitle")}</p>

            {alert}

            <div className="relative mb-3">
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                required
                placeholder=" "
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className={FIELD}
              />
              <label htmlFor="email" className={FLOAT_LABEL}>
                {t("email")}
              </label>
            </div>

            <div className="relative">
              <input
                ref={passwordRef}
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                placeholder=" "
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                onKeyDown={onCapsKey}
                onKeyUp={onCapsKey}
                className={FIELD}
              />
              <label htmlFor="password" className={FLOAT_LABEL}>
                {t("password")}
              </label>
              {/* Named by its content, not aria-label: getByLabel("Password")
                  matches aria-labels too, and "Show password" would make the
                  field's own locator ambiguous. */}
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                aria-pressed={showPassword}
                className="absolute right-2 top-2.5 grid h-8 w-8 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-primary/5 hover:text-ink"
              >
                {showPassword ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
                <span className="sr-only">{showPassword ? t("hidePassword") : t("showPassword")}</span>
              </button>
            </div>
            {/* aria-live, not role="alert": the e2e helper reads every
                non-empty alert as a sign-in error. */}
            <p aria-live="polite" className="min-h-0 text-xs text-[#8a5a00]">
              {capsLock && (
                <span className="login-warn mt-2 flex items-center gap-1.5 rounded-lg bg-[#fff4e0] px-2.5 py-1.5">
                  <TriangleAlert size={13} aria-hidden />
                  {t("capsLockOn")}
                </span>
              )}
            </p>

            <p className="mb-[18px] mt-3 text-xs text-ink-muted">{t("forgotPasswordHint")}</p>

            <button
              type="submit"
              disabled={pending}
              className="login-primary relative flex h-[46px] w-full items-center justify-center gap-2.5 rounded-xl bg-primary text-[14.5px] font-medium text-white shadow-[0_8px_20px_-10px_rgba(8,53,81,.8)] transition-[background-color,transform] hover:bg-[#0b4468] active:scale-[.985] disabled:opacity-60"
            >
              {pending ? (
                <>
                  <Loader2 size={16} className="animate-spin" aria-hidden />
                  {t("submitting")}
                </>
              ) : (
                <>
                  {t("submit")}
                  <span aria-hidden className="absolute right-4 hidden font-mono text-xs text-white/70 sm:inline">
                    ↵
                  </span>
                </>
              )}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={changeAccount}
              className="mb-3 inline-flex items-center gap-1.5 text-[13px] text-ink-muted transition-colors hover:text-ink"
            >
              <ArrowLeft size={14} aria-hidden />
              {t("changeAccount")}
            </button>
            <h1 className="text-2xl font-semibold tracking-[-0.01em] text-ink">{t("codeStepTitle")}</h1>

            <p className="login-soft mb-4 mt-3 flex items-center gap-2 rounded-xl bg-primary/[.04] px-3 py-2.5 text-[13px] text-ink-muted">
              <CheckCircle2 size={15} aria-hidden className="shrink-0 text-[#17663f]" />
              <span className="min-w-0 truncate">
                {t("passwordAccepted")} · <b className="font-medium text-ink">{email}</b>
              </span>
            </p>

            {alert}

            <p className="mb-3.5 text-[12.5px] leading-relaxed text-ink-muted">
              {codeMode === "totp" ? `${t("codePrompt")} ${t("codeAutoSubmit")}` : t("codeHint")}
            </p>

            <CodeInput
              value={code}
              onChange={(value) => {
                setCode(value);
                if (codeState === "error") setCodeState("idle");
              }}
              mode={codeMode}
              onModeChange={setCodeMode}
              state={codeState}
              inputRef={codeRef}
              label={t("codeLabel")}
            />

            <div className="mb-[18px] mt-3 flex items-center justify-between gap-3 text-xs">
              {codeMode === "totp" ? (
                <>
                  <button
                    type="button"
                    onClick={pasteCode}
                    className="inline-flex items-center gap-1.5 text-ink-muted transition-colors hover:text-ink"
                  >
                    <ClipboardPaste size={13} aria-hidden />
                    {t("pasteCode")}
                  </button>
                  <span aria-live="polite" className="font-mono tabular-nums text-ink-muted">
                    {code.length} / 6
                  </span>
                </>
              ) : (
                <span />
              )}
            </div>

            <button
              type="submit"
              aria-busy={pending}
              className="login-primary relative flex h-[46px] w-full items-center justify-center gap-2.5 rounded-xl bg-primary text-[14.5px] font-medium text-white shadow-[0_8px_20px_-10px_rgba(8,53,81,.8)] transition-[background-color,transform] hover:bg-[#0b4468] active:scale-[.985] aria-busy:opacity-80"
            >
              {pending && <Loader2 size={16} className="animate-spin" aria-hidden />}
              {t("verify")}
            </button>

            <p className="mt-4 text-center text-xs">
              <button
                type="button"
                onClick={() => {
                  setCodeMode((mode) => (mode === "totp" ? "recovery" : "totp"));
                  setCode("");
                  setError(null);
                  if (codeState !== "locked") setCodeState("idle");
                  requestAnimationFrame(() => codeRef.current?.focus());
                }}
                className="login-link text-[#7a4a1d] underline-offset-2 hover:underline"
              >
                {codeMode === "totp" ? t("useRecoveryCode") : t("useAuthenticator")}
              </button>
            </p>
          </>
        )}
      </form>
    </div>
  );
}
