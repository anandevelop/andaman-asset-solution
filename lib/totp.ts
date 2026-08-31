/**
 * lib/totp.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Two-factor authentication primitives for the admin back-office.
 *
 * Standard TOTP (RFC 6238, SHA-1, 6 digits, 30s step) so any authenticator
 * works — Google Authenticator, Microsoft Authenticator, 1Password, Aegis.
 * No SMS and no email codes: both hand the second factor to a channel we do
 * not control, and SIM-swap is a real attack on people who sell property.
 *
 * THREE THINGS WORTH KNOWING BEFORE EDITING
 *
 * 1. The shared secret is encrypted at rest with a key derived from
 *    NEXTAUTH_SECRET. A stolen database dump is therefore not a set of
 *    working code generators. The flip side: **rotating NEXTAUTH_SECRET
 *    invalidates every enrolled authenticator**, because the old ciphertext
 *    no longer decrypts. That is not a silent failure — decryptSecret()
 *    throws, sign-in refuses the code, and each admin has to re-enrol from
 *    a recovery code or a SUPER_ADMIN reset. Rotate deliberately.
 *
 * 2. A TOTP code stays valid for its whole 30-second step, which is long
 *    enough for someone reading over a shoulder — or a phishing proxy — to
 *    replay it. `afterTimeStep` refuses a step that has already been spent
 *    (User.totpLastStep), so a captured code is dead the moment its owner
 *    uses it.
 *
 * 3. Recovery codes are bcrypt-hashed exactly like passwords and shown to
 *    the user once. There is no way to display them again on purpose.
 * ─────────────────────────────────────────────────────────────────────────
 */

import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { generateSecret, generateURI, verify as verifyOtp } from "otplib";
import { Role } from "@prisma/client";
import { roleRequiresTwoFactor } from "@/lib/two-factor-policy";

/** Shown as the account issuer inside the authenticator app. */
const ISSUER = "Andaman Asset Solution";

/**
 * Role-typed wrapper over the edge-safe policy in lib/two-factor-policy.ts.
 * Server code that already has the Prisma enum in scope should use this;
 * middleware must use the policy module directly.
 */
export function requiresTwoFactor(role: Role | null | undefined): boolean {
  return roleRequiresTwoFactor(role);
}

// ─────────────────────────────────────────────────────────────────────────
// Secret storage
// ─────────────────────────────────────────────────────────────────────────

/**
 * AES-256-GCM, key = SHA-256(NEXTAUTH_SECRET + domain separator).
 *
 * The domain separator means this key cannot collide with any other use of
 * NEXTAUTH_SECRET (NextAuth's own JWT signing, say) even though both start
 * from the same input.
 */
function encryptionKey(): Buffer {
  const secret = process.env.NEXTAUTH_SECRET;

  if (!secret) {
    throw new Error("NEXTAUTH_SECRET is required to encrypt TOTP secrets");
  }

  return crypto.createHash("sha256").update(`${secret}::totp-v1`).digest();
}

/** Encrypt a base32 TOTP secret for storage. Format: v1:iv:tag:ciphertext. */
export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);

  return [
    "v1",
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

/**
 * Reverse of encryptSecret. Throws on tampering, on a truncated value, and
 * on a NEXTAUTH_SECRET that has changed since the secret was written —
 * GCM's auth tag makes all three indistinguishable, which is the point.
 */
export function decryptSecret(stored: string): string {
  const [version, iv, tag, ciphertext] = stored.split(":");

  if (version !== "v1" || !iv || !tag || !ciphertext) {
    throw new Error("Malformed TOTP secret");
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/** A fresh base32 secret, ready to be encrypted and shown as a QR code. */
export function newTotpSecret(): string {
  return generateSecret();
}

/**
 * The otpauth:// URI an authenticator scans.
 *
 * The label carries the email so someone with three work accounts can tell
 * the entries apart in their app.
 */
export async function otpAuthUri(secret: string, email: string): Promise<string> {
  return generateURI({ secret, label: email, issuer: ISSUER });
}

// ─────────────────────────────────────────────────────────────────────────
// Verification
// ─────────────────────────────────────────────────────────────────────────

/**
 * One step of tolerance either side (±30s), which covers a phone whose
 * clock has drifted and a person who starts typing at second 29. Wider
 * windows multiply an attacker's guessing surface for no real gain.
 */
const EPOCH_TOLERANCE_SECONDS = 30;

export type TotpCheck =
  /** `step` must be written to User.totpLastStep to burn the code. */
  | { ok: true; step: number }
  | { ok: false };

/**
 * Verify a 6-digit code against a *decrypted* secret.
 *
 * `lastStep` is the caller's record of the most recently accepted step;
 * pass it so a replayed code is refused even though it is still inside its
 * 30-second window.
 */
export async function verifyTotpCode(
  secret: string,
  token: string,
  lastStep: number | null | undefined,
): Promise<TotpCheck> {
  const cleaned = token.replace(/\D/g, "");

  if (cleaned.length !== 6) return { ok: false };

  const result = await verifyOtp({
    secret,
    token: cleaned,
    epochTolerance: EPOCH_TOLERANCE_SECONDS,
    ...(typeof lastStep === "number" ? { afterTimeStep: lastStep } : {}),
  }).catch(() => null);

  if (!result?.valid) return { ok: false };

  // `verify` is typed for both TOTP and HOTP; only the TOTP branch carries a
  // time step, and that is the branch this module ever asks for.
  if (!("timeStep" in result) || typeof result.timeStep !== "number") {
    return { ok: false };
  }

  return { ok: true, step: result.timeStep };
}

// ─────────────────────────────────────────────────────────────────────────
// Recovery codes
// ─────────────────────────────────────────────────────────────────────────

/**
 * No I, L, O, U, 0 or 1: these are read off a printout or a screenshot
 * under pressure, and the pairs that get confused are exactly the ones a
 * locked-out admin will retype three times before giving up.
 */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
const CODE_GROUP = 5;
const CODE_GROUPS = 2;
export const RECOVERY_CODE_COUNT = 10;

/** Ten single-use codes in the form `A3F9K-2QMXP`. */
export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  return Array.from({ length: count }, () => {
    const groups = Array.from({ length: CODE_GROUPS }, () =>
      Array.from(
        { length: CODE_GROUP },
        () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)],
      ).join(""),
    );

    return groups.join("-");
  });
}

/**
 * Accept what a human actually types: lower case, missing dash, a space
 * pasted in from a password manager.
 */
export function normaliseRecoveryCode(input: string): string {
  const stripped = input.toUpperCase().replace(/[^A-Z0-9]/g, "");

  if (stripped.length !== CODE_GROUP * CODE_GROUPS) return "";

  return `${stripped.slice(0, CODE_GROUP)}-${stripped.slice(CODE_GROUP)}`;
}

/**
 * Cost 10 rather than the 12 used for passwords.
 *
 * A recovery code is 10 characters drawn uniformly from a 30-symbol
 * alphabet — around 49 bits, which no offline attack chews through
 * regardless of the work factor. The work factor here is insurance against
 * a dump, not compensation for a human-chosen secret. Cost 12 would mean
 * up to 3 seconds of hashing on a sign-in that has to compare against every
 * unused code the account holds.
 */
export function hashRecoveryCode(code: string): Promise<string> {
  return bcrypt.hash(code, 10);
}

export function compareRecoveryCode(code: string, hash: string): Promise<boolean> {
  return bcrypt.compare(code, hash);
}
