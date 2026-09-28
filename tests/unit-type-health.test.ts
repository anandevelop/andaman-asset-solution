/**
 * tests/unit-type-health.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The "what is still missing" summary behind the unit-types workspace.
 *
 * Two things are worth pinning here beyond the obvious counts.
 *
 * The area check only fires when every room on the floor has an area. Half
 * the catalogue publishes room names without areas — Trinity Village's Type
 * B second floor has thirteen rooms and not one measurement — and a check
 * that reported those as a mismatch would put a permanent warning on floors
 * nobody can fix, which is how a warning stops being read.
 *
 * And the tolerance is not zero. Victory's Type A+ first floor states
 * 235.48 while its own room list totals 235.93, in the developer's own Sale
 * Kit. This screen records what was published; it does not get to refuse it.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it } from "vitest";
import {
  AREA_TOLERANCE_SQM,
  floorHealth,
  unitTypeHealth,
  type HealthFloor,
} from "@/lib/admin/unit-type-health";
import { locales } from "@/i18n";

const ALL = locales;

function room(over: Partial<HealthFloor["rooms"][number]> = {}): HealthFloor["rooms"][number] {
  return {
    names: { en: "Living Room", th: "ห้องนั่งเล่น", zh: "客厅", ru: "Гостиная" },
    areaSqm: 10,
    photoUrl: "/gallery/x.webp",
    ...over,
  };
}

function floor(over: Partial<HealthFloor> = {}): HealthFloor {
  return {
    floorName: "1st Floor",
    shortLabel: "1",
    imageUrl: "/floor-plans/x-line.webp",
    areaSqm: 20,
    rooms: [room(), room()],
    ...over,
  };
}

const kinds = (f: HealthFloor) => floorHealth(f, ALL).issues.map((i) => i.kind);

describe("floorHealth", () => {
  it("reports nothing for a complete floor", () => {
    expect(kinds(floor())).toEqual([]);
  });

  it("reports a floor with no drawing", () => {
    expect(kinds(floor({ imageUrl: "" }))).toContain("noPlan");
  });

  it("reports a floor with no rooms yet", () => {
    expect(kinds(floor({ rooms: [] }))).toContain("noRooms");
  });

  it("counts the rooms missing a photo", () => {
    const issues = floorHealth(
      floor({ rooms: [room(), room({ photoUrl: null }), room({ photoUrl: null })] }),
      ALL,
    ).issues;

    expect(issues).toContainEqual({ kind: "roomsWithoutPhoto", count: 2 });
  });

  it("counts a room missing any one language as untranslated", () => {
    const issues = floorHealth(
      floor({ rooms: [room(), room({ names: { en: "Terrace", th: "เทอร์เรซ" } })] }),
      ALL,
    ).issues;

    expect(issues).toContainEqual({ kind: "roomsUntranslated", count: 1 });
  });

  it("separates 'no photo' from 'not translated' — they are different jobs", () => {
    const issues = floorHealth(
      floor({ rooms: [room({ photoUrl: null, names: { en: "Hall" } })] }),
      ALL,
    ).issues;

    expect(issues).toContainEqual({ kind: "roomsWithoutPhoto", count: 1 });
    expect(issues).toContainEqual({ kind: "roomsUntranslated", count: 1 });
  });

  it("reports a furnished plan whose crop does not match", () => {
    expect(
      kinds(floor({ furnishedImageUrl: "/x-furnished.webp", furnishedAspectMismatch: true })),
    ).toContain("furnishedAspect");
  });

  it("says nothing about a furnished plan that matches", () => {
    expect(
      kinds(floor({ furnishedImageUrl: "/x-furnished.webp", furnishedAspectMismatch: false })),
    ).not.toContain("furnishedAspect");
  });

  describe("the area cross-check", () => {
    it("reports a floor whose rooms do not add up to it", () => {
      const issues = floorHealth(
        floor({ areaSqm: 30, rooms: [room({ areaSqm: 10 }), room({ areaSqm: 10 })] }),
        ALL,
      ).issues;

      expect(issues).toContainEqual({ kind: "areaMismatch", difference: 10 });
    });

    it("tolerates the rounding the Sale Kits themselves publish", () => {
      // Victory A+ first floor: stated 235.48, rooms total 235.93.
      const rooms = [room({ areaSqm: 235.93 })];
      expect(kinds(floor({ areaSqm: 235.48, rooms }))).not.toContain("areaMismatch");

      // Just past the tolerance, it is worth saying.
      const past = [room({ areaSqm: 235.48 + AREA_TOLERANCE_SQM + 0.05 })];
      expect(kinds(floor({ areaSqm: 235.48, rooms: past }))).toContain("areaMismatch");
    });

    /*
      The check that keeps the warning readable. Without it, every floor
      whose rooms are unmeasured carries a permanent mismatch nobody can
      clear, and the badge stops meaning anything.
    */
    it("stays quiet when any room has no area at all", () => {
      const rooms = [room({ areaSqm: 10 }), room({ areaSqm: null })];
      expect(kinds(floor({ areaSqm: 999, rooms }))).not.toContain("areaMismatch");
    });

    it("stays quiet when the floor itself has no stated area", () => {
      expect(kinds(floor({ areaSqm: null }))).not.toContain("areaMismatch");
    });
  });
});

describe("unitTypeHealth", () => {
  it("adds up the issues across floors for the list badge", () => {
    const health = unitTypeHealth(
      [floor(), floor({ imageUrl: "", rooms: [] })],
      ALL,
    );

    expect(health.floors).toHaveLength(2);
    expect(health.floors[0].issues).toEqual([]);
    expect(health.issueCount).toBe(2);
  });

  it("reports a clean type as having nothing outstanding", () => {
    expect(unitTypeHealth([floor(), floor()], ALL).issueCount).toBe(0);
  });

  it("totals untranslated rooms separately, for the language tabs' dots", () => {
    const partial = floor({
      rooms: [room({ names: { en: "Hall" } }), room({ names: { en: "Study" } })],
    });

    expect(unitTypeHealth([partial, partial], ALL).untranslatedRooms).toBe(4);
  });

  it("keeps each floor's own label, so a dot can point at the right one", () => {
    const health = unitTypeHealth(
      [floor({ shortLabel: "G" }), floor({ shortLabel: "2", rooms: [] })],
      ALL,
    );

    expect(health.floors.map((f) => f.shortLabel)).toEqual(["G", "2"]);
    expect(health.floors[1].issues.map((i) => i.kind)).toContain("noRooms");
  });
});
