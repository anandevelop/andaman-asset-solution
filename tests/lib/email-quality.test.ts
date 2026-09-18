/**
 * tests/lib/email-quality.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The pure half of the lead form's inline email check — no DNS, no fetch,
 * no module-level cache, so none of this needs a mock. See
 * app/api/validate-email/route.ts (and tests/api/validate-email.test.ts)
 * for the MX-lookup half, which does.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it } from "vitest";
import {
  emailDomain,
  isDisposableDomain,
  suggestEmailCorrection,
  COMMON_EMAIL_DOMAINS,
} from "@/lib/email-quality";

describe("emailDomain", () => {
  it("lower-cases and trims the domain half", () => {
    expect(emailDomain("Somchai@GMAIL.com ")).toBe("gmail.com");
  });

  it("returns null for a string with no @", () => {
    expect(emailDomain("not-an-email")).toBeNull();
  });

  it("returns null for a trailing @ with nothing after it", () => {
    expect(emailDomain("somchai@")).toBeNull();
  });
});

describe("isDisposableDomain", () => {
  it("matches a known throwaway domain exactly", () => {
    expect(isDisposableDomain("mailinator.com")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isDisposableDomain("MAILINATOR.COM")).toBe(true);
  });

  it("is subdomain-insensitive", () => {
    // Several throwaway providers hand out a fresh random subdomain per
    // inbox — matching only the exact registrable domain would let every
    // one of those slip through.
    expect(isDisposableDomain("inbox.mailinator.com")).toBe(true);
  });

  it("does not flag a real provider", () => {
    for (const domain of COMMON_EMAIL_DOMAINS) {
      expect(isDisposableDomain(domain)).toBe(false);
    }
  });

  it("does not flag a domain that merely contains a throwaway name as a substring", () => {
    // "mailinator.com" must not match "notmailinator.com" — endsWith(".mailinator.com")
    // requires the dot, so a domain that only shares a substring is not a subdomain of it.
    expect(isDisposableDomain("notmailinator.com")).toBe(false);
  });
});

describe("suggestEmailCorrection", () => {
  it("suggests the common domain within edit distance 2", () => {
    expect(suggestEmailCorrection("somchai.r@gmial.com")).toBe("somchai.r@gmail.com");
  });

  it("suggests across a two-character transposition", () => {
    expect(suggestEmailCorrection("x@hotmial.com")).toBe("x@hotmail.com");
  });

  it("does not suggest beyond edit distance 2", () => {
    // "yahoo.com" -> "gmail.com" is 6 edits away; nothing in
    // COMMON_EMAIL_DOMAINS is within 2 of this string.
    expect(suggestEmailCorrection("x@somecompletelyrandomdomain.com")).toBeNull();
  });

  it("does not suggest a correction for a domain that already is a common one", () => {
    // Distance 0 to an entry means there is nothing to correct — this is
    // also what keeps the route from ever telling gmail.com's own users
    // they misspelled themselves.
    for (const domain of COMMON_EMAIL_DOMAINS) {
      expect(suggestEmailCorrection(`x@${domain}`)).toBeNull();
    }
  });

  it("preserves the original local part in the suggestion", () => {
    expect(suggestEmailCorrection("somchai.r+villas@gmial.com")).toBe(
      "somchai.r+villas@gmail.com",
    );
  });

  it("returns null for a string with no @", () => {
    expect(suggestEmailCorrection("not-an-email")).toBeNull();
  });
});
