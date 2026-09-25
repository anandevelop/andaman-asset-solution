/**
 * tests/admin/seo-panel.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * One answer to "is this meta title the right length", and one thing a
 * search result looks like.
 *
 * There were two of each. SeoPreviewFields — the news and event forms —
 * drew a bar that filled emerald inside lib/seo-limits.ts's min–max band
 * and amber outside it, under a hint that named both bounds.
 * PageSeoEditor — the project SEO tab — drew "23/60 characters", red past
 * the maximum, with no notion of a minimum at all. The same 23-character
 * title was therefore correct on one screen and too short on another, and
 * nothing on either screen told you which was right.
 *
 * Both now render components/admin/seo/*, so the rule lives in one file
 * and the wording in one message key. This test is what keeps the next
 * screen from quietly growing a third copy.
 *
 * Read from source: these are "use client" components with their own
 * state, and what is being asserted is which module owns the rule — a
 * structural fact, not a rendered one. Same reasoning as the rest of
 * tests/admin/.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SEO_LIMITS } from "@/lib/seo-limits";

const ROOT = process.cwd();

const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const read = (...parts: string[]) =>
  stripComments(readFileSync(join(ROOT, "components", "admin", ...parts), "utf8"));

/** Every component that puts a meta title or description in front of an
 *  editor. A new one belongs in this list, which is the point. */
const PANELS = ["SeoPreviewFields.tsx", "PageSeoEditor.tsx"] as const;

describe("every SEO panel", () => {
  it("measures length with the shared meter", () => {
    for (const file of PANELS) {
      expect(read(file), file).toContain("<SeoLengthMeter");
    }
  });

  it("draws its search result with the shared preview", () => {
    for (const file of PANELS) {
      expect(read(file), file).toContain("<SerpPreview");
    }
  });

  it("keeps no private copy of either", () => {
    /* The two that existed: a `Counter` in PageSeoEditor and a
       CharBar/CharCount pair in SeoPreviewFields. A component that grows
       its own again is how the screens drifted apart the first time. */
    for (const file of PANELS) {
      const source = read(file);

      expect(source, file).not.toMatch(/const Counter = /);
      expect(source, file).not.toMatch(/function Char(Bar|Count)\b/);
      expect(source, file).not.toMatch(/text-\[#1a0dab\]/);
    }
  });

  it("states the recommendation in the same words", () => {
    // Not two keys that happen to say the same thing today — one key.
    for (const file of PANELS.filter((f) => f !== "SeoPreviewFields.tsx")) {
      expect(read(file), file).toContain('t("seo.idealLength"');
    }

    expect(read("NewsSeoPanel.tsx")).toContain('t("seo.idealLength"');
  });
});

describe("the meter itself", () => {
  const source = read("seo", "SeoLengthMeter.tsx");

  it("honours both bounds, not just the ceiling", () => {
    /* The defect in one line: PageSeoEditor's counter compared against
       `limit` alone, so "too short" was a state it could not render. */
    expect(source).toContain("length >= min");
    expect(source).toContain("length > max");
  });

  it("does not let a long value overflow its track", () => {
    expect(source).toContain("Math.min(100");
  });
});

describe("lib/seo-limits", () => {
  it("still defines a floor as well as a ceiling", () => {
    // The meter's whole "too short" branch is dead without these.
    expect(SEO_LIMITS.titleMin).toBeLessThan(SEO_LIMITS.title);
    expect(SEO_LIMITS.descriptionMin).toBeLessThan(SEO_LIMITS.description);
  });
});
