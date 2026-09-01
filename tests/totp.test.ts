/**
 * tests/totp.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The pure half of two-factor auth: secret encryption, code verification
 * and recovery codes. Everything here runs without a database, which is
 * why lib/totp.ts is kept free of Prisma.
 *
 * The properties worth protecting are the ones that fail silently if
 * broken: a replayed code being accepted, a secret surviving a changed
 * NEXTAUTH_SECRET, or a recovery code that only matches when typed in
 * exactly the shape it was printed.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { beforeEach, describe, expect, it } from "vitest";
import { generate } from "otplib";
import {
  compareRecoveryCode,
  decryptSecret,
  encryptSecret,
  generateRecoveryCodes,
  hashRecoveryCode,
  newTotpSecret,
  normaliseRecoveryCode,
  otpAuthUri,
  requiresTwoFactor,
  verifyTotpCode,
} from "@/lib/totp";

const SECRET_KEY = "test-nextauth-secret-value";

beforeEach(() => {
  process.env.NEXTAUTH_SECRET = SECRET_KEY;
});

describe("requiresTwoFactor", () => {
  it("covers every role, EDITOR included", () => {
    // EDITOR was exempt until it turned out /admin/leads needs nothing
    // above EDITOR to read the whole customer list — the exact access the
    // policy was written to protect.
    expect(requiresTwoFactor("SUPER_ADMIN" as never)).toBe(true);
    expect(requiresTwoFactor("ADMIN" as never)).toBe(true);
    expect(requiresTwoFactor("EDITOR" as never)).toBe(true);
  });

  it("fails closed on a missing role claim", () => {
    // A signed-in session whose role has gone missing is held at enrolment
    // rather than waved past it.
    expect(requiresTwoFactor(null)).toBe(true);
    expect(requiresTwoFactor(undefined)).toBe(true);
  });
});

describe("secret encryption", () => {
  it("round-trips a secret", () => {
    const secret = newTotpSecret();
    expect(decryptSecret(encryptSecret(secret))).toBe(secret);
  });

  it("produces different ciphertext each time (random IV)", () => {
    const secret = newTotpSecret();
    expect(encryptSecret(secret)).not.toBe(encryptSecret(secret));
  });

  it("refuses a secret encrypted under a different NEXTAUTH_SECRET", () => {
    const stored = encryptSecret(newTotpSecret());

    process.env.NEXTAUTH_SECRET = "a-different-secret";

    // Loud, not silently wrong: rotating the app secret must not quietly
    // hand back garbage that then fails as "wrong code".
    expect(() => decryptSecret(stored)).toThrow();
  });

  it("refuses tampered ciphertext", () => {
    const stored = encryptSecret(newTotpSecret());
    const [version, iv, tag, ciphertext] = stored.split(":");
    const flipped = Buffer.from(ciphertext, "base64");
    flipped[0] ^= 0xff;

    expect(() =>
      decryptSecret([version, iv, tag, flipped.toString("base64")].join(":")),
    ).toThrow();
  });

  it("refuses a malformed value", () => {
    expect(() => decryptSecret("not-a-secret")).toThrow();
  });
});

describe("otpAuthUri", () => {
  it("carries issuer and account so the app shows which login it is for", async () => {
    const uri = await otpAuthUri(newTotpSecret(), "admin@andaman.test");

    expect(uri.startsWith("otpauth://totp/")).toBe(true);
    expect(decodeURIComponent(uri)).toContain("admin@andaman.test");
    expect(decodeURIComponent(uri)).toContain("Andaman Asset Solution");
  });
});

describe("verifyTotpCode", () => {
  it("accepts a code from the matching secret", async () => {
    const secret = newTotpSecret();
    const token = await generate({ secret });

    const result = await verifyTotpCode(secret, token, null);

    expect(result.ok).toBe(true);
  });

  it("rejects a code from a different secret", async () => {
    const token = await generate({ secret: newTotpSecret() });

    expect(await verifyTotpCode(newTotpSecret(), token, null)).toEqual({ ok: false });
  });

  it("rejects anything that is not six digits", async () => {
    const secret = newTotpSecret();

    expect(await verifyTotpCode(secret, "12345", null)).toEqual({ ok: false });
    expect(await verifyTotpCode(secret, "", null)).toEqual({ ok: false });
    expect(await verifyTotpCode(secret, "abcdef", null)).toEqual({ ok: false });
  });

  it("refuses a code whose time step has already been spent", async () => {
    const secret = newTotpSecret();
    const token = await generate({ secret });

    const first = await verifyTotpCode(secret, token, null);
    expect(first.ok).toBe(true);

    // Same code, replayed inside its 30-second window — the exact move a
    // shoulder-surfer or a phishing proxy makes.
    const replay = await verifyTotpCode(
      secret,
      token,
      first.ok ? first.step : null,
    );

    expect(replay).toEqual({ ok: false });
  });

  it("tolerates spaces in what the user typed", async () => {
    const secret = newTotpSecret();
    const token = await generate({ secret });
    const spaced = `${token.slice(0, 3)} ${token.slice(3)}`;

    expect((await verifyTotpCode(secret, spaced, null)).ok).toBe(true);
  });
});

describe("recovery codes", () => {
  it("issues ten distinct codes in the printed shape", () => {
    const codes = generateRecoveryCodes();

    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    codes.forEach((code) => expect(code).toMatch(/^[A-Z0-9]{5}-[A-Z0-9]{5}$/));
  });

  it("avoids the characters people misread off a printout", () => {
    const codes = generateRecoveryCodes(50).join("");
    expect(codes).not.toMatch(/[ILOU01]/);
  });

  it("normalises lower case, missing dashes and stray spaces", () => {
    const code = generateRecoveryCodes(1)[0];
    const bare = code.replace("-", "");

    expect(normaliseRecoveryCode(bare.toLowerCase())).toBe(code);
    expect(normaliseRecoveryCode(` ${bare.slice(0, 5)} ${bare.slice(5)} `)).toBe(code);
    expect(normaliseRecoveryCode(code)).toBe(code);
  });

  it("returns empty for anything the wrong length", () => {
    expect(normaliseRecoveryCode("ABC")).toBe("");
    expect(normaliseRecoveryCode("")).toBe("");
  });

  it("hashes and compares", async () => {
    const [code, other] = generateRecoveryCodes(2);
    const hash = await hashRecoveryCode(code);

    expect(hash).not.toContain(code);
    expect(await compareRecoveryCode(code, hash)).toBe(true);
    expect(await compareRecoveryCode(other, hash)).toBe(false);
  });
});
