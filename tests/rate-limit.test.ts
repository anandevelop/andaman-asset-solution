/**
 * tests/rate-limit.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The shared limiter, with particular attention to the `check` mode added
 * for sign-in.
 *
 * The subtle requirement: a correct password must not push the user closer
 * to a lockout. Only failures consume from the bucket, and a success clears
 * it. Getting that backwards produces a limiter that locks out the
 * legitimate owner of an account being guessed at — the opposite of what it
 * is for.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it } from "vitest";
import { rateLimit, resetRateLimit, RATE_LIMITS, clientIp } from "@/lib/rate-limit";

/** Unique per test so the module-level Map cannot leak between them. */
const key = (name: string) => `test:${name}:${Math.random()}`;

describe("rateLimit", () => {
  it("allows up to the limit then refuses", () => {
    const k = key("basic");
    const options = { limit: 3, windowMs: 60_000 };

    expect(rateLimit(k, options).ok).toBe(true);
    expect(rateLimit(k, options).ok).toBe(true);
    expect(rateLimit(k, options).ok).toBe(true);
    expect(rateLimit(k, options).ok).toBe(false);
  });

  it("counts down remaining", () => {
    const k = key("remaining");
    const options = { limit: 3, windowMs: 60_000 };

    expect(rateLimit(k, options).remaining).toBe(2);
    expect(rateLimit(k, options).remaining).toBe(1);
    expect(rateLimit(k, options).remaining).toBe(0);
  });

  it("keeps buckets independent", () => {
    const a = key("a");
    const b = key("b");
    const options = { limit: 1, windowMs: 60_000 };

    rateLimit(a, options);

    expect(rateLimit(a, options).ok).toBe(false);
    expect(rateLimit(b, options).ok).toBe(true);
  });

  it("reports a positive retryAfter once blocked", () => {
    const k = key("retry");
    const options = { limit: 1, windowMs: 60_000 };

    rateLimit(k, options);
    const blocked = rateLimit(k, options);

    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
    expect(blocked.retryAfter).toBeLessThanOrEqual(60);
  });

  it("starts a fresh window after expiry", () => {
    const k = key("expiry");

    // A window already in the past behaves as if it had never opened.
    expect(rateLimit(k, { limit: 1, windowMs: 1 }).ok).toBe(true);

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(rateLimit(k, { limit: 1, windowMs: 1 }).ok).toBe(true);
        resolve();
      }, 5);
    });
  });
});

describe("rateLimit — check mode", () => {
  it("does not consume from the bucket", () => {
    const k = key("check");
    const options = { limit: 2, windowMs: 60_000 };

    expect(rateLimit(k, { ...options, check: true }).ok).toBe(true);
    expect(rateLimit(k, { ...options, check: true }).ok).toBe(true);
    expect(rateLimit(k, { ...options, check: true }).ok).toBe(true);

    // Still both attempts available.
    expect(rateLimit(k, options).remaining).toBe(1);
  });

  it("reports blocked once the bucket is exhausted", () => {
    const k = key("check-blocked");
    const options = { limit: 2, windowMs: 60_000 };

    rateLimit(k, options);
    rateLimit(k, options);

    expect(rateLimit(k, { ...options, check: true }).ok).toBe(false);
  });

  it("models the sign-in flow: only failures count", () => {
    const k = key("login");
    const options = { ...RATE_LIMITS.login };

    // Nine wrong passwords.
    for (let i = 0; i < 9; i += 1) {
      expect(rateLimit(k, { ...options, check: true }).ok).toBe(true);
      rateLimit(k, options);
    }

    // Tenth attempt is still permitted to try.
    expect(rateLimit(k, { ...options, check: true }).ok).toBe(true);
    rateLimit(k, options);

    // Eleventh is locked out.
    expect(rateLimit(k, { ...options, check: true }).ok).toBe(false);
  });

  it("clears the bucket on a successful sign-in", () => {
    const k = key("login-success");
    const options = { ...RATE_LIMITS.login };

    for (let i = 0; i < 10; i += 1) rateLimit(k, options);
    expect(rateLimit(k, { ...options, check: true }).ok).toBe(false);

    // A run of typos before getting it right must not linger.
    resetRateLimit(k);

    expect(rateLimit(k, { ...options, check: true }).ok).toBe(true);
  });
});

describe("RATE_LIMITS policies", () => {
  it("defines every policy the routes reference", () => {
    expect(Object.keys(RATE_LIMITS).sort()).toEqual(
      ["cookieConsent", "leads", "login", "presign", "rsvp", "webhook"].sort(),
    );
  });

  it("uses positive limits and windows throughout", () => {
    for (const [name, policy] of Object.entries(RATE_LIMITS)) {
      expect(policy.limit, name).toBeGreaterThan(0);
      expect(policy.windowMs, name).toBeGreaterThan(0);
    }
  });

  it("is more permissive for admin uploads than for public forms", () => {
    // A gallery upload is many files in a row; an enquiry is not.
    expect(RATE_LIMITS.presign.limit).toBeGreaterThan(RATE_LIMITS.leads.limit);
  });
});

describe("clientIp", () => {
  it("takes the first entry of x-forwarded-for", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.5, 70.41.3.18" });

    expect(clientIp(headers)).toBe("203.0.113.5");
  });

  it("falls back to cf-connecting-ip", () => {
    expect(clientIp(new Headers({ "cf-connecting-ip": "203.0.113.9" }))).toBe(
      "203.0.113.9",
    );
  });

  it("falls back to x-real-ip", () => {
    expect(clientIp(new Headers({ "x-real-ip": "203.0.113.7" }))).toBe("203.0.113.7");
  });

  it("returns 'unknown' when no proxy header is present", () => {
    expect(clientIp(new Headers())).toBe("unknown");
  });
});
