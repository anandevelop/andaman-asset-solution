/**
 * lib/seo/google-client.ts
 * ─────────────────────────────────────────────────────────────────────────
 * An access token for a Google service account, and nothing else.
 *
 * WHY NOT `googleapis`
 *
 * The official client is about 60MB installed, carries generated surface
 * for every Google product, and would ride into the Docker image for the
 * sake of four endpoints. What it does that matters here is sign a JWT and
 * exchange it for a token — twenty lines of `node:crypto`, which is
 * already in the runtime. scripts/seo-check.ts has been doing exactly this
 * for a while; this is that code given a home.
 *
 * THE PRIVATE KEY ARRIVES WITH ITS NEWLINES ESCAPED
 *
 * A PEM key cannot survive a .env file with its line breaks intact, so
 * every deployment stores it with literal "\n" two-character sequences.
 * Passing that straight to crypto.createSign fails with a message about
 * the PEM being unreadable, which sends people looking at the key rather
 * than at the transport. It is converted back here, once, and that is the
 * only place that has to know.
 *
 * TOKENS ARE CACHED UNTIL THEY NEARLY EXPIRE
 *
 * Google issues them for an hour. A nightly job that asks for a fresh one
 * per request would mint dozens per run for no reason, and the token
 * endpoint is rate limited. Refreshed a minute early so a request that
 * starts just before the boundary does not arrive just after it.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import crypto from "node:crypto";

/** Read-only scopes. Nothing this application does needs write access to
 *  a Search Console property, and a token that cannot change anything is
 *  one less thing to be careful with. */
export const SCOPES = {
  searchConsole: "https://www.googleapis.com/auth/webmasters.readonly",
  analytics: "https://www.googleapis.com/auth/analytics.readonly",
} as const;

const TOKEN_URL = "https://oauth2.googleapis.com/token";

/** Refreshed this long before Google's own expiry. */
const EARLY_REFRESH_MS = 60_000;

type CachedToken = { token: string; expiresAt: number };

const cache = new Map<string, CachedToken>();

export type GoogleCredentials = { email: string; privateKey: string };

/**
 * The configured service account, or null when there is none.
 *
 * Null rather than a throw: every screen that uses this already has a "not
 * connected to Google yet" state, and a deployment without credentials is
 * one that has not finished being set up rather than one that is broken.
 */
export function googleCredentials(): GoogleCredentials | null {
  const email = process.env.GOOGLE_SA_EMAIL?.trim();
  const raw = process.env.GOOGLE_SA_PRIVATE_KEY?.trim();

  if (!email || !raw) return null;

  return { email, privateKey: normalisePrivateKey(raw) };
}

/**
 * Turn the stored form back into a PEM.
 *
 * Handles the two shapes a key arrives in: with literal backslash-n pairs
 * (a .env file) and with real newlines already (a mounted secret file, or
 * a shell that expanded them). Surrounding quotes are stripped because
 * some hosts include them in the value.
 */
export function normalisePrivateKey(value: string): string {
  return value
    .replace(/^["']|["']$/g, "")
    .replace(/\\n/g, "\n")
    .trim();
}

function base64Url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * The signed assertion Google exchanges for an access token.
 *
 * Exported for its own test: everything about it is deterministic given a
 * key and a clock, and it is the one piece where a wrong field name
 * produces a 400 that says nothing useful.
 */
export function buildAssertion(
  credentials: GoogleCredentials,
  scope: string,
  now: Date = new Date(),
): string {
  const issuedAt = Math.floor(now.getTime() / 1000);

  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(
    JSON.stringify({
      iss: credentials.email,
      scope,
      aud: TOKEN_URL,
      iat: issuedAt,
      // Google rejects anything over an hour, and rejects a token that is
      // already expired by the time it arrives — an hour exactly is what
      // its own examples use.
      exp: issuedAt + 3600,
    }),
  );

  const signature = crypto
    .createSign("RSA-SHA256")
    .update(`${header}.${claims}`)
    .sign(credentials.privateKey);

  return `${header}.${claims}.${base64Url(signature)}`;
}

export type TokenResult =
  | { ok: true; token: string }
  | { ok: false; error: string };

/**
 * An access token for one scope.
 *
 * Returns the failure rather than throwing it: the callers are cron jobs
 * and admin panels, and both want to record "Google said 403 because the
 * property is not shared with this service account" rather than crash.
 */
export async function getAccessToken(scope: string): Promise<TokenResult> {
  const credentials = googleCredentials();
  if (!credentials) return { ok: false, error: "NOT_CONFIGURED" };

  const cached = cache.get(scope);
  if (cached && cached.expiresAt - EARLY_REFRESH_MS > Date.now()) {
    return { ok: true, token: cached.token };
  }

  let assertion: string;
  try {
    assertion = buildAssertion(credentials, scope);
  } catch (error) {
    // Almost always a malformed key: a PEM that lost its newlines, or a
    // value that is still the placeholder from .env.example.
    return {
      ok: false,
      error: `BAD_PRIVATE_KEY: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  try {
    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
      signal: AbortSignal.timeout(20_000),
    });

    const body = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
    };

    if (!response.ok || !body.access_token) {
      /*
        Google's own words, kept. "invalid_grant: Invalid JWT Signature"
        and "unauthorized_client" mean completely different things — a
        broken key versus an account that exists but has not been given
        access — and a generic message here would cost somebody an
        afternoon telling them apart.
      */
      return {
        ok: false,
        error: `${body.error ?? response.status}: ${body.error_description ?? "no detail"}`,
      };
    }

    cache.set(scope, {
      token: body.access_token,
      expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
    });

    return { ok: true, token: body.access_token };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** Test seam: the cache is module state. */
export function resetTokenCache(): void {
  cache.clear();
}
