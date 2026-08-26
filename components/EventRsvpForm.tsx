"use client";

/**
 * components/EventRsvpForm.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * RSVP form, modelled on LeadForm so the two feel like one system.
 *
 * `seatsLeft` is a render-time snapshot and will go stale on a cached page,
 * so it caps the party-size selector but is never trusted as the authority.
 * The server re-checks inside a transaction and can still answer 409 — that
 * response is surfaced with the real remaining count rather than a generic
 * failure, because "only 2 seats left" is actionable and "error" is not.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import {
  eventRegistrationSchema,
  type EventRegistrationInput,
} from "@/lib/validations";
import RecaptchaProvider, { useRecaptchaToken } from "@/components/RecaptchaProvider";
import { trackRsvp } from "@/lib/analytics";
import { siteConfig } from "@/config/site";

type Props = {
  eventId: string;
  /** Null when the event has unlimited capacity. */
  seatsLeft: number | null;
};

type Status =
  | "idle"
  | "submitting"
  | "success"
  | "error"
  | "full"
  | "blocked"
  | "rateLimited";

const MAX_PARTY = 10;

export default function EventRsvpForm({ eventId, seatsLeft }: Props) {
  const t = useTranslations("events.rsvp");
  // seatsLeft lives on the parent namespace — the listing cards and this
  // form should never disagree about how availability is phrased.
  const tEvent = useTranslations("events");
  const locale = useLocale();
  const getRecaptchaToken = useRecaptchaToken();
  const [status, setStatus] = useState<Status>("idle");
  const [remaining, setRemaining] = useState<number | null>(seatsLeft);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<EventRegistrationInput>({
    resolver: zodResolver(eventRegistrationSchema),
    defaultValues: { partySize: 1 },
  });

  const cap = Math.min(MAX_PARTY, remaining ?? MAX_PARTY);
  const soldOut = remaining !== null && remaining <= 0;

  const onSubmit = async (data: EventRegistrationInput) => {
    setStatus("submitting");

    try {
      const recaptchaToken = await getRecaptchaToken("event_rsvp");

      const response = await fetch(`/api/events/${eventId}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          recaptchaToken,
          consentVersion: siteConfig.legal.consentVersion,
          // Which language to send the confirmation email in — the page
          // the visitor is actually looking at.
          locale,
        }),
      });

      if (response.status === 429) {
        setStatus("rateLimited");
        return;
      }

      if (response.status === 403) {
        setStatus("blocked");
        return;
      }

      const result = await response.json().catch(() => null);

      if (response.status === 409 && result?.error === "CAPACITY_EXCEEDED") {
        // Correct the stale snapshot so the selector reflects reality.
        setRemaining(result.seatsLeft ?? 0);
        setStatus("full");
        return;
      }

      if (!response.ok) {
        if (response.status === 422 && result?.fields) {
          for (const [field, message] of Object.entries(
            result.fields as Record<string, string>,
          )) {
            if (field in data) {
              setError(field as keyof EventRegistrationInput, { message });
            }
          }
        }
        setStatus("error");
        return;
      }

      setStatus("success");
      trackRsvp({ eventId, partySize: data.partySize });
      reset({ partySize: 1 });
    } catch {
      setStatus("error");
    }
  };

  if (status === "success") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center gap-3 py-10 text-center"
      >
        <CheckCircle2 size={30} strokeWidth={1.5} className="text-emerald-600" aria-hidden />
        <p className="text-sm leading-relaxed text-ink/70">{t("success")}</p>
      </motion.div>
    );
  }

  if (soldOut && status !== "full") {
    return (
      <p className="rounded-sm border border-primary/15 bg-primary/[0.03] px-5 py-8 text-center text-sm text-ink/70">
        {t("soldOut")}
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      <AnimatePresence>
        {(status === "error" ||
          status === "full" ||
          status === "blocked" ||
          status === "rateLimited") && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            role="alert"
            className="flex items-start gap-2 rounded-sm border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          >
            <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden />
            <span>
              {status === "full"
                ? t("capacityExceeded", { seatsLeft: remaining ?? 0 })
                : status === "rateLimited"
                  ? t("rateLimited")
                  : status === "blocked"
                    ? t("blocked")
                    : t("error")}
            </span>
          </motion.p>
        )}
      </AnimatePresence>

      {/* Honeypot — hidden from people, irresistible to bots. */}
      <div aria-hidden className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="rsvp-company">Company</label>
        <input id="rsvp-company" type="text" tabIndex={-1} autoComplete="off" name="company" />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="rsvp-name" className="admin-label">
            {t("name")}
          </label>
          <input id="rsvp-name" {...register("name")} className="admin-input" />
          {errors.name && (
            <p className="mt-1.5 text-xs text-red-700">{errors.name.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="rsvp-email" className="admin-label">
            {t("email")}
          </label>
          <input
            id="rsvp-email"
            type="email"
            autoComplete="email"
            {...register("email")}
            className="admin-input"
          />
          {errors.email && (
            <p className="mt-1.5 text-xs text-red-700">{errors.email.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="rsvp-phone" className="admin-label">
            {t("phone")}
          </label>
          <input
            id="rsvp-phone"
            type="tel"
            autoComplete="tel"
            {...register("phone")}
            className="admin-input"
          />
          {errors.phone && (
            <p className="mt-1.5 text-xs text-red-700">{errors.phone.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="rsvp-party" className="admin-label">
            {t("partySize")}
          </label>
          <select
            id="rsvp-party"
            {...register("partySize")}
            className="admin-input"
          >
            {Array.from({ length: Math.max(1, cap) }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          {remaining !== null && (
            <p className="admin-hint">{tEvent("seatsLeft", { count: remaining })}</p>
          )}
        </div>
      </div>

      <div>
        <label htmlFor="rsvp-notes" className="admin-label">
          {t("notes")}
        </label>
        <textarea id="rsvp-notes" rows={3} {...register("notes")} className="admin-textarea" />
      </div>

      <label className="flex items-start gap-3 text-sm text-ink/70">
        <input
          type="checkbox"
          {...register("consentGiven")}
          className="mt-0.5 h-4 w-4 rounded-sm border-primary/30 text-primary focus:ring-primary/30"
        />
        <span className="text-xs leading-relaxed">
          {t("consent")}{" "}
          <a
            href={siteConfig.legal.privacyPolicyPath}
            className="text-accent-700 underline underline-offset-2"
          >
            {t("privacyPolicy")}
          </a>
        </span>
      </label>
      {errors.consentGiven && (
        <p className="text-xs text-red-700">{errors.consentGiven.message}</p>
      )}

      <button
        type="submit"
        disabled={status === "submitting"}
        className="btn-primary w-full disabled:opacity-60"
      >
        {status === "submitting" ? (
          <>
            <Loader2 size={16} className="animate-spin" aria-hidden />
            {t("submitting")}
          </>
        ) : (
          t("submit")
        )}
      </button>

      <RecaptchaProvider />
    </form>
  );
}
