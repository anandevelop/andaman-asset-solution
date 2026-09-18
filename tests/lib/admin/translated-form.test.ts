/**
 * tests/lib/admin/translated-form.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * translationCompletenessPercent() — the per-locale, multi-field
 * completion ring components/admin/LanguageTabs.tsx's `percent` prop
 * renders, generalizing the existing single-field translationCompleteness()
 * to an arbitrary field list.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it } from "vitest";
import { translationCompletenessPercent } from "@/lib/admin/translated-form";

type Row = { locale: string; title: string; excerpt: string; content: string };

const FIELDS = ["title", "excerpt", "content"] as const;

describe("translationCompletenessPercent", () => {
  it("is 100 when every required field is filled in", () => {
    const rows: Row[] = [{ locale: "en", title: "T", excerpt: "E", content: "C" }];
    expect(translationCompletenessPercent(rows, FIELDS).en).toBe(100);
  });

  it("is 0 when the locale has no translation row at all", () => {
    const rows: Row[] = [{ locale: "en", title: "T", excerpt: "E", content: "C" }];
    expect(translationCompletenessPercent(rows, FIELDS).th).toBe(0);
  });

  it("is a partial percentage when only some fields are filled in", () => {
    const rows: Row[] = [{ locale: "en", title: "T", excerpt: "", content: "" }];
    // 1 of 3 fields filled → 33% (rounded)
    expect(translationCompletenessPercent(rows, FIELDS).en).toBe(33);
  });

  it("treats a whitespace-only value as not filled in", () => {
    const rows: Row[] = [{ locale: "en", title: "   ", excerpt: "E", content: "C" }];
    expect(translationCompletenessPercent(rows, FIELDS).en).toBe(67);
  });

  it("computes every site locale independently", () => {
    const rows: Row[] = [
      { locale: "en", title: "T", excerpt: "E", content: "C" },
      { locale: "th", title: "T", excerpt: "", content: "" },
    ];
    const result = translationCompletenessPercent(rows, FIELDS);
    expect(result.en).toBe(100);
    expect(result.th).toBe(33);
    expect(result.zh).toBe(0);
    expect(result.ru).toBe(0);
  });
});
