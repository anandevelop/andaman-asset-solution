/**
 * tests/lib/slugify.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Both halves of components/admin/SlugField.tsx's normalization: the live
 * variant applied on every keystroke, and the fully-cleaned form applied
 * on blur. See lib/validations.ts for the regex both must satisfy:
 * /^[a-z0-9]+(?:-[a-z0-9]+)*$/.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it } from "vitest";
import { slugify, slugifyLive } from "@/lib/slugify";

describe("slugify", () => {
  it("lowercases and hyphenates a plain title", () => {
    expect(slugify("The Victory Villas")).toBe("the-victory-villas");
  });

  it("collapses a run of separators into a single hyphen", () => {
    expect(slugify("The   Victory -- Villas")).toBe("the-victory-villas");
  });

  it("strips a leading or trailing hyphen", () => {
    expect(slugify("  The Victory Villas  ")).toBe("the-victory-villas");
    expect(slugify("-the-victory-villas-")).toBe("the-victory-villas");
  });

  it("drops punctuation instead of keeping it", () => {
    expect(slugify("Andaman's Bay Villa (Phase 2)")).toBe("andaman-s-bay-villa-phase-2");
  });

  it("passes an already-valid slug through unchanged", () => {
    expect(slugify("the-victory-villas")).toBe("the-victory-villas");
  });

  it("keeps digits", () => {
    expect(slugify("Villa No. 7")).toBe("villa-no-7");
  });

  it("returns an empty string for input with nothing sluggable", () => {
    expect(slugify("   ")).toBe("");
    expect(slugify("---")).toBe("");
  });
});

describe("slugifyLive", () => {
  it("does not strip a trailing hyphen mid-type", () => {
    // "The " with a trailing space, about to become the next word —
    // slugify() would drop this hyphen, which is exactly the bug that
    // made "thev" appear instead of "the-v" once typing continued.
    expect(slugifyLive("The ")).toBe("the-");
  });

  it("still collapses repeated separators", () => {
    expect(slugifyLive("The  Victory")).toBe("the-victory");
  });

  it("does not strip a leading hyphen either", () => {
    expect(slugifyLive(" the")).toBe("-the");
  });
});
