/**
 * tests/privacy-policy.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * content/privacy-policy.ts is four hand-translated copies of one PDPA
 * notice. Nothing in the type system notices a paragraph added to the
 * English and forgotten in Chinese, so this checks every locale has the
 * same sections with the same number of paragraphs, bullets and closing
 * notes.
 *
 * It also pins what the privacy-policy-v2 legal review (2026-10-07) fixed,
 * so an older draft cannot bring it back: consent as a basis for answering
 * an enquiry, the flat 30-day response promise, "generally up to 10 years",
 * and rectification cited as s.35 (it is s.36; s.35 is the controller's
 * duty of accuracy).
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it } from "vitest";
import { siteConfig } from "@/config/site";
import { PRIVACY_POLICY_VERSION, privacyPolicy } from "@/content/privacy-policy";

const locales = Object.keys(privacyPolicy) as (keyof typeof privacyPolicy)[];

describe("privacy policy", () => {
  it("has the same sections, paragraphs, bullets and notes in every locale", () => {
    const shape = (locale: keyof typeof privacyPolicy) =>
      privacyPolicy[locale].sections.map((s) => [
        s.body?.length ?? 0,
        s.bullets?.length ?? 0,
        s.after?.length ?? 0,
      ]);

    for (const locale of locales) {
      expect(shape(locale), locale).toEqual(shape("en"));
    }
  });

  it("is the version every new consent is stamped with, in every locale", () => {
    expect(PRIVACY_POLICY_VERSION).toBe(siteConfig.legal.consentVersion);
    expect(PRIVACY_POLICY_VERSION).toBe("privacy-policy-v2");

    for (const locale of locales) {
      expect(privacyPolicy[locale].version).toBe(PRIVACY_POLICY_VERSION);
      expect(privacyPolicy[locale].contactPhone).toEqual(siteConfig.legal.contactPhone);
    }
  });

  it("cites s.36 for rectification, in every locale", () => {
    const rights = (locale: keyof typeof privacyPolicy) =>
      privacyPolicy[locale].sections[6].bullets!.join(" ");

    expect(rights("en")).toContain("up to date (s.36)");
    expect(rights("th")).toContain("(มาตรา 36)");
    expect(rights("zh")).toContain("（第 36 条）");
    expect(rights("ru")).toContain("(ст. 36)");
    for (const locale of locales) {
      expect(rights(locale), locale).not.toMatch(/35/);
    }
  });

  it("no longer contains what the legal review struck out", () => {
    const english = JSON.stringify(privacyPolicy.en.sections);

    expect(english).not.toContain("consent (s.19) and performance of a contract");
    expect(english).not.toContain("We will respond within 30 days");
    expect(english).not.toContain("generally up to 10 years");
    expect(english).not.toContain("We do not collect sensitive personal data");
    expect(english).not.toContain("To improve our website, measure marketing performance");
  });
});
