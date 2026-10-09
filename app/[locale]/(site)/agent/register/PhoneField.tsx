"use client";

/**
 * app/[locale]/(site)/agent/register/PhoneField.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Country code + number, the same control as the contact page's phone
 * field (components/LeadForm.tsx): a flag/dial-code picker beside a plain
 * number box. What is submitted under `name` is the E.164 number
 * ("+66812345678"); a visitor who types their own "+..." or "00..." number
 * swings the picker to match, exactly as on the contact form.
 *
 * When the text does not parse for the chosen country the raw text is sent
 * instead, so the action can say "not a valid number" rather than silently
 * dropping what the agent typed.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import CountrySelect from "@/components/CountrySelect";
import { DEFAULT_PHONE_COUNTRY, detectFromInternational, phonePlaceholderFor, toE164 } from "@/lib/countries";
import type { Locale } from "@/i18n";

/** Digits, plus one leading "+" when the visitor typed it (see LeadForm). */
function sanitize(text: string): string {
  const plus = text.trimStart().startsWith("+");
  const digits = text.replace(/\D/g, "");
  return plus ? `+${digits}` : digits;
}

export default function PhoneField({
  name,
  label,
  inputClassName,
  labelClassName,
  autoComplete,
}: {
  name: string;
  label: string;
  inputClassName: string;
  labelClassName: string;
  autoComplete?: string;
}) {
  const locale = useLocale() as Locale;
  const t = useTranslations("leadForm");
  const [country, setCountry] = useState(DEFAULT_PHONE_COUNTRY);
  const [text, setText] = useState("");

  const detected = detectFromInternational(text);
  const value = text === "" ? "" : detected?.e164 ?? toE164(text, country) ?? text;
  const inputId = `agent-${name}`;

  return (
    <div>
      <label htmlFor={inputId} className={labelClassName}>
        {label}
      </label>
      <div className="flex gap-2">
        <div className="w-[120px] shrink-0">
          <CountrySelect
            id={`${inputId}-country`}
            variant="dial"
            value={country}
            onChange={(iso2) => setCountry(iso2 ?? DEFAULT_PHONE_COUNTRY)}
            locale={locale}
            placeholder={DEFAULT_PHONE_COUNTRY}
            searchPlaceholder={t("countrySearch")}
            noneLabel={t("countryNone")}
            noResultsLabel={t("countryNoResults")}
            aria-label={t("phoneCountry")}
          />
        </div>
        <input
          id={inputId}
          type="tel"
          inputMode="tel"
          autoComplete={autoComplete}
          maxLength={40}
          value={text}
          placeholder={phonePlaceholderFor(country) ?? undefined}
          onChange={(event) => {
            const next = sanitize(event.target.value);
            setText(next);
            const found = detectFromInternational(next);
            if (found && found.iso2 !== country) setCountry(found.iso2);
          }}
          className={`min-w-0 flex-1 ${inputClassName}`}
        />
      </div>
      <input type="hidden" name={name} value={value} />
    </div>
  );
}
