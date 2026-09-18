/**
 * lib/milestones.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The "How we got here" photo timeline on the About page — see Milestone
 * in schema.prisma. No locale resolution here, unlike lib/awards.ts:
 * projectName and brand are proper nouns, the same one string in every
 * locale, so there is nothing to pick between.
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { safeQuery } from "@/lib/db";

export type Milestone = {
  id: string;
  year: number;
  projectName: string;
  brand: string | null;
  imageUrl: string | null;
};

const SELECT = {
  id: true,
  year: true,
  projectName: true,
  brand: true,
  imageUrl: true,
} as const;

/**
 * Active milestones, curated order. Sorted by year first so adjacent rows
 * sharing a year are adjacent in the result — the About page groups them
 * by exactly that adjacency to draw one underline per year rather than
 * one per row.
 */
export async function getMilestones(): Promise<Milestone[]> {
  return safeQuery(
    "milestone.findMany(active)",
    () =>
      prisma.milestone.findMany({
        where: { isActive: true },
        orderBy: [{ year: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
        select: SELECT,
      }),
    [] as Milestone[],
  );
}
