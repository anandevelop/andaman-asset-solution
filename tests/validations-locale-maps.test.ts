/**
 * tests/validations-locale-maps.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Per-locale content maps accept a partial set of languages.
 *
 * Written during the zod 3 → 4 upgrade, after `z.record(z.enum(locales),
 * …)` silently changed meaning: in zod 3 it was a partial map, in zod 4 an
 * enum-keyed record is exhaustive and demands every key. Both call sites
 * take content that is written in one language and translated later, so
 * the new behaviour rejected every realistic submission — a construction
 * update with only an English summary, a routing rule naming somebody for
 * Thai and nobody for Russian.
 *
 * Neither `tsc` nor the other 894 tests noticed: the types still line up,
 * and nothing covered a half-filled map. Hence this file. It is not about
 * zod — it is about the shape these two forms actually submit.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";
import { progressDetailSchema } from "@/lib/validations";
import { locales } from "@/i18n";

const base = {
  month: 9,
  year: 2026,
  percentComplete: 40,
  images: [],
};

describe("progress detail summaries", () => {
  it("accepts one language on its own", () => {
    const result = progressDetailSchema.safeParse({
      ...base,
      summaries: { en: "Roof on, second fix started." },
    });

    expect(result.success).toBe(true);
  });

  it("accepts all four", () => {
    const summaries = Object.fromEntries(locales.map((locale) => [locale, `text ${locale}`]));

    expect(progressDetailSchema.safeParse({ ...base, summaries }).success).toBe(true);
  });

  it("accepts none at all", () => {
    expect(progressDetailSchema.safeParse({ ...base, summaries: {} }).success).toBe(true);
  });

  it("still rejects a locale nobody serves", () => {
    // Partial must not mean "anything goes" — a typo'd key would store
    // text no page ever reads.
    const result = progressDetailSchema.safeParse({
      ...base,
      summaries: { en: "fine", de: "not a locale this site has" },
    });

    expect(result.success).toBe(false);
  });

  it("still rejects a summary that is too long", () => {
    const result = progressDetailSchema.safeParse({
      ...base,
      summaries: { en: "x".repeat(4001) },
    });

    expect(result.success).toBe(false);
  });
});

describe("the zod behaviour this guards against", () => {
  it("a plain enum-keyed record demands every locale", () => {
    // Documented, not hypothetical: this is what both schemas did after
    // the upgrade and before the fix. If a future zod makes z.record
    // partial again, this fails and the comments above can be deleted.
    const exhaustive = z.record(z.enum(locales), z.string());

    expect(exhaustive.safeParse({ en: "only english" }).success).toBe(false);
    expect(z.partialRecord(z.enum(locales), z.string()).safeParse({ en: "ok" }).success).toBe(true);
  });
});
