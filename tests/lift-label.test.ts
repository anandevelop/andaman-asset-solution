import { describe, expect, it } from "vitest";
import { liftLabelFor } from "@/lib/lift-label";

describe("liftLabelFor", () => {
  it("keeps a label the admin set", () => {
    expect(liftLabelFor("R", "Roof Terrace")).toBe("R");
    expect(liftLabelFor("  B1 ", "Basement")).toBe("B1");
  });

  it("takes the number from the floor name", () => {
    expect(liftLabelFor(null, "1st Floor")).toBe("1");
    expect(liftLabelFor("", "2nd Floor")).toBe("2");
    expect(liftLabelFor(null, "Floor 12")).toBe("12");
  });

  // The case that made this helper: first-character labels were "ช" for
  // every Thai floor, and the save refuses two floors sharing a label.
  it("tells Thai floor names apart", () => {
    const labels = ["ชั้น 1", "ชั้น 2", "ชั้น 3"].map((name) => liftLabelFor(null, name));
    expect(labels).toEqual(["1", "2", "3"]);
  });

  it("reads a ground floor as G", () => {
    expect(liftLabelFor(null, "Ground Floor")).toBe("G");
    expect(liftLabelFor(undefined, "ชั้นล่าง")).toBe("G");
  });

  it("falls back to the first character", () => {
    expect(liftLabelFor(null, "roof")).toBe("R");
    expect(liftLabelFor(null, "  ")).toBe("");
  });

  it("fits the three-character column", () => {
    expect(liftLabelFor(null, "Floor 12345")).toBe("123");
  });
});
