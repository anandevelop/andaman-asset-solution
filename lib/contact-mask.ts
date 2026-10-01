/**
 * lib/contact-mask.ts
 * ─────────────────────────────────────────────────────────────────────────
 * How a customer's email and phone look before anybody asks to see them.
 *
 * Lists show a lead's contact details masked; the full value comes only
 * from revealLeadContact() (leads/actions.ts), which checks the viewer may
 * see it and writes an audit entry. PDPA asks that access to personal data
 * be both necessary and accountable, and a table that prints fifty phone
 * numbers to anyone scrolling past it is neither — while a rep who needs
 * to call one clicks once and leaves a record that they did.
 *
 * Enough is kept to tell two leads apart and to recognise a returning
 * customer at a glance: the first two characters of the mailbox and the
 * whole domain, the country code and last four digits of the phone.
 *
 * Pure and import-free so a client component can mask too.
 * ─────────────────────────────────────────────────────────────────────────
 */

const DOT = "•";

export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return DOT.repeat(6);
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const kept = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2);
  return `${kept}${DOT.repeat(3)}@${domain}`;
}

/**
 * "+66 81 234 5678" → "+66 •••• 5678". Formatting in the stored value is
 * ignored — people type spaces, dashes and brackets — and a number too
 * short to have anything left after the last four is masked whole.
 */
export function maskPhone(phone: string): string {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length <= 4) return DOT.repeat(4);

  const last = digits.slice(-4);
  // Only when something separates it: "+66812345678" could be +66 or
  // +668, and guessing wrong would print a digit of the masked part.
  const country = trimmed.match(/^\+\d{1,3}(?=[\s\-().])/)?.[0] ?? null;
  return country ? `${country} ${DOT.repeat(4)} ${last}` : `${DOT.repeat(4)} ${last}`;
}

/** Digits only, for wa.me — which rejects "+", spaces and dashes. */
export function whatsAppDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}
