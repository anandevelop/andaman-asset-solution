/**
 * The 3D view names a tapped room after its admin room, matched by English
 * name (components/unit-types/match-room.ts). These are the wording
 * differences the real models and the admin actually have.
 */
import { describe, expect, it } from "vitest";
import { matchRoom } from "@/components/unit-types/match-room";
import { MODEL_3D_TYPES, hasModel3d, loadModel3d } from "@/components/unit-types/model3d";

const rooms = (...names: string[]) => names.map((matchName, id) => ({ id, matchName }));

describe("matchRoom", () => {
  it("ignores '&', 'Area' and case", () => {
    expect(matchRoom("Kitchen & Dining Area", rooms("Bedroom 1", "Kitchen & Dining"))?.id).toBe(1);
  });

  it("ignores word order", () => {
    expect(matchRoom("Living · Kitchen · Dining", rooms("Living · Dining · Kitchen"))?.id).toBe(0);
  });

  it("drops a number only when that leaves one candidate", () => {
    expect(matchRoom("Swimming Pool 1", rooms("Terrace", "Swimming Pool"))?.id).toBe(1);
    expect(matchRoom("Bedroom 3", rooms("Bedroom 1", "Bedroom 2"))).toBeNull();
  });

  it("prefers the exact name over a looser one", () => {
    expect(matchRoom("Bedroom 2", rooms("Bedroom 1", "Bedroom 2"))?.id).toBe(1);
  });

  it("returns null when nothing is the same room", () => {
    expect(matchRoom("Garden", rooms("Terrace", "Hall"))).toBeNull();
    expect(matchRoom("Garden", rooms())).toBeNull();
  });
});

describe("MODEL_3D_TYPES", () => {
  it("is keyed by project slug and Sale Kit code", () => {
    expect(hasModel3d("victory", "A+")).toBe(true);
    expect(hasModel3d("trinity-village", "V")).toBe(true);
    expect(hasModel3d("trinity-village", "D")).toBe(false);
    expect(hasModel3d("residence-prime", null)).toBe(false);
    expect(Object.keys(MODEL_3D_TYPES).sort()).toEqual(["residence-prime", "trinity-village", "victory"]);
  });

  it("lists exactly the types each project's model file has", async () => {
    // The page asks MODEL_3D_TYPES without loading the data; the two must agree.
    for (const [slug, codes] of Object.entries(MODEL_3D_TYPES)) {
      const project = await loadModel3d(slug);
      expect(project?.types.map((type) => type.key), slug).toEqual(codes);
    }
  });
});
