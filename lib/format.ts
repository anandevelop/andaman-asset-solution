/**
 * lib/format.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Locale-aware display formatting shared by server and client components.
 * ─────────────────────────────────────────────────────────────────────────
 */

const INTL_LOCALE: Record<string, string> = { th: "th-TH", en: "en-US" };

export function intlLocale(locale: string): string {
  return INTL_LOCALE[locale] ?? "en-US";
}

/**
 * "ปวีณา สุขสมบูรณ์" → "ปส", "John Smith" → "JS", "Cher" → "C" — an avatar
 * chip's fallback when there is no photo. First letter of up to the first
 * two whitespace-separated words, matching AdminSidebar.tsx's identity
 * block so the same person's initials look the same everywhere they
 * appear, rather than each place inventing its own rule. `.toUpperCase()`
 * is a no-op on Thai, so it is safe to apply unconditionally.
 */
export function initialsFrom(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

/** 26230 → "26,230" */
export function formatNumber(locale: string, value: number | null): string {
  if (value === null) return "—";
  return new Intl.NumberFormat(intlLocale(locale)).format(value);
}

/**
 * Date → "YYYY-MM-DDTHH:mm", the only format <input type="datetime-local">
 * accepts. toISOString() would be wrong here: it converts to UTC, so an
 * 18:00 Phuket event would come back into the form as 11:00.
 */
export function toDateTimeLocal(value: Date | null | undefined): string {
  if (!value) return "";

  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}` +
    `T${pad(value.getHours())}:${pad(value.getMinutes())}`
  );
}

/** 2005 → "2005" — a bare Gregorian year, deliberately not run through
 * formatNumber() (which would group it as "2,005") or a locale calendar
 * (which would silently convert th-TH to Buddhist era, "พ.ศ. 2548" — wrong
 * here since the source data and every other locale display the same
 * Gregorian year side by side, e.g. next to a project name shared across
 * locales). */
export function formatYear(year: number): string {
  return String(year);
}

/** (2026, 8) → "Aug 2026" / "ส.ค. 2569" */
export function formatMonthYear(locale: string, year: number, month: number): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    month: "short",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

/** 2026-08-13 → "13 Aug 2026" / "13 ส.ค. 2569" — same shape
 *  components/admin/MediaLibrary.tsx already formats dates in, so the site
 *  and the admin don't read two different date styles. */
export function formatDateShort(locale: string, value: Date): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(value);
}
