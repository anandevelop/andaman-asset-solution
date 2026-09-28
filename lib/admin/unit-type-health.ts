/**
 * lib/admin/unit-type-health.ts
 * ─────────────────────────────────────────────────────────────────────────
 * What is still missing from a unit type's floors.
 *
 * One function feeding two places — the badge on each type in the list, and
 * the dots along the floor strip inside the editor. Written once because
 * the list saying "complete" while the editor shows three warnings is the
 * kind of disagreement nobody reports as a bug; they just stop trusting the
 * badge.
 *
 * EVERYTHING HERE WARNS AND NOTHING BLOCKS
 *
 * The Sale Kits themselves are incomplete: The Victory's Type B has no
 * second-floor room list at all, Trinity Village's Type B publishes no
 * per-room areas, and Victory A+'s first floor does not add up — its own
 * room areas total 235.93 against a stated 235.48. A screen that refused to
 * save until those resolved would be a screen nobody could use to record
 * what the developer actually published. So these are counts to show, not
 * conditions to pass.
 *
 * Pure, and tested as such: it takes the draft the workspace holds, not a
 * database row, so it can answer while the admin is still typing.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { Locale } from "@/i18n";

export type HealthFloor = {
  floorName: string;
  shortLabel: string;
  imageUrl: string;
  furnishedImageUrl?: string | null;
  areaSqm: number | null;
  /** True when a furnished image exists and its crop does not match the
   *  line drawing — computed upstream, since it needs both images' sizes. */
  furnishedAspectMismatch?: boolean;
  rooms: {
    names: Partial<Record<Locale, string>>;
    areaSqm: number | null;
    photoUrl?: string | null;
  }[];
};

export type FloorIssue =
  | { kind: "noPlan" }
  | { kind: "noRooms" }
  | { kind: "roomsWithoutPhoto"; count: number }
  | { kind: "roomsUntranslated"; count: number }
  | { kind: "furnishedAspect" }
  | { kind: "areaMismatch"; difference: number };

export type FloorHealth = {
  shortLabel: string;
  floorName: string;
  issues: FloorIssue[];
};

export type UnitTypeHealth = {
  floors: FloorHealth[];
  /** Every floor's issues flattened — what the list badge counts. */
  issueCount: number;
  /** Rooms named in some locales but not all, across the whole type. */
  untranslatedRooms: number;
};

/**
 * How far a floor's room areas may drift from its stated floor area before
 * it is worth mentioning.
 *
 * 0.6 m² rather than zero because the Sale Kits round each room to two
 * decimals and the totals do not always agree with the sum — see the header.
 * Tight enough to catch a room typed in wrong, loose enough not to flag
 * every floor in the catalogue.
 */
export const AREA_TOLERANCE_SQM = 0.6;

function named(name: string | undefined): boolean {
  return (name ?? "").trim() !== "";
}

/** Issues for one floor, in the order the UI lists them. */
export function floorHealth(floor: HealthFloor, locales: readonly Locale[]): FloorHealth {
  const issues: FloorIssue[] = [];

  if (floor.imageUrl.trim() === "") issues.push({ kind: "noPlan" });

  if (floor.rooms.length === 0) {
    issues.push({ kind: "noRooms" });
  } else {
    const withoutPhoto = floor.rooms.filter((room) => !room.photoUrl).length;
    if (withoutPhoto > 0) issues.push({ kind: "roomsWithoutPhoto", count: withoutPhoto });

    // Counted separately from "no photo" because they are different jobs
    // for different people — one is picking images, one is translating.
    const untranslated = floor.rooms.filter((room) =>
      locales.some((locale) => !named(room.names[locale])),
    ).length;
    if (untranslated > 0) issues.push({ kind: "roomsUntranslated", count: untranslated });
  }

  if (floor.furnishedImageUrl && floor.furnishedAspectMismatch) {
    issues.push({ kind: "furnishedAspect" });
  }

  /*
    Only when every room has an area. A floor where half the rooms are
    unmeasured always "differs" from its total, and reporting that as a
    mismatch would bury the real ones — Trinity Village's Type B second
    floor has names for thirteen rooms and areas for none.
  */
  const areas = floor.rooms.map((room) => room.areaSqm);
  if (floor.areaSqm !== null && areas.length > 0 && areas.every((a) => a !== null)) {
    const total = areas.reduce((sum: number, a) => sum + (a as number), 0);
    const difference = Math.abs(total - floor.areaSqm);

    if (difference > AREA_TOLERANCE_SQM) {
      issues.push({ kind: "areaMismatch", difference: Math.round(difference * 100) / 100 });
    }
  }

  return { shortLabel: floor.shortLabel, floorName: floor.floorName, issues };
}

export function unitTypeHealth(
  floors: HealthFloor[],
  locales: readonly Locale[],
): UnitTypeHealth {
  const perFloor = floors.map((floor) => floorHealth(floor, locales));

  return {
    floors: perFloor,
    issueCount: perFloor.reduce((sum, floor) => sum + floor.issues.length, 0),
    untranslatedRooms: perFloor.reduce(
      (sum, floor) =>
        sum +
        floor.issues.reduce(
          (inner, issue) => inner + (issue.kind === "roomsUntranslated" ? issue.count : 0),
          0,
        ),
      0,
    ),
  };
}
