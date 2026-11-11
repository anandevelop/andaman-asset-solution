"use client";

/**
 * components/forms/use-validation-message.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The zod schemas in lib/validations.ts are shared with the server, so
 * their messages are fixed English strings — and a Thai, Chinese or
 * Russian visitor saw "Name is too short" under a form in their language.
 * This maps the messages the public forms can produce onto the
 * `validation` namespace; anything it does not recognise is shown as-is.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useTranslations } from "next-intl";

const KNOWN: Record<string, string> = {
  "Name is too short": "nameShort",
  "Agency / company is too short": "agencyShort",
  "Enter a valid email address": "email",
  "Enter a valid phone number": "phone",
  "Enter a valid WhatsApp number": "whatsapp",
  "Unknown country": "country",
  "Consent is required to submit this form": "consent",
  "Consent is required to register": "consentRegister",
};

export function useValidationMessage() {
  const t = useTranslations("validation");
  return (message: string | undefined): string | undefined => {
    if (!message) return message;
    const key = KNOWN[message];
    if (key) return t(key as never);
    // zod's own defaults, for limits the schema gave no message.
    if (message.startsWith("Too big")) return t("tooLong");
    if (message.startsWith("Too small")) return t("tooShort");
    if (message.startsWith("Invalid")) return t("invalid");
    return message;
  };
}
