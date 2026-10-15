/**
 * components/unit-types/model3d/index.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The 3D house models behind the unit-types section's "3D" view.
 *
 * Each project's plans are traced from its brochure floor plans (pixel
 * coordinates turned into metres — see ./types.ts and the data files), and
 * the scene (./scene.ts) builds walls, rooms and fit-out from them with
 * three.js. Room areas come from the brochure tables; wall positions are
 * read off the images, so they are close, not CAD-exact.
 *
 * MODEL_3D_TYPES is the cheap, synchronous answer to "does this type have a
 * model?" — the page and the admin ask it without loading three.js or the
 * plan data. Keys are project slugs, values the types' Sale Kit codes
 * (ProjectUnitType.code), which is also each model's `key`.
 *
 * loadModel3d pulls a project's plans in only when somebody opens 3D.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { ProjectDef } from "./types";
import { model3dKey, model3dKeyFor } from "./key";

export { model3dKey, model3dKeyFor };

export const MODEL_3D_TYPES: Readonly<Record<string, readonly string[]>> = {
  "residence-prime": ["R"],
  "trinity-village": ["A", "V"],
  victory: ["A", "A+", "B"],
};

export function hasModel3d(projectSlug: string, typeCode: string | null | undefined): boolean {
  const key = model3dKeyFor(projectSlug, typeCode);
  return Boolean(key && MODEL_3D_TYPES[projectSlug]?.includes(key));
}

export async function loadModel3d(projectSlug: string): Promise<ProjectDef | null> {
  switch (projectSlug) {
    case "residence-prime":
      return (await import("./data/residence-prime")).default;
    case "trinity-village":
      return (await import("./data/trinity-village")).default;
    case "victory":
      return (await import("./data/victory")).default;
    default:
      return null;
  }
}
