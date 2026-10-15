/**
 * components/unit-types/model3d/types.ts — the plan data shape the 3D scene
 * builds from. Coordinates are brochure-image pixels; see ./index.ts.
 */

// Plan data is written in brochure-image pixels. Each type maps pixels → metres with `scale`,
// centred on `ext` (the bounding box of the 1st/ground-floor plate).

export type Rect = [number, number, number, number]; // x1, y1, x2, y2 (px)
export type Seg = [number, number, number, number]; // wall from (x1,y1) to (x2,y2) (px)
export type RoomKind = 'in' | 'out' | 'park' | 'green' | 'pool';

export interface RoomDef {
  n: number;
  name: string;
  sqm: number;
  r: Rect[];
  k: RoomKind;
  /** label position (px); defaults to the centre of the first rect */
  lab?: [number, number];
}

/** Drawing helpers handed to each floor's `build` for furniture and fit-out. */
export interface BuildHelpers {
  /** box furniture: x1,y1,x2,y2 in px, bottom/top in metres */
  F(x1: number, y1: number, x2: number, y2: number, bottom: number, top: number): void;
  /** elliptical cylinder (tubs, round tables): centre px, radii m, bottom/top m */
  cyl(x: number, y: number, rx: number, rz: number, bottom: number, top: number): void;
  car(x1: number, y1: number, x2: number, y2: number): void;
  /** straight stair rising one storey from xa to xb between y1..y2 */
  stair(xa: number, xb: number, y1: number, y2: number, steps?: number): void;
  /** plan-symbol tree, radius in metres */
  tree(x: number, y: number, r: number): void;
  /** Type R: U-stair around the lift core */
  ustair(): void;
  /** Type R: lift shaft (cab = draw the car) */
  lift(cab: boolean): void;
}

export interface FloorDef {
  name: string;
  short: string;
  area: number;
  rooms: RoomDef[];
  walls?: Seg[];
  glass?: Seg[];
  /** low balustrades / pool edges */
  rails?: Seg[];
  /** unnumbered floor plates (decks, roofs, stair cores) */
  slabs?: Rect[];
  /** double-height voids, drawn as a dashed cross */
  voids?: Rect[];
  /** lawn strips */
  greens?: Rect[];
  /** when this plate was cropped/scaled differently from the 1st-floor plate */
  map?: { s: number; from: [number, number]; to: [number, number] };
  build?: (h: BuildHelpers) => void;
}

export interface TypeDef {
  key: string;
  name: string;
  /** small line under the type name on the tab */
  tab?: string;
  approx?: number;
  bed: number;
  bath: number;
  total: number;
  scale: number;
  ext: Rect;
  floors: FloorDef[];
}

export interface ProjectDef {
  id: string;
  name: string;
  floorsNote: string;
  types: TypeDef[];
}

export type ViewName = 'overview' | 'plan' | 'street';
export const WALL_MODES = ['Full', 'Cutaway', 'Off'] as const;
export type WallMode = (typeof WALL_MODES)[number];
