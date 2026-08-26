/**
 * lib/recaptcha.ts
 * ─────────────────────────────────────────────────────────────────────────
 * reCAPTCHA v3 server-side verification.
 *
 * v3 does not challenge anyone — it returns a score from 0.0 (almost
 * certainly a bot) to 1.0 (almost certainly human) and leaves the decision
 * to us. That decision is split three ways here, because collapsing it into
 * a boolean gets the failure modes wrong:
 *
 *   • A score below the threshold is a verdict. Reject it.
 *   • A missing or malformed token from a browser is also a verdict —
 *     a real form always sends one. Reject it.
 *   • Google being unreachable, timing out, or the keys not being set is
 *     OUR failure, not the visitor's. Allow it, and log loudly.
 *
 * That last case is the one that matters commercially: a property enquiry
 * is worth far more than the spam a few minutes of fail-open lets through,
 * and silently dropping leads during a Google outage is the kind of bug
 * nobody notices for a week.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";

const VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";

/** Google is fast or it is broken; 5s is already generous. */
const TIMEOUT_MS = 5_000;

const DEFAULT_MIN_SCORE = 0.5;

export type RecaptchaOutcome =
  | { allowed: true; reason: "verified"; score: number }
  | { allowed: true; reason: "skipped"; detail: string }
  | { allowed: false; reason: "low_score"; score: number }
  | { allowed: false; reason: "invalid_token"; codes: string[] }
  | { allowed: false; reason: "action_mismatch"; expected: string; received?: string };

type SiteVerifyResponse = {
  success: boolean;
  score?: number;
  action?: string;
  challenge_ts?: string;
  hostname?: string;
  "error-codes"?: string[];
};

function minScore(): number {
  const raw = Number(process.env.RECAPTCHA_MIN_SCORE);
  return Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : DEFAULT_MIN_SCORE;
}

export function isRecaptchaConfigured(): boolean {
  return Boolean(
    process.env.RECAPTCHA_SECRET_KEY && process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY,
  );
}

/**
 * Error codes that mean "this token is genuinely bad" rather than "we asked
 * badly". A bad-request code points at our own configuration, so it is
 * treated as a skip instead of blaming the visitor.
 */
const TOKEN_FAULT_CODES = new Set([
  "missing-input-response",
  "invalid-input-response",
  "timeout-or-duplicate",
]);

/**
 * Verify a v3 token.
 *
 * @param token   The g-recaptcha-response from the client.
 * @param action  The action name the client claimed, e.g. "lead_form".
 *                Checked because a token minted on a low-value page can
 *                otherwise be replayed against a high-value endpoint.
 * @param ip      Optional client IP, which sharpens Google's scoring.
 */
export async function verifyRecaptcha(
  token: string | undefined | null,
  action: string,
  ip?: string,
): Promise<RecaptchaOutcome> {
  const secret = process.env.RECAPTCHA_SECRET_KEY;

  // Not configured — the client is not sending tokens either. Skip.
  if (!secret || !process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY) {
    return { allowed: true, reason: "skipped", detail: "not_configured" };
  }

  if (!token || token.trim().length === 0) {
    return { allowed: false, reason: "invalid_token", codes: ["missing-input-response"] };
  }

  const body = new URLSearchParams({ secret, response: token });
  if (ip && ip !== "unknown") body.set("remoteip", ip);

  let data: SiteVerifyResponse;

  try {
    const response = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });

    if (!response.ok) {
      console.error(`[recaptcha] siteverify responded ${response.status} — allowing`);
      return { allowed: true, reason: "skipped", detail: `http_${response.status}` };
    }

    data = (await response.json()) as SiteVerifyResponse;
  } catch (error) {
    // Timeout, DNS failure, network partition — our problem, not theirs.
    console.error("[recaptcha] siteverify unreachable — allowing submission", error);
    return { allowed: true, reason: "skipped", detail: "unreachable" };
  }

  if (!data.success) {
    const codes = data["error-codes"] ?? [];
    const tokenAtFault = codes.some((code) => TOKEN_FAULT_CODES.has(code));

    if (!tokenAtFault) {
      // invalid-input-secret, bad-request: we are misconfigured.
      console.error("[recaptcha] verification misconfigured — allowing", codes);
      return { allowed: true, reason: "skipped", detail: codes.join(",") || "unknown" };
    }

    return { allowed: false, reason: "invalid_token", codes };
  }

  if (data.action !== undefined && data.action !== action) {
    return {
      allowed: false,
      reason: "action_mismatch",
      expected: action,
      received: data.action,
    };
  }

  const score = data.score ?? 0;
  if (score < minScore()) {
    return { allowed: false, reason: "low_score", score };
  }

  return { allowed: true, reason: "verified", score };
}

/** One-line summary for request logs. */
export function describeOutcome(outcome: RecaptchaOutcome): string {
  switch (outcome.reason) {
    case "verified":
      return `verified score=${outcome.score}`;
    case "skipped":
      return `skipped (${outcome.detail})`;
    case "low_score":
      return `rejected score=${outcome.score} < ${minScore()}`;
    case "invalid_token":
      return `rejected invalid token [${outcome.codes.join(",")}]`;
    case "action_mismatch":
      return `rejected action mismatch expected=${outcome.expected} got=${outcome.received}`;
  }
}
