/**
 * tests/unit-types-model3d-key.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The 3D models are keyed "A", "A+", "R"; production's unit-type codes
 * read "Type A". Matched as typed, no type had a model on the live site.
 * These pin the normalisation (components/unit-types/model3d/key.ts) with
 * the codes the live database actually holds.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it } from "vitest";
import { hasModel3d, loadModel3d, model3dKey, model3dKeyFor, MODEL_3D_TYPES } from "@/components/unit-types/model3d";

describe("model3dKey", () => {
  it("drops a leading 'Type' and normalises case and spaces", () => {
    expect(model3dKey("Type A+")).toBe("A+");
    expect(model3dKey(" type r ")).toBe("R");
    expect(model3dKey("A")).toBe("A");
    expect(model3dKey(null)).toBe("");
  });
});

describe("hasModel3d", () => {
  it("finds the model for production's codes", () => {
    expect(hasModel3d("residence-prime", "Type R")).toBe(true);
    expect(hasModel3d("victory", "Type A+")).toBe(true);
    expect(hasModel3d("trinity-village", "Type A")).toBe(true);
    // Trinity's 4-bed house: "V" in the model file, "Type B" on production.
    expect(hasModel3d("trinity-village", "Type B")).toBe(true);
    expect(model3dKeyFor("trinity-village", "Type B")).toBe("V");
    expect(hasModel3d("trinity-village", "V")).toBe(true);
  });

  it("still says no for a type without a model", () => {
    expect(hasModel3d("trinity-village", "Type D")).toBe(false);
    expect(hasModel3d("victory", "")).toBe(false);
  });

  it("lists only keys its model files define", async () => {
    for (const [slug, keys] of Object.entries(MODEL_3D_TYPES)) {
      const project = await loadModel3d(slug);
      const defined = project?.types.map((type) => type.key) ?? [];
      for (const key of keys) expect(defined, `${slug} ${key}`).toContain(key);
    }
  });
});
