/**
 * lib/email-quality.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The pure half of the inline email check on the lead form (see
 * app/api/validate-email/route.ts for the other half — the MX lookup and
 * the verdict that combines with these). Everything here is a plain
 * function over a string: no DNS, no fetch, no module-level cache. That
 * split is deliberate, not tidiness — it is what lets
 * tests/lib/email-quality.test.ts cover the domain-matching and typo logic
 * without mocking a network call, and what will let
 * components/EventRsvpForm.tsx adopt the same functions later without
 * pulling in the route's DNS/caching machinery.
 *
 * DISPOSABLE DOMAINS: A HAND-CURATED LIST, NOT A THIRD-PARTY FEED
 *
 * There is no dependency and no network call here on purpose — a lookup
 * service is one more thing that can be slow or down in front of a text
 * field. The list below covers the throwaway providers actually common
 * enough to show up in real form spam (mailinator.com and its several
 * aliases, guerrillamail's family, 10-minute/temp-mail services); it is
 * not, and does not try to be, exhaustive. A new one shows up, it gets
 * added here — the cost of missing one is a single spam lead in the CRM,
 * not a security hole.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** Known throwaway-email providers, lower-case, no leading dot. Matching
 *  is subdomain-inclusive — see isDisposableDomain — so listing the
 *  registrable domain once covers every subdomain a provider hands out
 *  (mailinator.com covers "sub.mailinator.com" without a separate entry). */
const DISPOSABLE_DOMAINS: readonly string[] = [
  "mailinator.com",
  "mailinator.net",
  "mailinator.org",
  "guerrillamail.com",
  "guerrillamail.org",
  "guerrillamail.net",
  "guerrillamail.biz",
  "guerrillamail.info",
  "sharklasers.com",
  "grr.la",
  "10minutemail.com",
  "10minutemail.net",
  "20minutemail.com",
  "temp-mail.org",
  "temp-mail.io",
  "tempmail.com",
  "tempmailo.com",
  "tempr.email",
  "throwawaymail.com",
  "throwaway.email",
  "yopmail.com",
  "yopmail.fr",
  "yopmail.net",
  "trashmail.com",
  "trashmail.net",
  "dispostable.com",
  "maildrop.cc",
  "getnada.com",
  "fakeinbox.com",
  "fakemailgenerator.com",
  "emailfake.com",
  "mintemail.com",
  "mailnesia.com",
  "moakt.com",
  "emailondeck.com",
  "mohmal.com",
  "tempinbox.com",
  "spamgourmet.com",
  "discard.email",
  "mailcatch.com",
  "burnermail.io",
  "mailsac.com",
  "inboxbear.com",
];

/**
 * The common providers a mistyped domain is worth correcting against.
 * Deliberately not English-only: hotmail.co.th, mail.ru, yandex.ru and qq
 * .com/163.com cover the Thai, Russian and Chinese audiences this site
 * actually has, not just the English-speaking one.
 */
export const COMMON_EMAIL_DOMAINS: readonly string[] = [
  "gmail.com",
  "hotmail.com",
  "hotmail.co.th",
  "outlook.com",
  "live.com",
  "yahoo.com",
  "icloud.com",
  "mail.ru",
  "yandex.ru",
  "qq.com",
  "163.com",
];

const MAX_TYPO_DISTANCE = 2;

/** The domain half of an address, lower-cased and trimmed — or null for a
 *  string with no "@" at all. Does not validate the address; that is
 *  zod's `.email()` job, run before any of this is ever called. */
export function emailDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at === -1 || at === email.length - 1) return null;
  return email.slice(at + 1).trim().toLowerCase();
}

/**
 * Case- and subdomain-insensitive: "MAILINATOR.COM" and
 * "inbox.mailinator.com" both match the "mailinator.com" entry above. A
 * provider that hands out random subdomains (many of these do) would
 * otherwise slip through on the second signup.
 */
export function isDisposableDomain(domain: string): boolean {
  const normalized = domain.trim().toLowerCase();
  return DISPOSABLE_DOMAINS.some(
    (known) => normalized === known || normalized.endsWith(`.${known}`),
  );
}

/** Levenshtein edit distance — insertions, deletions and substitutions,
 *  each costing 1. Iterative, two-row, no recursion: these are short
 *  domain strings, but there is no reason to pay for a call stack here. */
function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);

  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] =
        a[i - 1] === b[j - 1]
          ? previous[j - 1]
          : 1 + Math.min(previous[j - 1], previous[j], current[j - 1]);
    }
    previous = current;
  }

  return previous[b.length];
}

/**
 * A corrected full address ("somchai.r@gmail.com") if the domain is
 * within edit distance 2 of exactly one common provider, or null.
 *
 * Distance 0 (the domain already IS a common one) and distances beyond 2
 * both return null — the first because there is nothing to correct, the
 * second because past 2 edits a "correction" is as likely to be wrong as
 * right, and telling a visitor with a genuinely different domain that
 * they misspelled Gmail is worse than saying nothing. Ties are not
 * expected in practice (COMMON_EMAIL_DOMAINS has no two entries close
 * enough to both be within 2 of the same typo) and are broken by list
 * order if they ever occur.
 */
export function suggestEmailCorrection(email: string): string | null {
  const domain = emailDomain(email);
  if (!domain) return null;

  let best: { domain: string; distance: number } | null = null;

  for (const candidate of COMMON_EMAIL_DOMAINS) {
    const distance = editDistance(domain, candidate);
    if (distance === 0) return null;
    if (!best || distance < best.distance) best = { domain: candidate, distance };
  }

  if (!best || best.distance > MAX_TYPO_DISTANCE) return null;

  const localPart = email.slice(0, email.lastIndexOf("@"));
  return `${localPart}@${best.domain}`;
}
