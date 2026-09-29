/**
 * tests/blueprint-pixels.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The canvas copy of the blueprint transform the admin preview uses for a
 * floor whose blueprint has not been saved yet. It must agree with the
 * sharp version (tests/floor-plan-images.test.ts) — same stroke, same gain,
 * and mid-tones clamped rather than lost.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it } from "vitest";
import { BLUEPRINT_ALPHA_GAIN, BLUEPRINT_STROKE, blueprintPixels } from "@/lib/blueprint-pixels";

const px = (...rgba: number[]) => new Uint8ClampedArray(rgba);

describe("blueprintPixels", () => {
  it("drops white paper to fully transparent", () => {
    expect(Array.from(blueprintPixels(px(255, 255, 255, 255)))).toEqual([
      BLUEPRINT_STROKE.r, BLUEPRINT_STROKE.g, BLUEPRINT_STROKE.b, 0,
    ]);
  });

  it("keeps black strokes fully opaque in the stroke colour", () => {
    expect(Array.from(blueprintPixels(px(0, 0, 0, 255)))).toEqual([
      BLUEPRINT_STROKE.r, BLUEPRINT_STROKE.g, BLUEPRINT_STROKE.b, 255,
    ]);
  });

  it("amplifies light grey lines by the gain", () => {
    const [, , , alpha] = blueprintPixels(px(200, 200, 200, 255));
    expect(alpha).toBe(Math.round(55 * BLUEPRINT_ALPHA_GAIN));
  });

  it("clamps mid-tones to opaque instead of wrapping to zero", () => {
    const [, , , alpha] = blueprintPixels(px(100, 100, 100, 255));
    expect(alpha).toBe(255);
  });

  it("leaves transparent source pixels transparent", () => {
    const [, , , alpha] = blueprintPixels(px(0, 0, 0, 0));
    expect(alpha).toBe(0);
  });
});
