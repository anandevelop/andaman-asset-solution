/**
 * lib/club/benefits.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Benefit rules shared by the portal, the admin and the server actions.
 * Pure functions, client-safe.
 *
 * A benefit is always a percentage (1–100) plus an optional note
 * ("ค่าอาหาร"). A per-house override may only LOWER the partner's default,
 * never exceed it; if the default is lowered later, the resident sees
 * min(override, default).
 * ─────────────────────────────────────────────────────────────────────────
 */

import { EXPIRY_WARNING_DAYS } from "./constants";

export type Discount = { pct: number | null; note?: string | null };

export function isValidPct(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 100;
}

/** Parse what an admin typed into a % box. "" → null, "20" → 20, junk → NaN. */
export function parsePct(raw: string | null | undefined): number | null {
  const text = (raw ?? "").trim();
  if (!text) return null;
  const n = Number(text);
  return Number.isInteger(n) ? n : Number.NaN;
}

export type OverrideCheck =
  | { ok: true }
  | { ok: false; reason: "noDefault" | "range" | "aboveDefault"; cap?: number };

/** The per-house rule. `pct` null = clear the override. */
export function checkOverridePct(pct: number | null, defaultPct: number | null): OverrideCheck {
  if (pct === null) return { ok: true };
  if (!defaultPct) return { ok: false, reason: "noDefault" };
  if (!isValidPct(pct)) return { ok: false, reason: "range" };
  if (pct > defaultPct) return { ok: false, reason: "aboveDefault", cap: defaultPct };
  return { ok: true };
}

export function effectivePct(defaultPct: number | null, overridePct: number | null | undefined): number | null {
  if (!defaultPct) return null;
  if (overridePct == null) return defaultPct;
  return Math.min(overridePct, defaultPct);
}

const DISCOUNT_FORMAT: Record<string, (pct: number, note: string) => string> = {
  th: (p, n) => `ลด ${p}%${n ? ` ${n}` : ""}`,
  en: (p, n) => `${p}% off${n ? ` ${n}` : ""}`,
  zh: (p, n) => `${n ? `${n} ` : ""}${p}% 优惠`,
  ru: (p, n) => `Скидка ${p}%${n ? ` ${n}` : ""}`,
};

/** "ลด 20% ค่าอาหาร" / "20% off food". Null pct → null (caller shows "coming soon"). */
export function formatDiscount(pct: number | null, note: string | null | undefined, locale: string): string | null {
  if (!pct) return null;
  const fmt = DISCOUNT_FORMAT[locale] ?? DISCOUNT_FORMAT.en;
  return fmt(pct, (note ?? "").trim());
}

export type Validity =
  | { state: "open" }
  | { state: "upcoming"; from: Date }
  | { state: "ok"; to: Date | null }
  | { state: "soon"; to: Date; daysLeft: number }
  | { state: "expired"; to: Date };

const DAY = 86_400_000;

export function partnerValidity(
  validFrom: Date | null | undefined,
  validTo: Date | null | undefined,
  now: Date = new Date(),
): Validity {
  if (validFrom && validFrom.getTime() > now.getTime()) return { state: "upcoming", from: validFrom };
  if (!validTo) return validFrom ? { state: "ok", to: null } : { state: "open" };
  // validTo is inclusive: the whole last day still counts.
  const end = validTo.getTime() + DAY - 1;
  if (end < now.getTime()) return { state: "expired", to: validTo };
  const daysLeft = Math.ceil((end - now.getTime()) / DAY);
  if (daysLeft <= EXPIRY_WARNING_DAYS) return { state: "soon", to: validTo, daysLeft };
  return { state: "ok", to: validTo };
}

export function isWithinValidity(v: Validity): boolean {
  return v.state !== "upcoming" && v.state !== "expired";
}

/** Order the portal shows: available first, then by sortOrder/name. */
export function compareForPortal(
  a: { pct: number | null; sortOrder: number; name: string },
  b: { pct: number | null; sortOrder: number; name: string },
): number {
  if (Boolean(a.pct) !== Boolean(b.pct)) return a.pct ? -1 : 1;
  return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);
}
