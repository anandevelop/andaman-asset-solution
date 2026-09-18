/**
 * tests/lib/publishing.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * countTranslationDiff() — the field-diff count behind both the review
 * queue's change chips and the revision-history modal's "N fields
 * changed" summary. TRANSLATION_FIELDS was widened in Phase 6 to include
 * content/excerpt/focusKeyword (previously Project-shaped only), so a
 * news body rewrite used to report "0 fields changed" — this pins the fix
 * down and confirms the widen is harmless for a content type that simply
 * doesn't have those fields.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it } from "vitest";
import { countTranslationDiff } from "@/lib/publishing";

describe("countTranslationDiff", () => {
  it("counts a news body-only edit as a changed field", () => {
    const previous = [{ locale: "en", title: "Same title", content: "Old body" }];
    const current = [{ locale: "en", title: "Same title", content: "New body" }];
    expect(countTranslationDiff(current, previous)).toBe(1);
  });

  it("counts excerpt and focusKeyword changes too", () => {
    const previous = [{ locale: "en", title: "T", excerpt: "old", focusKeyword: "old kw" }];
    const current = [{ locale: "en", title: "T", excerpt: "new", focusKeyword: "new kw" }];
    expect(countTranslationDiff(current, previous)).toBe(2);
  });

  it("is 0 for a Project-shaped snapshot with no content/excerpt/focusKeyword fields at all", () => {
    const previous = [{ locale: "en", name: "Trinity Village", tagline: "Same tagline" }];
    const current = [{ locale: "en", name: "Trinity Village", tagline: "Same tagline" }];
    expect(countTranslationDiff(current, previous)).toBe(0);
  });

  it("still counts a real Project field change (unaffected by the widen)", () => {
    const previous = [{ locale: "en", name: "Old name", tagline: "T" }];
    const current = [{ locale: "en", name: "New name", tagline: "T" }];
    expect(countTranslationDiff(current, previous)).toBe(1);
  });

  it("counts independently per locale", () => {
    const previous = [
      { locale: "en", title: "T", content: "old" },
      { locale: "th", title: "T", content: "old" },
    ];
    const current = [
      { locale: "en", title: "T", content: "new" },
      { locale: "th", title: "T", content: "old" },
    ];
    expect(countTranslationDiff(current, previous)).toBe(1);
  });

  it("treats going from empty to filled in as a change, not a non-change", () => {
    const previous = [{ locale: "en", title: "T", excerpt: "" }];
    const current = [{ locale: "en", title: "T", excerpt: "Now written" }];
    expect(countTranslationDiff(current, previous)).toBe(1);
  });
});
