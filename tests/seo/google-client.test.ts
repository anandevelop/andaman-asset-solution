/**
 * tests/seo/google-client.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Signing the assertion Google exchanges for an access token.
 *
 * The key pair here is generated in the test. No real credential goes near
 * this repository — and the generated one proves more than a fixture
 * would, because the signature is verified against its own public half
 * rather than compared to a string somebody once pasted.
 *
 * What is worth pinning is the shape of the claim set and the handling of
 * the key's newlines. Both fail the same way in production — a 400 from
 * Google's token endpoint whose message names neither — and both are
 * entirely deterministic here.
 * ─────────────────────────────────────────────────────────────────────────
 */

import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildAssertion,
  getAccessToken,
  googleCredentials,
  normalisePrivateKey,
  resetTokenCache,
  SCOPES,
} from "@/lib/seo/google-client";

const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

const ORIGINAL = process.env;

beforeEach(() => {
  process.env = { ...ORIGINAL };
  resetTokenCache();
});

afterEach(() => {
  process.env = ORIGINAL;
});

function decode(part: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
}

describe("normalisePrivateKey", () => {
  it("turns the escaped newlines a .env file stores back into real ones", () => {
    // The whole reason a PEM survives an env var at all, and the failure
    // that sends people inspecting the key instead of the transport.
    const stored = "-----BEGIN PRIVATE KEY-----\\nMIIE\\n-----END PRIVATE KEY-----\\n";
    expect(normalisePrivateKey(stored)).toBe(
      "-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----",
    );
  });

  it("leaves a key that already has real newlines alone", () => {
    // A mounted secret file, or a shell that expanded them on the way in.
    const real = "-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----";
    expect(normalisePrivateKey(real)).toBe(real);
  });

  it("strips quotes some hosts keep as part of the value", () => {
    expect(normalisePrivateKey('"-----BEGIN PRIVATE KEY-----\\nX\\n-----END PRIVATE KEY-----"')).toBe(
      "-----BEGIN PRIVATE KEY-----\nX\n-----END PRIVATE KEY-----",
    );
  });

  it("produces a key node can actually sign with", () => {
    const stored = privateKey.replace(/\n/g, "\\n");
    expect(() =>
      crypto.createSign("RSA-SHA256").update("x").sign(normalisePrivateKey(stored)),
    ).not.toThrow();
  });
});

describe("buildAssertion", () => {
  const credentials = { email: "svc@example.iam.gserviceaccount.com", privateKey };
  const now = new Date("2026-09-26T12:00:00Z");

  it("signs something Google's public half can verify", () => {
    const [header, claims, signature] = buildAssertion(
      credentials,
      SCOPES.searchConsole,
      now,
    ).split(".");

    const verified = crypto
      .createVerify("RSA-SHA256")
      .update(`${header}.${claims}`)
      .verify(publicKey, Buffer.from(signature, "base64url"));

    expect(verified).toBe(true);
  });

  it("declares RS256, which is the only algorithm Google accepts here", () => {
    const [header] = buildAssertion(credentials, SCOPES.searchConsole, now).split(".");
    expect(decode(header)).toEqual({ alg: "RS256", typ: "JWT" });
  });

  it("carries the claims the token endpoint requires", () => {
    const [, claims] = buildAssertion(credentials, SCOPES.searchConsole, now).split(".");
    const payload = decode(claims);

    expect(payload).toMatchObject({
      iss: credentials.email,
      scope: SCOPES.searchConsole,
      // The audience is the token endpoint, not the API being called —
      // getting this wrong returns "invalid_grant" with no hint.
      aud: "https://oauth2.googleapis.com/token",
      iat: 1790424000,
    });
  });

  it("expires an hour out, which is Google's maximum", () => {
    const [, claims] = buildAssertion(credentials, SCOPES.searchConsole, now).split(".");
    const payload = decode(claims) as { iat: number; exp: number };

    expect(payload.exp - payload.iat).toBe(3600);
  });

  it("is base64url, not base64", () => {
    // "+" and "/" in a JWT segment are rejected before Google reads it.
    const assertion = buildAssertion(credentials, SCOPES.searchConsole, now);
    expect(assertion).not.toMatch(/[+/=]/);
  });
});

describe("googleCredentials", () => {
  it("is null when nothing is configured", () => {
    delete process.env.GOOGLE_SA_EMAIL;
    delete process.env.GOOGLE_SA_PRIVATE_KEY;
    expect(googleCredentials()).toBeNull();
  });

  it("is null when only half of it is set", () => {
    // Half-configured is the state a deployment lands in mid-setup, and it
    // must read as "not connected" rather than as a broken key.
    process.env = { ...ORIGINAL, GOOGLE_SA_EMAIL: "svc@example.com" };
    delete process.env.GOOGLE_SA_PRIVATE_KEY;
    expect(googleCredentials()).toBeNull();
  });

  it("returns a usable key when both are set", () => {
    process.env = {
      ...ORIGINAL,
      GOOGLE_SA_EMAIL: "svc@example.com",
      GOOGLE_SA_PRIVATE_KEY: privateKey.replace(/\n/g, "\\n"),
    };

    const credentials = googleCredentials();
    expect(credentials?.email).toBe("svc@example.com");
    expect(credentials?.privateKey.startsWith("-----BEGIN")).toBe(true);
  });
});

describe("getAccessToken", () => {
  it("reports NOT_CONFIGURED rather than throwing", async () => {
    // Every caller is a cron job or an admin panel; both want to record a
    // reason, not catch an exception.
    delete process.env.GOOGLE_SA_EMAIL;
    delete process.env.GOOGLE_SA_PRIVATE_KEY;

    await expect(getAccessToken(SCOPES.searchConsole)).resolves.toEqual({
      ok: false,
      error: "NOT_CONFIGURED",
    });
  });

  it("reports a malformed key instead of crashing the caller", async () => {
    process.env = {
      ...ORIGINAL,
      GOOGLE_SA_EMAIL: "svc@example.com",
      GOOGLE_SA_PRIVATE_KEY: "not-a-pem-at-all",
    };

    const result = await getAccessToken(SCOPES.searchConsole);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/BAD_PRIVATE_KEY/);
  });
});
