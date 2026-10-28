import { describe, expect, it } from "vitest";
import { localFloorName } from "@/lib/floor-name";

describe("localFloorName", () => {
  const british = ["G", "1", "2", "R"];

  it("keeps the admin's English name on the English page", () => {
    expect(localFloorName("en", "1st Floor", "1", british)).toBe("1st Floor");
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
