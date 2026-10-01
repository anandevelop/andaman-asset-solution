/**
 * tests/contact-mask.test.ts — what a lead's contact details look like
 * before anyone reveals them (lib/contact-mask.ts).
 */

import { describe, expect, it } from "vitest";
import { maskEmail, maskPhone, whatsAppDigits } from "@/lib/contact-mask";

describe("maskEmail", () => {
  it("keeps two characters and the domain", () => {
    expect(maskEmail("somchai@gmail.com")).toBe("so•••@gmail.com");
  });

  it("keeps one character of a very short mailbox", () => {
    // Two kept characters of a two-character mailbox would be the whole
    // mailbox — no mask at all.
    expect(maskEmail("ab@x.co")).toBe("a•••@x.co");
  });

  it("never echoes something that is not an address", () => {
    expect(maskEmail("not-an-email")).toBe("••••••");
    expect(maskEmail("@x.co")).toBe("••••••");
  });
});

describe("maskPhone", () => {
  it("keeps the country code and last four digits", () => {
    expect(maskPhone("+66 81 234 5678")).toBe("+66 •••• 5678");
    expect(maskPhone("+7-912-345-67-89")).toBe("+7 •••• 6789");
  });

  it("keeps only the last four without a country code", () => {
    expect(maskPhone("081-234-5678")).toBe("•••• 5678");
  });

  it("masks a number too short to have anything left", () => {
    expect(maskPhone("1234")).toBe("••••");
  });

  it("does not guess a country code with nothing separating it", () => {
    // +66 or +668? A wrong guess prints a digit of the masked part.
    expect(maskPhone("+66812345678")).toBe("•••• 5678");
  });
});

describe("whatsAppDigits", () => {
  it("strips everything wa.me rejects", () => {
    expect(whatsAppDigits("+66 (81) 234-5678")).toBe("66812345678");
  });
});
