/**
 * lib/club/token.ts — random card tokens, house codes, hashing.
 */
import "server-only";
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { TOKEN_LENGTH } from "./constants";

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
/** No 0/O/1/I/L — read aloud over the phone. */
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function pick(alphabet: string, length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[randomInt(alphabet.length)];
  return out;
}

/** 20 chars of base62 ≈ 119 bits. Unguessable; contains no house number. */
export function newCardToken(): string {
  return pick(BASE62, TOKEN_LENGTH);
}

/** RP-R12-8K4Q — the backup sign-in code. Still needs an OTP. */
export function newHouseCode(cardCode: string, unitNumber: string): string {
  return `${cardCode.toUpperCase()}-${unitNumber.toUpperCase()}-${pick(CODE_ALPHABET, 4)}`;
}

export function newOtpCode(length = 6): string {
  return pick("0123456789", length);
}

export function newDeviceSecret(): string {
  return pick(BASE62, 40);
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

export function isPlausibleToken(value: string): boolean {
  return /^[0-9A-Za-z]{16,32}$/.test(value);
}
