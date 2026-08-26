/**
 * tests/email.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * `isEmailConfigured()` is the gate every send in lib/email.ts checks
 * first — get it wrong and either real mail silently stops going out, or
 * every dev environment without SMTP set starts throwing. Mirrors
 * tests/line.test.ts's approach to isLineConfigured (env-var driven, no
 * network).
 * ─────────────────────────────────────────────────────────────────────────
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isEmailConfigured } from "@/lib/email";

describe("isEmailConfigured", () => {
  const original = process.env.SMTP_HOST;

  beforeEach(() => {
    delete process.env.SMTP_HOST;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.SMTP_HOST;
    else process.env.SMTP_HOST = original;
  });

  it("is false when SMTP_HOST is unset", () => {
    expect(isEmailConfigured()).toBe(false);
  });

  it("is false when SMTP_HOST is an empty string", () => {
    process.env.SMTP_HOST = "";
    expect(isEmailConfigured()).toBe(false);
  });

  it("is true once SMTP_HOST is set", () => {
    process.env.SMTP_HOST = "smtp.example.com";
    expect(isEmailConfigured()).toBe(true);
  });
});
