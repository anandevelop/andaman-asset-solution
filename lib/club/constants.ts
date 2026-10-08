/**
 * lib/club/constants.ts
 * ─────────────────────────────────────────────────────────────────────────
 * ANDAMAN CLUB — fixed values shared by the member portal, the admin and
 * the proxy. Client-safe: no server imports.
 *
 * The three card codes are printed inside every card's QR
 * (member.andamanassetsolution.com/<code>/<token>). They can never be
 * renamed once a project's cards exist; a new project gets a new code.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** The production member host, printed on every real card. */
export const DEFAULT_MEMBER_HOST = "member.andamanassetsolution.com";

/** "https://Foo.com/x" → "foo.com". */
function bareHost(value: string): string {
  return value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/[/?#].*$/, "");
}

/**
 * The host card links point at. Read at run time on the server (never
 * inlined), so one image serves both environments:
 *   CLUB_MEMBER_HOST            → used as is
 *   else CLUB_SITE_URL          → "member." + its host
 *                                 (https://168-144-240-9.sslip.io →
 *                                  member.168-144-240-9.sslip.io)
 *   else                        → member.andamanassetsolution.com
 * Staging sets CLUB_SITE_URL; production sets nothing.
 */
export function memberHost(): string {
  const env = typeof process === "undefined" ? undefined : process.env;
  const explicit = bareHost(env?.CLUB_MEMBER_HOST ?? "");
  if (explicit) return explicit;
  const site = bareHost(env?.CLUB_SITE_URL ?? "").replace(/^www\./, "");
  return site ? `member.${site}` : DEFAULT_MEMBER_HOST;
}

export const CARD_CODES = ["rp", "tv", "vc"] as const;
export type CardCode = (typeof CARD_CODES)[number];
export const isCardCode = (value: string): value is CardCode =>
  (CARD_CODES as readonly string[]).includes(value);

/** Printed in old test cards only — redirected, never issued again. */
export const LEGACY_CARD_PREFIX = "r";

export function cardUrl(code: string, token: string): string {
  return `https://${memberHost()}/${code}/${token}`;
}

/** Program name shown on the login screen and in e-mails. */
export const PROGRAM_NAME = "ANDAMAN CLUB";

export const TOKEN_LENGTH = 20;

export const OTP_LENGTH = 6;
export const OTP_TTL_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_LOCK_MINUTES = 15;
/** Requests per resident per hour, so a shop scanning cannot mail-bomb. */
export const OTP_MAX_SENDS_PER_HOUR = 5;

/** "Remember this device": sliding window from last use. */
export const TRUSTED_DEVICE_DAYS = 90;
/** The installed portal keeps showing the card this long without network. */
export const OFFLINE_CARD_DAYS = 7;

export const MAX_HOUSEHOLD_MEMBERS = 2;
export const MEMBER_RELATIONS = ["spouse", "child", "family", "manager"] as const;
export type MemberRelation = (typeof MEMBER_RELATIONS)[number];

export const HANDOVER_METHODS = ["office", "home", "post"] as const;
export type HandoverMethod = (typeof HANDOVER_METHODS)[number];

/** Partner categories, in display order. `icon` is a lucide-react name. */
export const PARTNER_CATEGORIES = [
  { key: "hosp", icon: "Hospital" },
  { key: "dine", icon: "UtensilsCrossed" },
  { key: "beach", icon: "Sun" },
  { key: "spa", icon: "Leaf" },
  { key: "act", icon: "Flag" },
] as const;
export type PartnerCategory = (typeof PARTNER_CATEGORIES)[number]["key"];

/** Legal text versions — stored on the row that accepted them. */
export const TERMS_VERSION = "CT-v1.0";
export const RESIDENT_NOTICE_VERSION = "RES-PN-v1.0";
export const AGENT_NOTICE_VERSION = "AGT-PN-v1.0";

export const PRIVACY_EMAIL = "privacy@andamanassetsolution.com";

/** Benefit expiry warning window on the admin dashboard and partner table. */
export const EXPIRY_WARNING_DAYS = 30;
