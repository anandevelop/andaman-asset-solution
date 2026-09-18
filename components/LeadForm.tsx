"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useForm, useWatch, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations, useLocale } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, AlertCircle, CheckCircle2, XCircle } from "lucide-react";
import { leadInquirySchema, type LeadInquiryInput } from "@/lib/validations";
import {
  DEFAULT_PHONE_COUNTRY,
  detectFromInternational,
  phonePlaceholderFor,
  toE164,
} from "@/lib/countries";
import CountrySelect from "@/components/CountrySelect";
import LeadSuccessDialog from "@/components/LeadSuccessDialog";
import { emailDomain } from "@/lib/email-quality";
import RecaptchaProvider, { useRecaptchaToken } from "@/components/RecaptchaProvider";
import { trackLead } from "@/lib/analytics";
import { siteConfig } from "@/config/site";
import type { Locale } from "@/i18n";

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

/** Mirrors the Verdict union app/api/validate-email/route.ts returns,
 *  plus "idle" for "the field has not been checked yet" — a state that
 *  route never needs to express since it only ever answers a real
 *  request. */
type EmailCheckStatus = "idle" | "checking" | "deliverable" | "typo" | "disposable" | "no_mx" | "unknown";

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

/** Border colour excluded — the email field's own border varies with its
 *  inline check's verdict (see emailBorderClass below), so every other
 *  field appends the shared default itself via INPUT, and email builds
 *  its own class string from this instead. */
const INPUT_BASE =
  "w-full rounded-xs border bg-white px-4 py-3 text-sm text-ink outline-hidden transition-colors focus:border-accent aria-invalid:border-red-500";
const INPUT = `${INPUT_BASE} border-primary/15`;

/** E.164 regex straight out of leadInquirySchema — used here only to decide
 *  when the "saved as {value}" hint is worth showing, not to validate. */
const E164 = /^\+[1-9]\d{7,14}$/;

/** Splits a translated sentence around its own interpolated value so just
 *  that value can be a <button> — same private-use-marker technique
 *  app/[locale]/(site)/projects/[slug]/page.tsx's updatedChip uses, for
 *  the same reason: one clickable value inside an otherwise plain
 *  sentence, not a project-wide rich-text setup for a single case. */
const EMAIL_HINT_MARKER = "";

/**
 * Keeps only what a phone keypad can produce: digits, plus a single
 * leading "+" if the visitor actually started the number with one. The
 * leading "+" is not cosmetic — it is the exact signal derivePhone/
 * detectFromInternational below key off to treat the number as already
 * fully-qualified rather than a national number for the selected country,
 * so stripping it along with the rest of the punctuation would silently
 * break that path for anyone who types their own international number.
 */
function sanitizePhoneInput(text: string): string {
  const hasLeadingPlus = text.trimStart().startsWith("+");
  const digits = text.replace(/\D/g, "");
  return hasLeadingPlus ? `+${digits}` : digits;
}

/**
 * One rule turns whatever the visitor is typing into what gets submitted:
 * a number starting with "+" or "00" is already fully-qualified and wins
 * over whichever country the dropdown happens to show (see
 * lib/countries.ts's detectFromInternational for why); anything else is a
 * national number read against the currently selected country.
 *
 * Returns `phone: ""` rather than throwing when the text does not parse at
 * all (an empty box, a stray letter mid-number) — that is what lets
 * leadInquirySchema's own regex produce the visible "enter a valid phone
 * number" error, instead of this function silently swallowing bad input.
 */
