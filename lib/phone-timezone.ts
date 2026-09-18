/**
 * lib/phone-timezone.ts
 * ─────────────────────────────────────────────────────────────────────────
 * A best-effort local time for a lead, from their phone number's country
 * calling code — LeadDetail.dc.html's "UTC+3 · ตอนนี้ 05:41" row.
 *
 * Deliberately not derived from `nationality`: that field is free text a
 * visitor typed ("Russian", "รัสเซีย", "RU" all show up), matching it
 * against a timezone reliably would need real geocoding, and getting it
 * wrong would print a false "current time" as if it were a fact. A
 * calling code is what the visitor actually dialled in with, and is at
 * least *reachable* even for the handful of countries below that span
 * more than one zone.
 *
 * Every code maps to one representative IANA zone, not a guarantee of
 * precision: Russia alone runs 11 zones, and "+7" here means Moscow.
 * That is the same trade every consumer CRM with this feature makes, and
 * it is why the caller (Lead Detail's page) renders a hint saying this is
 * an estimate — never presented as a verified fact the way `nationality`
 * or `createdAt` are.
 * ─────────────────────────────────────────────────────────────────────────
 */

/**
 * Calling code → representative IANA zone. Limited to the codes this
 * business's leads actually arrive from in practice (Thailand itself,
 * the main outbound-property-buyer markets, and a handful of common
 * others) rather than the full ITU table — an unlisted code returning
 * "unknown" is the honest answer, not a wrong guess dressed up as one.
 *
 * Longest calling codes first within same-length groups doesn't matter
 * here since every key is tried by decreasing length in
 * timezoneForPhone() below, not by object order.
 */
const CALLING_CODE_TIMEZONE: Record<string, string> = {
  "1": "America/New_York", // US/Canada — genuinely ambiguous, Eastern is the ITU-assigned representative
  "7": "Europe/Moscow",
  "27": "Africa/Johannesburg",
  "31": "Europe/Amsterdam",
  "33": "Europe/Paris",
  "34": "Europe/Madrid",
  "39": "Europe/Rome",
  "41": "Europe/Zurich",
  "43": "Europe/Vienna",
  "44": "Europe/London",
  "45": "Europe/Copenhagen",
  "46": "Europe/Stockholm",
  "47": "Europe/Oslo",
  "49": "Europe/Berlin",
  "52": "America/Mexico_City",
  "55": "America/Sao_Paulo",
  "60": "Asia/Kuala_Lumpur",
  "61": "Australia/Sydney",
  "62": "Asia/Jakarta",
  "63": "Asia/Manila",
  "64": "Pacific/Auckland",
  "65": "Asia/Singapore",
  "66": "Asia/Bangkok",
  "81": "Asia/Tokyo",
  "82": "Asia/Seoul",
  "84": "Asia/Ho_Chi_Minh",
  "86": "Asia/Shanghai",
  "91": "Asia/Kolkata",
  "852": "Asia/Hong_Kong",
  "886": "Asia/Taipei",
  "971": "Asia/Dubai",
};

const CALLING_CODES_BY_LENGTH = Object.keys(CALLING_CODE_TIMEZONE).sort((a, b) => b.length - a.length);

/** "+7 921 448 0192" → "Europe/Moscow"; null when the code isn't in the
 *  table above or the string has no recognisable "+"-prefixed code. */
export function timezoneForPhone(phone: string): string | null {
  const digits = phone.trim().replace(/^\+/, "").replace(/\D/g, "");
  if (!digits) return null;

  // Try longer codes before shorter ones so "886" (Taiwan) isn't shadowed
  // by "86" (China) matching its first two digits first.
  for (const code of CALLING_CODES_BY_LENGTH) {
    if (digits.startsWith(code)) return CALLING_CODE_TIMEZONE[code];
  }
  return null;
}

export type PhoneLocalTime = { offsetLabel: string; timeLabel: string };

/**
 * "UTC+3" and "05:41" for that zone, right now — both derived from the
 * same IANA zone via Intl so DST is handled correctly without this file
 * tracking a single hardcoded offset that would drift wrong twice a year
 * in zones that observe it.
 */
export function phoneLocalTime(
  phone: string,
  intlLocaleTag: string,
  now: Date = new Date(),
): PhoneLocalTime | null {
  const timeZone = timezoneForPhone(phone);
  if (!timeZone) return null;

  const offsetParts = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "shortOffset" })
    .formatToParts(now)
    .find((part) => part.type === "timeZoneName");
  // "GMT+3" / "GMT-5" / "GMT" (i.e. +0) → "UTC+3" / "UTC-5" / "UTC".
  const offsetLabel = (offsetParts?.value ?? "GMT").replace("GMT", "UTC");

  const timeLabel = new Intl.DateTimeFormat(intlLocaleTag, {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(now);

  return { offsetLabel, timeLabel };
}
