"use client";
/**
 * components/club/VerifyForm.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The OTP step. With more than one address on the house (owner + up to two
 * members) the resident first picks where the code goes — addresses are
 * only ever shown masked. Two forms: "send" (requestOtp) and "verify"
 * (verifyOtp → session → home); the resend link submits the first one.
 * ─────────────────────────────────────────────────────────────────────────
 */
import { useActionState, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Lock, Mail } from "lucide-react";
import { sendOtpAction, verifyOtpAction } from "@/app/[locale]/club/actions";
import type { OtpRecipient, SendOtpState, VerifyOtpState } from "./types";
import { useOnline } from "./useOnline";
import { btnGhost, btnPrimary, field, focusRing, linkText } from "./ui";

export type VerifyLabels = {
  sendTo: string;
  send: string;
  sent: string;
  spam: string;
  noEmailTitle: string;
  noEmailBody: string;
  otp: string;
  privacyNote: string;
  privacy: string;
  remember: string;
  confirm: string;
  notReceived: string;
  resend: string;
  startOver: string;
  errors: Record<"wrong" | "locked" | "expired" | "tooMany" | "unknownEmail" | "format" | "noPending" | "noEmail", string>;
};

type Props = { locale: string; recipients: OtpRecipient[]; privacyHref: string; homeHref: string; labels: VerifyLabels };

export default function VerifyForm({ locale, recipients, privacyHref, homeHref, labels }: Props) {
  const [to, setTo] = useState(0);
  const [sendState, send, sending] = useActionState<SendOtpState, FormData>(sendOtpAction, {});
  const [verifyState, verify, verifying] = useActionState<VerifyOtpState, FormData>(verifyOtpAction, {});
  const online = useOnline();
  const noEmail = recipients.length === 0;
  const selected = recipients.find((r) => r.index === to) ?? recipients[0];

  const errorKey = verifyState.error ?? sendState.error;
  const error = errorKey ? labels.errors[errorKey].replace("{n}", String(verifyState.left ?? 0)) : "";
  const locked = verifyState.error === "locked" || sendState.error === "locked";
  const timedOut = errorKey === "noPending";

  if (noEmail) {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-verify-bad/30 bg-verify-bad/10 p-4 text-[13px] leading-relaxed text-club-text">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-verify-bad" aria-hidden />
        <p>
          <b className="block font-semibold">{labels.noEmailTitle}</b>
          {labels.noEmailBody}
        </p>
      </div>
    );
  }

  return (
    <div>
      <form id="club-send" action={send}>
        <input type="hidden" name="locale" value={locale} />
        {recipients.length > 1 ? (
          <fieldset className="mb-4">
            <legend className="mb-2 text-[12.5px] text-club-text-2">{labels.sendTo}</legend>
            <div className="space-y-2">
              {recipients.map((r) => (
                <label
                  key={r.index}
                  className={`flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-2xl border px-4 text-[14px] transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-club-accent ${
                    to === r.index ? "border-club-accent bg-club-surface text-club-text" : "border-club-line bg-club-surface/60 text-club-text-2"
                  }`}
                >
                  <input type="radio" name="to" value={r.index} checked={to === r.index} onChange={() => setTo(r.index)} className="sr-only" />
                  <span className="truncate">{r.masked}</span>
                  <small className="shrink-0 text-[11.5px] text-club-text-3">{r.relation}</small>
                </label>
              ))}
            </div>
          </fieldset>
        ) : (
          <input type="hidden" name="to" value={selected.index} />
        )}

        {sendState.sentTo ? (
          <div aria-live="polite">
            <p className="text-[13.5px] text-club-text">{labels.sent.replace("{e}", sendState.sentTo)}</p>
            <p className="mt-3 flex items-start gap-2.5 rounded-2xl border border-club-line bg-club-surface px-3.5 py-3 text-[12px] leading-relaxed text-club-text-2">
              <Mail size={15} className="mt-0.5 shrink-0" aria-hidden />
              {labels.spam}
            </p>
          </div>
        ) : (
          <button type="submit" disabled={sending || !online || locked} className={btnGhost}>
            <Mail size={15} aria-hidden />
            {labels.send.replace("{e}", selected.masked)}
          </button>
        )}
      </form>

      <form action={verify} className="mt-6" noValidate>
        <input type="hidden" name="locale" value={locale} />
        <label htmlFor="club-otp" className="mb-2 block text-[12.5px] text-club-text-2">
          {labels.otp}
        </label>
        <input
          id="club-otp"
          name="otp"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          placeholder="••••••"
          aria-invalid={Boolean(verifyState.error)}
          aria-describedby="club-otp-error"
          className={`${field} text-center font-mono text-[22px] tracking-[0.5em]`}
        />
        <p className="mt-3 flex flex-wrap items-center gap-x-1.5 text-[12px] text-club-text-3">
          <Lock size={12} aria-hidden />
          {labels.privacyNote} ·
          <Link href={privacyHref} className={linkText}>
            {labels.privacy}
          </Link>
        </p>
        <label className="mt-3 flex min-h-11 cursor-pointer items-start gap-3 text-[13px] leading-snug text-club-text">
          <input type="checkbox" name="remember" defaultChecked className={`mt-0.5 size-[18px] shrink-0 accent-[#b89a6c] ${focusRing}`} />
          <span>{labels.remember}</span>
        </label>
        <p id="club-otp-error" role="alert" className="mt-1 min-h-5 text-[12.5px] text-verify-bad">
          {error}
          {timedOut ? (
            <>
              {" "}
              <Link href={homeHref} className={linkText}>
                {labels.startOver}
              </Link>
            </>
          ) : null}
        </p>
        <button type="submit" disabled={verifying || !online || locked} className={`${btnPrimary} mt-2`}>
          {labels.confirm}
        </button>
      </form>

      {sendState.sentTo ? (
        <p className="mt-4 text-center text-[13px] text-club-text-2">
          {labels.notReceived}{" "}
          <button type="submit" form="club-send" disabled={sending || !online || locked} className={`min-h-11 px-1 ${linkText} disabled:opacity-50`}>
            {labels.resend}
          </button>
        </p>
      ) : null}
    </div>
  );
}
