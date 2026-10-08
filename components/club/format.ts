/**
 * components/club/format.ts — date and name formatting for the portal.
 * Client-safe. Dates are shown in Phuket time whatever the server's zone.
 */

export const CLUB_LOCALES = ["th", "en", "zh", "ru"] as const;
export type ClubLocale = (typeof CLUB_LOCALES)[number];

export const TIME_ZONE = "Asia/Bangkok";

const INTL: Record<string, string> = { th: "th-TH", en: "en-GB", zh: "zh-CN", ru: "ru-RU" };

export function intlLocale(locale: string): string {
  return INTL[locale] ?? "en-GB";
}

/** "28 ก.ย. 69" / "28 Sept 2026" — the mockup's fdL(). */
export function formatDate(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "short",
    year: locale === "th" ? "2-digit" : "numeric",
    timeZone: TIME_ZONE,
  }).format(date);
}

/** "03/25" — month/year a home was handed over, as printed under the card. */
export function formatMonthYear(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", { month: "2-digit", year: "2-digit", timeZone: TIME_ZONE }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("month")}/${get("year")}`;
}

/** "15-03-2025" on the back of the card. */
export function formatDayMonthYear(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: TIME_ZONE }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day")}-${get("month")}-${get("year")}`;
}

/** "คุณธนพล อินทรสุวรรณ" → "ธนพล อินทรสุวรรณ" (the card prints names without the honorific). */
export function stripHonorific(name: string): string {
  return name.replace(/^คุณ\s*/, "").trim();
}

/** Two letters for the avatar: first letter of the first two words. */
export function initials(name: string): string {
  const words = stripHonorific(name).split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((w) => Array.from(w)[0] ?? "").join("").toUpperCase();
}

/** Hour of day in Phuket, for the greeting. */
export function bangkokHour(now: Date = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: TIME_ZONE }).format(now)) % 24;
}

/** "RP-R12-8K4Q" → "RP R12 8K4Q". */
export function spacedCode(houseCode: string): string {
  return houseCode.replace(/-/g, " ");
}

export function lastSegment(houseCode: string): string {
  return houseCode.split("-").pop() ?? houseCode;
}
