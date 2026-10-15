import "server-only";

/**
 * lib/unit-types-3d-check.ts
 * ─────────────────────────────────────────────────────────────────────────
 * For the admin's unit-types tab: how many rooms of a type's 3D model find
 * their room in the admin — by the same English-name match the project
 * page uses (components/unit-types/match-room.ts), floor by floor (matched
 * on the floor's short label, as the page does). A room that does not
 * match still shows in 3D, under the model's English name, so this is the
 * number of rooms a Thai, Chinese or Russian visitor sees in their own
 * language.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { hasModel3d, loadModel3d, model3dKeyFor } from "@/components/unit-types/model3d";
import { matchRoom } from "@/components/unit-types/match-room";

export type Model3dCheck = { matched: number; total: number };

type FloorRooms = { shortLabel: string; rooms: { matchName: string }[] };

export async function checkModel3dRooms(
  projectSlug: string,
  typeCode: string | null,
  floors: FloorRooms[],
): Promise<Model3dCheck | null> {
  if (!typeCode || !hasModel3d(projectSlug, typeCode)) return null;
  const project = await loadModel3d(projectSlug);
  const type = project?.types.find((candidate) => candidate.key === model3dKeyFor(projectSlug, typeCode));
  if (!type) return null;

  let matched = 0;
  let total = 0;
  type.floors.forEach((floor, index) => {
    const admin =
      floors.find((candidate) => candidate.shortLabel.trim().toLowerCase() === floor.short.toLowerCase()) ??
      floors[index];
    for (const room of floor.rooms) {
      total += 1;
      if (admin && matchRoom(room.name, admin.rooms)) matched += 1;
    }
  });
  return { matched, total };
}
