"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations, useLocale } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { leadInquirySchema, type LeadInquiryInput } from "@/lib/validations";
import RecaptchaProvider, { useRecaptchaToken } from "@/components/RecaptchaProvider";
import { trackLead } from "@/lib/analytics";
import { siteConfig } from "@/config/site";

type Props = {
  projectSlug?: string;
  source?: "PROJECT_PAGE" | "CONTACT_PAGE" | "EVENT_PAGE" | "OTHER";
};

type Status =
  | "idle"
  | "submitting"
  | "success"
  | "error"
  /** Rejected by reCAPTCHA — worded as "try again", never as "you look
   *  like a bot", which is both rude and wrong often enough to matter. */
  | "blocked"
  | "rateLimited";

type Utm = { utmSource: string; utmMedium: string; utmCampaign: string };

const EMPTY_UTM: Utm = { utmSource: "", utmMedium: "", utmCampaign: "" };

/** Read UTM attribution off the landing URL so it rides along with the lead. */
function readUtm(): Utm {
  if (typeof window === "undefined") return EMPTY_UTM;
  const params = new URLSearchParams(window.location.search);
  return {
    utmSource: params.get("utm_source") ?? "",
    utmMedium: params.get("utm_medium") ?? "",
    utmCampaign: params.get("utm_campaign") ?? "",
  };
}

const INPUT =
  "w-full rounded-sm border border-primary/15 bg-white px-4 py-3 text-sm text-ink outline-none transition-colors focus:border-accent aria-[invalid=true]:border-red-500";

/** The ARIA wiring a control needs; spread onto the input by the caller. */
type FieldA11y = {
  "aria-required"?: true;
  "aria-invalid"?: true;
  "aria-describedby"?: string;
};

/**
 * Label + control + error message, wired together.
 *
 * Extracted because the wiring was previously repeated per field and the
 * repetition is exactly where it goes wrong: `aria-describedby` has to
 * point at an id that exists only while the error is rendered, and
 * `aria-invalid` has to be absent rather than "false" when the field is
 * clean. Getting that right once beats getting it right five times.
 *
 * The control is a render prop rather than a prop-driven <input>, because
 * react-hook-form's `register()` returns a ref that must land on the real
 * element — passing it through another component's props loses it.
 */
