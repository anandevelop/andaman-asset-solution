import { describe, expect, it } from "vitest";
import { localFloorName, localLiftLabel } from "@/lib/floor-name";

describe("localFloorName", () => {
  const british = ["G", "1", "2", "R"];

  it("names English floors from the label, ground first", () => {
    expect(localFloorName("en", "Ground Floor", "G", british)).toBe("Ground Floor");
    expect(localFloorName("en", "x", "1", british)).toBe("1st Floor");
    expect(localFloorName("en", "x", "2", british)).toBe("2nd Floor");
    // A panel that starts at 1 means 1 is the ground.
    expect(localFloorName("en", "1st Floor", "1", ["1", "2"])).toBe("Ground Floor");
    expect(localFloorName("en", "x", "R", british)).toBe("Roof");
  });

  it("counts the ground floor as the first when the panel has a G", () => {
    expect(british.map((label) => localFloorName("th", "x", label, british))).toEqual([
      "ชั้น 1",
      "ชั้น 2",
      "ชั้น 3",
      "ชั้นดาดฟ้า",
    ]);
    expect(localFloorName("zh", "x", "1", british)).toBe("二层");
    expect(localFloorName("ru", "x", "G", british)).toBe("1-й этаж");
  });

  it("takes the numbers as they are when the panel starts at 1", () => {
    const panel = ["1", "2"];
    expect(localFloorName("th", "x", "1", panel)).toBe("ชั้น 1");
    expect(localFloorName("zh", "x", "2", panel)).toBe("二层");
    expect(localFloorName("ru", "x", "2", panel)).toBe("2-й этаж");
  });

  it("falls back to the typed name for a label it cannot read", () => {
    expect(localFloorName("th", "Pool deck", "P", ["G", "P"])).toBe("Pool deck");
  });
});

describe("localLiftLabel", () => {
  it("counts from 1 on Thai, Chinese and Russian pages when the panel has a G", () => {
    expect(["G", "1", "2", "R"].map((l) => localLiftLabel("th", l, ["G", "1", "2", "R"]))).toEqual(["1", "2", "3", "R"]);
    expect(localLiftLabel("zh", "G", ["G", "1"])).toBe("1");
  });

  it("leaves English, and panels already counting from 1, alone", () => {
    expect(localLiftLabel("en", "G", ["G", "1"])).toBe("G");
    expect(localLiftLabel("ru", "1", ["1", "2"])).toBe("1");
  });
});
