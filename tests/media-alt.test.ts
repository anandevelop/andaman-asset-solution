/**
 * tests/media-alt.test.ts — when a file's ALT text counts as missing
 * (lib/media-alt.ts), the one rule the library's count and badges share.
 */

import { describe, expect, it } from "vitest";
import { isAltTextComplete, MIN_ALT_LENGTH } from "@/lib/media-alt";

const LOCALES = ["th", "en", "zh", "ru"] as const;
const full = { th: "สระว่ายน้ำ", en: "Pool deck", zh: "泳池露台区域", ru: "Бассейн" };

describe("isAltTextComplete", () => {
  it("passes real text in every language", () => {
    expect(isAltTextComplete(full, LOCALES)).toBe(true);
  });

  it("fails an empty or absent language", () => {
    expect(isAltTextComplete({ ...full, ru: "" }, LOCALES)).toBe(false);
    expect(isAltTextComplete({ th: full.th, en: full.en, zh: full.zh }, LOCALES)).toBe(false);
    expect(isAltTextComplete(null, LOCALES)).toBe(false);
  });

  it("fails placeholder-length ALT, which used to pass", () => {
    // "img", "1", "." said nothing and counted as written.
    expect(isAltTextComplete({ ...full, en: "img" }, LOCALES)).toBe(false);
    expect(isAltTextComplete({ ...full, en: " . " }, LOCALES)).toBe(false);
  });

  it("passes a one-word ALT at the minimum length", () => {
    expect(MIN_ALT_LENGTH).toBe(5);
    expect(isAltTextComplete({ ...full, en: "Villa" }, LOCALES)).toBe(true);
  });
});