function Field({
  id,
  label,
  error,
  required,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  required?: boolean;
  children: (a11y: FieldA11y) => React.ReactNode;
}) {
  const errorId = `${id}-error`;

  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink/70"
      >
        {label}
      </label>

      {children({
        "aria-required": required ? true : undefined,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": error ? errorId : undefined,
      })}

      {/*
        role="alert" rather than a plain <p>: the message appears after
        submit, by which time focus has left the field, so a sighted user
        sees it and a screen-reader user would otherwise never learn it
        exists. red-700 not red-600 — 600 is 4.0:1 on white.
      */}
      {error && (
        <p id={errorId} role="alert" className="mt-1 text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

export default function LeadForm({ projectSlug, source = "PROJECT_PAGE" }: Props) {
  const t = useTranslations("leadForm");
  const locale = useLocale();
  const getRecaptchaToken = useRecaptchaToken();
  const [status, setStatus] = useState<Status>("idle");
  const [utm, setUtm] = useState<Utm>(EMPTY_UTM);

  useEffect(() => setUtm(readUtm()), []);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<LeadInquiryInput>({
    resolver: zodResolver(leadInquirySchema),
    defaultValues: { projectSlug },
  });

  /*
    Clear the form after a confirmed send.

    Two details here are load-bearing, and both were wrong before:

    1. `reset()` takes no argument.

       react-hook-form only clears the DOM by calling the native
       form.reset(), and it only does that when reset is called with
       nothing — see `if (isWeb && isUndefined(values))` in its _reset.
       Passing `reset({ projectSlug })` drops its internal field map and
       leaves every uncontrolled <input> holding the text the visitor
       typed. The symptom was a fully populated form sitting underneath a
       "thank you, we'll be in touch" message: it reads as though nothing
       was sent, and the obvious response — press submit again — files a
       duplicate lead that the Phuket team then calls twice.

       The project slug survives because the hidden input carries
       defaultValue, which is what a native form reset restores to.

    2. It runs in an effect, not in the submit handler.

       handleSubmit writes its own form state (isSubmitting → isSubmitted,
       isSubmitSuccessful) once the async handler resolves. A reset called
       inside the handler is overwritten by that write.

    Keyed on our own `status` rather than formState.isSubmitSuccessful,
    which is true whenever the handler did not throw — including the 429,
    403 and 422 paths, where the details must stay on screen so the visitor
    can retry without retyping everything.
  */
  useEffect(() => {
    if (status === "success") reset();
  }, [status, reset]);

  const onSubmit = async (data: LeadInquiryInput) => {
    setStatus("submitting");

    try {
      // Minted at submit time: v3 tokens are single-use and expire after
      // two minutes, so one taken on mount would often be stale by now.
      const recaptchaToken = await getRecaptchaToken("lead_form");

      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          ...utm,
          source,
          recaptchaToken,
          // Bind the PDPA policy version the visitor consented to.
          consentVersion: siteConfig.legal.consentVersion,
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

      if (!response.ok) {
        // Surface server-side field errors on the matching inputs.
        if (response.status === 422 && result?.fields) {
          for (const [field, message] of Object.entries(
            result.fields as Record<string, string>,
          )) {
            if (field in data) {
              setError(field as keyof LeadInquiryInput, { message });
            }
          }
        }
        setStatus("error");
        return;
      }

      setStatus("success");
      // Conversion event — fired only after the server confirmed the write.
      trackLead({ source, projectSlug });
      // The reset happens in an effect below, not here. See the comment there.
    } catch {
      setStatus("error");
    }
  };

  /*
    Icon and colour per terminal state. amber-700 and red-700 rather than
    the -600 shades that were here: -600 lands at roughly 4.0:1 on white,
    which is a fail for 14px text, and an error message you cannot read is
    a worse failure than most.
  */
  const feedback =
    status === "success"
      ? { Icon: CheckCircle2, tone: "text-emerald-700", message: t("success") }
      : status === "rateLimited"
        ? { Icon: AlertCircle, tone: "text-amber-700", message: t("rateLimited") }
        : status === "blocked"
          ? { Icon: AlertCircle, tone: "text-amber-700", message: t("blocked") }
          : status === "error"
            ? { Icon: AlertCircle, tone: "text-red-700", message: t("error") }
            : null;

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      {/* defaultValue, not value: a native form reset restores the value
          attribute, which is how the slug survives the reset above. */}
      <input type="hidden" defaultValue={projectSlug} {...register("projectSlug")} />

      {/* Honeypot — hidden from humans, ignored by the API when filled. */}
      <input
        type="text"
        name="company"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute h-0 w-0 overflow-hidden opacity-0"
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="name" label={t("name")} error={errors.name?.message} required>
          {(a11y) => <input id="name" autoComplete="name" {...a11y} {...register("name")} className={INPUT} />}
        </Field>

        <Field id="phone" label={t("phone")} error={errors.phone?.message} required>
          {(a11y) => (
            <input
              id="phone"
              type="tel"
              autoComplete="tel"
              {...a11y}
              {...register("phone")}
              className={INPUT}
            />
          )}
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="email" label={t("email")} error={errors.email?.message} required>
          {(a11y) => (
            <input
              id="email"
              type="email"
              autoComplete="email"
              {...a11y}
              {...register("email")}
              className={INPUT}
            />
          )}
        </Field>

        <Field id="nationality" label={t("nationality")} error={errors.nationality?.message}>
          {(a11y) => (
            <input
              id="nationality"
              autoComplete="country-name"
              {...a11y}
              {...register("nationality")}
              className={INPUT}
            />
          )}
        </Field>
      </div>

      <Field id="message" label={t("message")} error={errors.message?.message}>
        {(a11y) => (
          <textarea
            id="message"
            rows={3}
            {...a11y}
            {...register("message")}
            className={`${INPUT} resize-none`}
          />
        )}
      </Field>

      <div className="flex items-start gap-3">
        <input
          id="consentGiven"
          type="checkbox"
          aria-required="true"
          aria-invalid={errors.consentGiven ? true : undefined}
          aria-describedby={errors.consentGiven ? "consentGiven-error" : undefined}
          {...register("consentGiven")}
          className="mt-0.5 h-4 w-4 shrink-0 accent-accent-600"
        />
        <label htmlFor="consentGiven" className="text-xs leading-relaxed text-ink/70">
          {t("consent")}{" "}
          <a
            href={`/${locale}${siteConfig.legal.privacyPolicyPath}`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-primary"
          >
            {t("privacyPolicy")}
          </a>
        </label>
      </div>
      {errors.consentGiven && (
        <p id="consentGiven-error" className="-mt-3 text-xs text-red-700">
          {errors.consentGiven.message}
        </p>
      )}

      <button
        type="submit"
        disabled={status === "submitting"}
        className="btn-primary w-full sm:w-auto"
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

      {/*
        One live region, mounted unconditionally.

        This replaced four separately-rendered <motion.p> blocks. The
        rewrite is not tidying: a live region only announces mutations to a
        node the screen reader was already watching, so a region that
        appears at the same moment as its own text is silent. Someone who
        cannot see the green tick was told nothing at all about whether
        their enquiry sent.

        aria-live="polite" rather than "assertive" — the result matters but
        does not warrant interrupting mid-sentence. role="status" carries
        polite implicitly; both are given because the pairing is what older
        screen readers handle most consistently.
      */}
      <div role="status" aria-live="polite" aria-atomic="true" className="min-h-[1.25rem]">
        <AnimatePresence mode="wait">
          {feedback && (
            <motion.p
              key={status}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={`flex items-center gap-2 text-sm ${feedback.tone}`}
            >
              <feedback.Icon size={16} aria-hidden /> {feedback.message}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      <p className="text-[11px] leading-relaxed text-ink/65">
        {t("consentNotice", { version: siteConfig.legal.consentVersion })}
      </p>

      {/* Loads the v3 script only on pages that actually carry a form. */}
      <RecaptchaProvider />
    </form>
  );
}
