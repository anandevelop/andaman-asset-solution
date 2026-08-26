/**
 * tests/recaptcha.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The reCAPTCHA decision table.
 *
 * The whole value of this module is a three-way split that a boolean return
 * would collapse: a low score is the visitor's verdict, a missing token is
 * the visitor's verdict, but Google timing out is *our* failure and must
 * not cost a lead.
 *
 * These tests exist mainly to stop a future refactor "simplifying" the
 * unreachable-means-allow branch into unreachable-means-deny, which would
 * silently drop enquiries during any Google incident.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyRecaptcha, describeOutcome, isRecaptchaConfigured } from "@/lib/recaptcha";

const original = { ...process.env };

function configure() {
  process.env.RECAPTCHA_SECRET_KEY = "secret";
  process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY = "site";
  process.env.RECAPTCHA_MIN_SCORE = "0.5";
}

/** Stub global fetch with a fixed siteverify response. */
function mockVerify(body: unknown, ok = true) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok,
      status: ok ? 200 : 500,
      json: async () => body,
    }),
  );
}

beforeEach(configure);

afterEach(() => {
  process.env = { ...original };
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("isRecaptchaConfigured", () => {
  it("is true only when both keys are present", () => {
    expect(isRecaptchaConfigured()).toBe(true);

    delete process.env.RECAPTCHA_SECRET_KEY;
    expect(isRecaptchaConfigured()).toBe(false);
  });
});

describe("verifyRecaptcha — allow", () => {
  it("skips entirely when the keys are unset", async () => {
    delete process.env.RECAPTCHA_SECRET_KEY;
    delete process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

    const outcome = await verifyRecaptcha("token", "lead_form");

    expect(outcome).toEqual({ allowed: true, reason: "skipped", detail: "not_configured" });
  });

  it("allows when Google is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ETIMEDOUT")));

    const outcome = await verifyRecaptcha("token", "lead_form");

    expect(outcome.allowed).toBe(true);
    expect(outcome.reason).toBe("skipped");
  });

  it("allows when siteverify returns a server error", async () => {
    mockVerify({}, false);

    const outcome = await verifyRecaptcha("token", "lead_form");

    expect(outcome.allowed).toBe(true);
    expect(outcome.reason).toBe("skipped");
  });

  it("allows when OUR secret is wrong — a config fault, not the visitor's", async () => {
    mockVerify({ success: false, "error-codes": ["invalid-input-secret"] });

    const outcome = await verifyRecaptcha("token", "lead_form");

    expect(outcome.allowed).toBe(true);
    expect(outcome.reason).toBe("skipped");
  });

  it("allows a score above the threshold", async () => {
    mockVerify({ success: true, score: 0.9, action: "lead_form" });

    const outcome = await verifyRecaptcha("token", "lead_form");

    expect(outcome).toMatchObject({ allowed: true, reason: "verified", score: 0.9 });
  });

  it("allows a score exactly at the threshold", async () => {
    mockVerify({ success: true, score: 0.5, action: "lead_form" });

    expect((await verifyRecaptcha("token", "lead_form")).allowed).toBe(true);
  });

  it("allows when the response omits an action", async () => {
    // Google does not always echo the action back; absence is not a mismatch.
    mockVerify({ success: true, score: 0.8 });

    expect((await verifyRecaptcha("token", "lead_form")).allowed).toBe(true);
  });
});

describe("verifyRecaptcha — deny", () => {
  it("denies a missing token", async () => {
    const outcome = await verifyRecaptcha("", "lead_form");

    expect(outcome).toMatchObject({ allowed: false, reason: "invalid_token" });
  });

  it("denies an undefined token", async () => {
    expect((await verifyRecaptcha(undefined, "lead_form")).allowed).toBe(false);
  });

  it("denies a score below the threshold", async () => {
    mockVerify({ success: true, score: 0.2, action: "lead_form" });

    expect(await verifyRecaptcha("token", "lead_form")).toMatchObject({
      allowed: false,
      reason: "low_score",
      score: 0.2,
    });
  });

  it("denies a token minted for a different action", async () => {
    // Stops a token taken on a low-value page being replayed here.
    mockVerify({ success: true, score: 0.9, action: "newsletter" });

    expect(await verifyRecaptcha("token", "lead_form")).toMatchObject({
      allowed: false,
      reason: "action_mismatch",
    });
  });

  it.each([["invalid-input-response"], ["missing-input-response"], ["timeout-or-duplicate"]])(
    "denies on %s",
    async (code) => {
      mockVerify({ success: false, "error-codes": [code] });

      expect(await verifyRecaptcha("token", "lead_form")).toMatchObject({
        allowed: false,
        reason: "invalid_token",
      });
    },
  );

  it("respects a raised threshold", async () => {
    process.env.RECAPTCHA_MIN_SCORE = "0.8";
    mockVerify({ success: true, score: 0.6, action: "lead_form" });

    expect((await verifyRecaptcha("token", "lead_form")).allowed).toBe(false);
  });
});

describe("describeOutcome", () => {
  it("produces a one-line summary for every branch", async () => {
    mockVerify({ success: true, score: 0.9, action: "lead_form" });
    expect(describeOutcome(await verifyRecaptcha("t", "lead_form"))).toContain("verified");

    mockVerify({ success: true, score: 0.1, action: "lead_form" });
    expect(describeOutcome(await verifyRecaptcha("t", "lead_form"))).toContain("rejected");
  });
});
