/**
 * tests/terms.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * content/terms.ts is four hand-translated copies of one legal text, and
 * the English governs. Nothing in the type system notices when a clause is
 * added to the English and forgotten in Russian, so this checks that every
 * locale has the same sections with the same number of paragraphs.
 *
 * It also pins what the terms-v2 legal review (2026-10-07) took out, so it
 * cannot drift back in from an older draft: acceptance by continued use,
 * the blanket "as is" disclaimer, and the open-ended indemnity.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it } from "vitest";
import { siteConfig } from "@/config/site";
import { TERMS_OF_SERVICE_VERSION, termsOfService } from "@/content/terms";

const locales = Object.keys(termsOfService) as (keyof typeof termsOfService)[];

describe("terms of service", () => {
  it("has the same sections, paragraphs and bullets in every locale", () => {
    const shape = (locale: keyof typeof termsOfService) =>
      termsOfService[locale].sections.map((s) => [s.body?.length ?? 0, s.bullets?.length ?? 0]);

    for (const locale of locales) {
      expect(shape(locale), locale).toEqual(shape("en"));
    }
  });

  it("carries one version and one contact number across every locale", () => {
    for (const locale of locales) {
      expect(termsOfService[locale].version).toBe(TERMS_OF_SERVICE_VERSION);
      expect(termsOfService[locale].contactPhone).toEqual(siteConfig.legal.contactPhone);
    }
    expect(siteConfig.legal.contactPhone.tel).toBe("+66953089559");
  });

  it("is titled Terms & Conditions, as the footer links it", () => {
    expect(termsOfService.en.title).toBe("Terms & Conditions");
  });

  it("no longer contains the clauses the legal review struck out", () => {
    const english = JSON.stringify(termsOfService.en.sections);

    expect(english).not.toContain("Continued use of the website");
    expect(english).not.toContain("“as is”");
    expect(english).not.toContain("You agree to indemnify");
    expect(english).not.toContain("subject to change without notice");
    expect(english).not.toContain("which forms part of these Terms");
  });
});
