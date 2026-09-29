/**
 * components/unit-types/types.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The shape the project page hands the unit-types section.
 *
 * EVERY FIGURE ARRIVES FORMATTED, AND EVERY LABEL ARRIVES FINISHED
 *
 * Nothing here is a number waiting to be rendered or a template waiting to
 * have a value dropped into it. The section switches type and floor on the
 * client, so anything it had to format would have to be formatted there —
 * and the two ways of doing that are both mistakes this codebase has
 * already made.
 *
 * Formatting on the client means duplicating the locale's number rules
 * outside next-intl. Passing a template like "{n} floors" for the client to
 * `.replace()` is worse: next-intl formats eagerly, so `t()` has already
 * turned an unfilled placeholder into the key path by the time it is
 * handed over, and the screen prints `projects.unitTypesFloorsHint` —
 * exactly what /admin/analytics did with weekOverWeekHint.
 *
 * So the page formats one title and one subtitle per *type* up front. There
 * are two or three of them; the cost is nothing and the boundary stays
 * strings only.
 *
 * And no functions. A function in a Client Component's props is a server
 * render error, not a warning, and this area has taken three pages down
 * that way — see components/admin/SearchQueryViews.tsx's header.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { Rotation } from "./geometry";

export type ElevatorRoom = {
  id: string;
  name: string;
  /** Already formatted, e.g. "42.30". Null when the Sale Kit gave no area. */
  areaLabel: string | null;
  /** 0–100 against the *line* drawing, before any portrait rotation. */
  x: number;
  y: number;
  photoUrl: string | null;
};

export type ElevatorFloor = {
  id: string;
  name: string;
  /** What the lift button and the FLOOR display print. */
  shortLabel: string;
  /** The blueprint variant when one exists, else the plain line drawing. */
  imageUrl: string;
  /** width / height, so the box is reserved before the image arrives. */
  aspect: number;
  areaLabel: string | null;
  /** 0–1 against the largest floor of this type, for the area bar. */
  areaRatio: number;
  rotation: Rotation;
  rooms: ElevatorRoom[];
};

export type ElevatorType = {
  id: string;
  name: string;
  /** Sale Kit code — "A+", "R". Falls back to the name when unset. */
  code: string;
  bedrooms: string;
  bathrooms: string;
  totalAreaLabel: string | null;
  /** The chip's second line: "388.90 m² · 3 bed". */
  chipMeta: string;
  /** "Type A — ride through the house", finished. */
  title: string;
  /** "3 floors. Press a floor." — or the private-lift line. Finished. */
  subtitle: string;
  floors: ElevatorFloor[];
};

/** Every string the section shows that does not vary by type or floor. */
export type ElevatorLabels = {
  eyebrow: string;
  project: string;
  type: string;
  bed: string;
  bath: string;
  floor: string;
  areaThisFloor: string;
  areaByFloor: string;
  total: string;
  roomSchedule: string;
  sqm: string;
  showHomePhoto: string;
  previousRoom: string;
  nextRoom: string;
  close: string;
  /** Screen-reader name for the lift button group. */
  floorSelector: string;
};