function derivePhone(text: string, country: string): { phone: string; phoneCountry: string } {
  const detected = detectFromInternational(text);
  if (detected) return { phone: detected.e164, phoneCountry: detected.iso2 };

  return { phone: toE164(text, country) ?? "", phoneCountry: country };
}

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
  hint,
  required,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  /** A status line under the control, read together with the error by
   *  aria-describedby — currently only the email field's inline check
   *  (see components/LeadForm.tsx's onEmailBlur) uses this; every other
   *  field's own hint text (phoneHint, messageNoLinks) is hand-rolled
   *  outside Field, unchanged. Pass a fully-styled node — Field only
   *  supplies the shared `mt-1 text-xs` position, not per-state colour,
   *  since the email check needs a different colour per verdict and a
   *  generic string here could not carry that. */
  hint?: React.ReactNode;
  required?: boolean;
  children: (a11y: FieldA11y) => React.ReactNode;
}) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  // Both ids when both are present, so a screen reader announces the
  // hint and the error together on focus rather than only whichever one
  // aria-describedby happened to point at.
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;

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
        "aria-describedby": describedBy,
      })}

      {hint && (
        <p id={hintId} className="mt-1 text-xs">
          {hint}
        </p>
      )}

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
  const pathname = usePathname();
  const getRecaptchaToken = useRecaptchaToken();
  const [status, setStatus] = useState<Status>("idle");
  const [utm, setUtm] = useState<Utm>(EMPTY_UTM);
  // The literal text in the phone box — kept separate from the `phone`
  // field's value (always E.164) because a visitor mid-keystroke is not
  // holding an E.164 number yet, and reformatting what they typed on every
  // character would fight the cursor. Reset alongside the rest of the form
  // when the success dialog closes; RHF's own reset() only knows about its
  // own fields.
  const [phoneText, setPhoneText] = useState("");
  // Focus returns here when the success dialog closes — the same
  // "give focus back to whatever opened this" contract
  // components/Navbar.tsx's mobile menu already follows for its own
  // toggle button.
  const submitButtonRef = useRef<HTMLButtonElement>(null);
  // The inline email check's own verdict — separate from RHF's
  // errors.email, which only ever holds the "disposable" case (the one
  // verdict that actually blocks submit; see checkEmail below).
  const [emailCheck, setEmailCheck] = useState<{ status: EmailCheckStatus; suggestion?: string }>(
    { status: "idle" },
  );
  // One in-flight request at a time. Re-assigned, not just read, so a
  // newer request can abort whatever the field's previous value kicked
  // off — a stale verdict rendering over a since-corrected address is
  // exactly the bug this exists to prevent.
  const emailCheckAbortRef = useRef<AbortController | null>(null);

  useEffect(() => setUtm(readUtm()), []);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    clearErrors,
    setValue,
    watch,
    trigger,
    control,
    formState: { errors },
  } = useForm<LeadInquiryInput>({
    resolver: zodResolver(leadInquirySchema),
    // `phone: ""`, not left undefined: it is no longer register()-ed (the
    // visible input is decoupled — see phoneText below), so it would never
    // get the "" every other text field starts with implicitly. Left
    // undefined, an untouched submit fails zod's base string check instead
    // of the regex, which produces zod's generic type-mismatch message
    // instead of the PHONE_INVALID sentinel phoneError below expects.
    defaultValues: { projectSlug, phone: "", phoneCountry: DEFAULT_PHONE_COUNTRY },
  });

  // useWatch, not the `watch()` returned above — that function's identity
  // can never be memoized safely (react-hook-form recreates it), which is
  // exactly what trips React Compiler's "incompatible library" bailout for
  // this whole component. useWatch is the hook form of the same
  // subscription and does not have that problem.
  const phoneCountry = useWatch({ control, name: "phoneCountry" }) || DEFAULT_PHONE_COUNTRY;
  const phoneValue = useWatch({ control, name: "phone" });

  /*
    Clear the form when the success dialog closes — not the moment the
    submission succeeds.

    That used to be the same moment, and it was wrong: the dialog sits on
    top of the form, but a visitor who glances past its edge and sees the
    form already blank cannot tell whether the submission actually went
    through — the obvious response, pressing submit again, files a
    duplicate lead the Phuket team then calls twice. The values now
    survive, visible or not, for exactly as long as the dialog is open.

    `reset()` takes no argument. react-hook-form only clears the DOM by
    calling the native form.reset(), and it only does that when reset is
    called with nothing — see `if (isWeb && isUndefined(values))` in its
    _reset. Passing `reset({ projectSlug })` drops its internal field map
    and leaves every uncontrolled <input> holding the text the visitor
    typed. The project slug survives regardless, because the hidden input
    carries defaultValue, which is what a native form reset restores to.

    Safe to call directly here, unlike from inside onSubmit: the "handleSubmit
    writes its own isSubmitting/isSubmitted bookkeeping after the handler
    resolves, and a reset called from inside it gets overwritten by that
    write" problem this file used to warn about only applies while that
    submit lifecycle is still unwinding. Closing the dialog is a separate,
    later, user-triggered event — handleSubmit finished settling long
    before anyone had a chance to click Close.
  */
  function closeSuccessDialog() {
    setStatus("idle");
    reset();
    setPhoneText("");
    submitButtonRef.current?.focus();
  }

  /**
   * The inline email check — advisory infrastructure, not a gate. Every
   * failure mode here (a non-OK response, an unparseable body, a network
   * error) resolves "unknown", which renders nothing at all: a visitor
   * who cannot be told anything useful about their address must still be
   * able to submit it exactly as they can today. See
   * app/api/validate-email/route.ts's own header for the fuller version
   * of this reasoning on the server side.
   */
  async function checkEmail(email: string) {
    emailCheckAbortRef.current?.abort();
    const controller = new AbortController();
    emailCheckAbortRef.current = controller;

    setEmailCheck({ status: "checking" });

    try {
      const response = await fetch("/api/validate-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
        signal: controller.signal,
      });

      const result = response.ok ? await response.json().catch(() => null) : null;
      const status: EmailCheckStatus = result?.status ?? "unknown";

      setEmailCheck({ status, suggestion: result?.suggestion });

      // The one verdict that actually blocks submission — see the
      // "What blocks submit" note on the email Field below for why typo
      // and no_mx do not get the same treatment.
      if (status === "disposable") {
        setError("email", { message: t("emailCheck.disposable") });
      }
    } catch (error) {
      // A newer request superseded this one (see emailCheckAbortRef) —
      // that request owns emailCheck's state now, so this one must not
      // overwrite it with "unknown" a moment later.
      if (error instanceof DOMException && error.name === "AbortError") return;
      setEmailCheck({ status: "unknown" });
    }
  }

  /** The moment the value changes, the previous verdict stops describing
   *  it — cleared immediately rather than left showing until the next
   *  blur confirms or denies it. Only clears the field's error when it
   *  was this check's own "disposable" verdict that set one — a zod
   *  "enter a valid email address" error from a submit attempt is not
   *  this function's to dismiss on the first keystroke of a fix. */
  function resetEmailCheck() {
    emailCheckAbortRef.current?.abort();
    if (emailCheck.status === "disposable") clearErrors("email");
    setEmailCheck({ status: "idle" });
  }

  function onEmailBlur(email: string) {
    // Half-typed addresses are not worth a request — the same shape
    // check leadInquirySchema itself runs, so a value this rejects would
    // never reach the API on submit either.
    if (!leadInquirySchema.shape.email.safeParse(email.trim()).success) return;
    void checkEmail(email.trim());
  }

  const onSubmit = async (data: LeadInquiryInput) => {
    // A browser autofilling name/email/phone together can submit without
    // ever firing blur on the email field — onEmailBlur's own idle/checked
    // guard makes this a no-op for a value already checked, so it costs
    // nothing to also call it here. Deliberately not awaited: this is
    // advisory (see checkEmail's own header), and the disposable case it
    // might still catch is enforced again server-side regardless.
    if (emailCheck.status === "idle") onEmailBlur(data.email);

    /*
      A known-disposable address is refused here explicitly, not left to
      the schema resolver handleSubmit re-runs on every call.

      setError("email", …) inside checkEmail alone is not enough: zod has
      no concept of "disposable" — that verdict comes from an async API
      call this schema cannot see — so the very next handleSubmit
      invocation re-validates every field against the *schema* and
      overwrites whatever setError() previously put there. Checked
      against the local emailCheck state directly, here, is what actually
      stops the request.
    */
    if (emailCheck.status === "disposable") {
      setError("email", { message: t("emailCheck.disposable") });
      return;
    }

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
          // Real signals, not typed by the visitor — see
          // LeadInquiry.commsLanguage/sourcePath in schema.prisma.
          commsLanguage: locale,
          sourcePath: pathname,
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
      // Values stay on screen — form clears in closeSuccessDialog, when
      // the dialog this status opens is actually dismissed. See that
      // function's own comment for why.
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
  // Both sentinels come straight out of leadInquirySchema — see there for
  // why they exist as fixed strings rather than translated messages: the
  // schema is shared with the server and cannot call useTranslations, so
  // it emits an identifiable code and this is the one place that turns it
  // into the locale-appropriate sentence.
  const phoneError = errors.phone?.message === "PHONE_INVALID" ? t("phoneInvalid") : errors.phone?.message;
  const messageError =
    errors.message?.message === "LINK_DETECTED" ? t("messageLinkError") : errors.message?.message;
  // Same sentinel pattern, for the one server-side rejection that can
  // land on this field: app/api/leads/route.ts's own DISPOSABLE_EMAIL,
  // for a script posting straight at the API (or the rare case where the
  // inline check's own blur-triggered request never ran).
  const emailError =
    errors.email?.message === "DISPOSABLE_EMAIL" ? t("emailCheck.disposable") : errors.email?.message;
  const phonePlaceholder = phonePlaceholderFor(phoneCountry) ?? undefined;

  // For the "no_mx" hint's {domain} — read live rather than stored
  // alongside the verdict, since resetEmailCheck already guarantees the
  // status is back to "idle" (rendering no hint at all) the instant the
  // value changes, so there is never a moment where this could show a
  // domain that no longer matches what is checked.
  const emailValue = useWatch({ control, name: "email" });

  const emailBorderClass =
    emailCheck.status === "typo"
      ? "border-accent-600"
      : emailCheck.status === "disposable" || emailCheck.status === "no_mx"
        ? "border-red-500"
        : "border-primary/15";
  // The one colour in the visual spec with no matching design token —
  // every other state uses an existing Tailwind colour.
  const emailBorderStyle =
    emailCheck.status === "deliverable" ? { borderColor: "rgba(21,112,74,0.45)" } : undefined;

  const emailIcon =
    emailCheck.status === "checking" ? (
      <Loader2 size={16} className="animate-spin text-ink/35" aria-hidden />
    ) : emailCheck.status === "deliverable" ? (
      <CheckCircle2 size={16} className="text-[#15704a]" aria-hidden />
    ) : emailCheck.status === "typo" ? (
      <AlertCircle size={16} className="text-accent-600" aria-hidden />
    ) : emailCheck.status === "disposable" || emailCheck.status === "no_mx" ? (
      <XCircle size={16} className="text-red-500" aria-hidden />
    ) : null;

  const emailHint =
    emailCheck.status === "checking" ? (
      <span className="text-ink/50">{t("emailCheck.checking")}</span>
    ) : emailCheck.status === "deliverable" ? (
      <span className="text-[#15704a]">{t("emailCheck.deliverable")}</span>
    ) : emailCheck.status === "typo" && emailCheck.suggestion ? (
      (() => {
        // Split around the translated sentence's own {suggestion}
        // placeholder — same private-use-marker technique
        // app/[locale]/(site)/projects/[slug]/page.tsx's updatedChip
        // uses, for the same reason: one clickable value inside an
        // otherwise plain sentence does not need a project-wide
        // rich-text setup.
        const suggestion = emailCheck.suggestion;
        const [prefix, suffix] = t("emailCheck.typo", { suggestion: EMAIL_HINT_MARKER }).split(
          EMAIL_HINT_MARKER,
        );
        return (
          <span className="text-accent-700">
            {prefix}
            <button
              type="button"
              onClick={() => {
                setValue("email", suggestion, { shouldValidate: true });
                void checkEmail(suggestion);
              }}
              className="underline decoration-dotted underline-offset-2 hover:text-primary"
            >
              {suggestion}
            </button>
            {suffix}
          </span>
        );
      })()
    ) : emailCheck.status === "disposable" ? (
      // No separate hint here — checkEmail's own setError already puts
      // this exact sentence in the field's error slot (red-700,
      // role="alert"), which is also what actually blocks submission. A
      // second copy in the hint slot would be the same sentence shown
      // twice under one field.
      null
    ) : emailCheck.status === "no_mx" ? (
      <span className="text-red-700">
        {t("emailCheck.noMx", { domain: emailDomain(emailValue ?? "") ?? "" })}
      </span>
    ) : null;

  // No "success" branch here any more — that state now opens
  // LeadSuccessDialog below, which announces itself via role="dialog"
  // aria-modal="true" and its own aria-labelledby heading, so this live
  // region would otherwise announce the same event twice.
  const feedback =
    status === "rateLimited"
      ? { Icon: AlertCircle, tone: "text-amber-700", message: t("rateLimited") }
      : status === "blocked"
        ? { Icon: AlertCircle, tone: "text-amber-700", message: t("blocked") }
        : status === "error"
          ? { Icon: AlertCircle, tone: "text-red-700", message: t("error") }
          : null;

  return (
    <>
      {/* eslint-disable-next-line react-hooks/refs -- false positive: the
          compiler flags this because onSubmit transitively touches
          emailCheckAbortRef.current (via onEmailBlur -> checkEmail), and
          handleSubmit(onSubmit) itself runs during render. But calling
          handleSubmit(onSubmit) only wraps onSubmit into a new function —
          react-hook-form does not invoke onSubmit's body until the form
          actually submits, a later event-handler execution the static
          analysis has no visibility into. */}
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

        <Field id="phone" label={t("phone")} error={phoneError} required>
          {(a11y) => (
            <>
              {/* flex, not grid-cols-[102px_1fr]: a fixed-width flex child
                  is one arbitrary value instead of a multi-part track
                  list, and this project already relies on that simpler
                  pattern everywhere (min-w-[Npx] throughout the admin
                  tables) rather than compound grid-template arbitrary
                  values, which all of this file's other multi-column
                  grids apply only behind a breakpoint — this is the one
                  layout on the page that must stay side-by-side even at
                  390px, so it does not follow that pattern. */}
              <div className="flex gap-2">
                <div className="w-[102px] shrink-0">
                  <Controller
                    name="phoneCountry"
                    control={control}
                    render={({ field }) => (
                      <CountrySelect
                        id="phoneCountry"
                        variant="dial"
                        value={field.value ?? DEFAULT_PHONE_COUNTRY}
                        onChange={(iso2) => {
                          const next = iso2 ?? DEFAULT_PHONE_COUNTRY;
                          field.onChange(next);
                          // Re-derive rather than just swapping the country:
                          // the digits already typed need to be re-read
                          // against the newly chosen country's own rules.
                          setValue("phone", derivePhone(phoneText, next).phone);
                        }}
                        locale={locale as Locale}
                        placeholder={DEFAULT_PHONE_COUNTRY}
                        searchPlaceholder={t("countrySearch")}
                        noneLabel={t("countryNone")}
                        noResultsLabel={t("countryNoResults")}
                        // No visible <label for="phoneCountry"> exists —
                        // the Field's own label targets the number input
                        // beside it — so this is the only accessible name
                        // the trigger has. See CountrySelect's own prop
                        // comment.
                        aria-label={t("phoneCountry")}
                      />
                    )}
                  />
                </div>
                <input
                  id="phone"
                  type="tel"
                  // Not inputMode="numeric": that keypad drops easy access
                  // to "+" on most phones, and a visitor typing their own
                  // international number needs it — see
                  // sanitizePhoneInput's comment for why "+" survives
                  // filtering below even though nothing else does.
                  inputMode="tel"
                  autoComplete="tel"
                  value={phoneText}
                  onChange={(event) => {
                    // Digits only, plus a single leading "+" — the escape
                    // hatch derivePhone/detectFromInternational need to
                    // recognise a visitor typing their own fully-qualified
                    // number. Everything else a phone keypad cannot
                    // produce (letters, multiple "+") is stripped rather
                    // than rejected, so a stray paste degrades instead of
                    // silently doing nothing.
                    const text = sanitizePhoneInput(event.target.value);
                    setPhoneText(text);
                    const derived = derivePhone(text, phoneCountry);
                    setValue("phone", derived.phone);
                    // A visitor who typed their own "+"/"00" number gets the
                    // dropdown swung to match — see derivePhone/
                    // detectFromInternational for why that check runs first.
                    if (derived.phoneCountry !== phoneCountry) {
                      setValue("phoneCountry", derived.phoneCountry);
                    }
                  }}
                  placeholder={phonePlaceholder}
                  {...a11y}
                  className={INPUT}
                />
              </div>
              {phoneValue && E164.test(phoneValue) && (
                <p className="mt-1 text-xs text-ink/50">{t("phoneHint", { value: phoneValue })}</p>
              )}
            </>
          )}
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="email" label={t("email")} error={emailError} hint={emailHint} required>
          {(a11y) => {
            // Composed with register()'s own onChange/onBlur, not
            // replacing them — RHF still needs both to keep its internal
            // field state in sync.
            const emailField = register("email");
            return (
              <div className="relative">
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  {...a11y}
                  {...emailField}
                  onChange={(event) => {
                    emailField.onChange(event);
                    resetEmailCheck();
                  }}
                  onBlur={(event) => {
                    emailField.onBlur(event);
                    onEmailBlur(event.target.value);
                  }}
                  className={`${INPUT_BASE} ${emailBorderClass} ${emailIcon ? "pr-10" : ""}`}
                  style={emailBorderStyle}
                />
                {emailIcon && (
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                    {emailIcon}
                  </span>
                )}
              </div>
            );
          }}
        </Field>

        <Field id="nationality" label={t("nationality")} error={errors.nationality?.message}>
          {(a11y) => (
            <Controller
              name="nationality"
              control={control}
              render={({ field }) => (
                <CountrySelect
                  id="nationality"
                  variant="nationality"
                  // CountrySelect's `value` prop is `string | null`; RHF's
                  // is `string | undefined` before anything is ever
                  // touched. onChange does the reverse conversion below,
                  // since leadInquirySchema's `.optional()` wants undefined
                  // for "no nationality", not null.
                  value={field.value ?? null}
                  onChange={(iso2) => field.onChange(iso2 ?? undefined)}
                  locale={locale as Locale}
                  // Distinct from noneLabel below: this is the neutral
                  // "nothing chosen yet" invitation, shown only on the
                  // closed trigger. "Not specified" is a real, selectable
                  // answer inside the list (the row that explicitly
                  // clears a nationality already picked) — using it as
                  // the starting placeholder too read as if a value had
                  // already been recorded before anyone touched the
                  // field.
                  placeholder={t("nationalityPlaceholder")}
                  searchPlaceholder={t("countrySearch")}
                  noneLabel={t("countryNone")}
                  noResultsLabel={t("countryNoResults")}
                  {...a11y}
                />
              )}
            />
          )}
        </Field>
      </div>

      <Field id="message" label={t("message")} error={messageError}>
        {(a11y) => (
          <>
          <textarea
            id="message"
            rows={3}
            {...a11y}
            {...register("message", { onChange: () => trigger("message") })}
            className={`${INPUT} resize-none`}
          />
          <p className="mt-1 text-xs text-ink/50">{t("messageNoLinks")}</p>
          </>
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
        ref={submitButtonRef}
        type="submit"
        // The message field is the one validated as the visitor types
        // (see the onChange->trigger() above) specifically so a blocked
        // link disables submit immediately, not only once they press it —
        // see lib/links.ts for why a link there is worth blocking at all.
        disabled={status === "submitting" || !!errors.message}
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
      <div role="status" aria-live="polite" aria-atomic="true" className="min-h-5">
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

      <LeadSuccessDialog open={status === "success"} onClose={closeSuccessDialog} />
    </>
  );
}
