"use client";

/**
 * components/EventRsvpForm.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * RSVP form for agent-partner events — redesigned from a general-public
 * "name/email/phone/party size/notes" form (light card, no icons) to match
 * a client-supplied reference design: a dark navy card, one field per row
 * with a leading icon, and fields specific to a real-estate agent
 * (Agent Name, Agency/Company, WhatsApp) rather than a generic RSVP.
 *
 * Party size and free-text notes are gone — every registration is now
 * exactly one seat (one agent). The server still stores `partySize: 1` and
 * `notes: null` under the hood so the existing capacity math in
 * app/api/events/[id]/register/route.ts and lib/events.ts needed no
 * changes; see those files' comments.
 *
 * The consent checkbox is NOT in the reference screenshot but is kept —
 * this site's PDPA compliance (siteConfig.legal.consentVersion, the same
 * mechanism LeadForm and the privacy policy page use) requires it on every
 * form that collects personal data, RSVP included.
 *
 * `seatsLeft` is a render-time snapshot and will go stale on a cached page,
 * so it is shown as a hint but never trusted as the authority. The server
 * re-checks inside a transaction and can still answer 409 — that response
 * is surfaced with the real remaining count rather than a generic failure,
 * because "only 2 seats left" is actionable and "error" is not.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useState } from "react";
import { useForm, type UseFormRegisterReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  User,
  Building2,
  Phone,
  MessageCircle,
  Mail,
  type LucideIcon,
} from "lucide-react";
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
  });

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
        // Correct the stale snapshot so the hint reflects reality.
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
      trackRsvp({ eventId });
      reset();
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
        <CheckCircle2 size={30} strokeWidth={1.5} className="text-emerald-400" aria-hidden />
        <p className="text-sm leading-relaxed text-white/80">{t("success")}</p>
      </motion.div>
    );
  }

  if (soldOut && status !== "full") {
    return (
      <p className="rounded-xs border border-white/15 bg-white/5 px-5 py-8 text-center text-sm text-white/70">
        {t("soldOut")}
      </p>
    );
  }

  return (
    <>
      {/* ── Header — eyebrow / RSVP / Limited Spaces, matching the
          client-supplied reference design. Copy lives in i18n
          (events.rsvp.eyebrow/title/subtitle) rather than the parent page,
          so the form is a self-contained drop-in on any event. */}
      <p className="text-center text-[11px] font-medium uppercase tracking-widest2 text-accent-300">
        {t("eyebrow")}
      </p>
      <h2 className="mt-3 text-center text-2xl font-semibold uppercase tracking-widest2 text-white">
        {t("title")}
      </h2>
      <p className="mt-1.5 text-center text-xs font-medium uppercase tracking-wide text-white/50">
        {remaining !== null ? tEvent("seatsLeft", { count: remaining }) : t("subtitle")}
      </p>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-10 space-y-6">
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
              className="flex items-start gap-2 rounded-xs border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"
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

        <Field
          id="rsvp-name"
          label={t("name")}
          icon={User}
          error={errors.name?.message}
          inputProps={register("name")}
        />

        <Field
          id="rsvp-agency"
          label={t("agencyName")}
          icon={Building2}
          error={errors.agencyName?.message}
          inputProps={register("agencyName")}
        />

        <Field
          id="rsvp-phone"
          label={t("phone")}
          icon={Phone}
          type="tel"
          autoComplete="tel"
          error={errors.phone?.message}
          inputProps={register("phone")}
        />

        <Field
          id="rsvp-whatsapp"
          label={t("whatsapp")}
          icon={MessageCircle}
          type="tel"
          error={errors.whatsapp?.message}
          inputProps={register("whatsapp")}
        />

        <Field
          id="rsvp-email"
          label={t("email")}
          icon={Mail}
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          inputProps={register("email")}
        />

        <label className="flex items-start gap-3 text-sm text-white/70">
          <input
            type="checkbox"
            {...register("consentGiven")}
            className="mt-0.5 h-4 w-4 rounded-xs border-white/30 bg-transparent text-accent-400 focus:ring-accent-400/40"
          />
          <span className="text-xs leading-relaxed">
            {t("consent")}{" "}
            {/* Both details matter, and LeadForm.tsx already has them: the
                locale prefix, because localePrefix "always" bounces a bare
                /privacy-policy to Thai, and target="_blank", because
                navigating away from a half-filled form in the same tab
                loses every field — react-hook-form keeps no draft. */}
            <a
              href={`/${locale}${siteConfig.legal.privacyPolicyPath}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent-300 underline underline-offset-2"
            >
              {t("privacyPolicy")}
            </a>
          </span>
        </label>
        {errors.consentGiven && (
          <p className="text-xs text-red-300">{errors.consentGiven.message}</p>
        )}

        <button
          type="submit"
          disabled={status === "submitting"}
          className="flex w-full items-center justify-center gap-2 rounded-xs bg-accent px-6 py-4 text-sm font-semibold uppercase tracking-widest2 text-primary transition-colors hover:bg-accent-500 disabled:opacity-60"
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
    </>
  );
}

/** One labelled, icon-leading input — the repeated unit of the dark card. */
function Field({
  id,
  label,
  icon: Icon,
  type = "text",
  autoComplete,
  error,
  inputProps,
}: {
  id: string;
  label: string;
  icon: LucideIcon;
  type?: string;
  autoComplete?: string;
  error?: string;
  inputProps: UseFormRegisterReturn;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="text-xs font-medium uppercase tracking-wide text-white/60"
      >
        {label}
      </label>
      <div className="relative mt-2">
        <Icon
          size={16}
          strokeWidth={1.75}
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-accent-300"
          aria-hidden
        />
        <input
          id={id}
          type={type}
          autoComplete={autoComplete}
          placeholder={label}
          {...inputProps}
          className="w-full rounded-xs border-b border-white/15 bg-white/5 py-3 pl-11 pr-4 text-sm text-white placeholder:text-white/35 focus:border-accent-400 focus:outline-hidden focus:ring-0"
        />
      </div>
      {error && <p className="mt-1.5 text-xs text-red-300">{error}</p>}
    </div>
  );
}
