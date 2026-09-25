import "server-only";

/**
 * lib/company-stats.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The four figures in the home page's Vision & Mission block.
 *
 * THREE OF THEM ARE COUNTED, AND THAT IS THE POINT
 *
 * They used to be four free-text fields an admin typed at
 * /admin/pages/about/story — "10+ awards", "30+ projects" — and
 * components/VisionMission.tsx carried a warning about it: the awards
 * figure was independent of the awards actually recorded, so a visitor
 * could read "10+" here and count six in the awards strip further down the
 * same page. Counting them removes the class of problem rather than asking
 * somebody to remember to reconcile two numbers by hand.
 *
 * Each figure is counted from the thing its own label names:
 *
 *  · Projects delivered → Milestone rows. Each is one completed project
 *    with a year and a name; the milestones scroller on /about renders the
 *    same rows, so the number and the list cannot disagree.
 *  · Awards → Award rows, the same ones the awards section shows.
 *  · Villas under construction → ProjectUnit rows belonging to a published
 *    project whose status is UNDER_CONSTRUCTION. Not every unit on the
 *    site: "in build now" means the ones being built now, and counting
 *    finished and upcoming developments into it would make the label a
 *    lie in a way nobody would ever notice.
 *
 * The founding year is the exception and is stored on CompanyProfile,
 * because there is nothing in this database to count it from. It returns
 * null until somebody sets it, and the tile is left out rather than
 * showing a plausible year nobody chose.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { ProjectStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { safeQuery } from "@/lib/db";

export type CompanyStats = {
  /** Null until an administrator sets it — see the header. */
  foundedYear: number | null;
  projectsDelivered: number;
  awards: number;
  villasUnderConstruction: number;
};

const EMPTY: CompanyStats = {
  foundedYear: null,
  projectsDelivered: 0,
  awards: 0,
  villasUnderConstruction: 0,
};

export async function getCompanyStats(): Promise<CompanyStats> {
  return safeQuery(
    "company:stats",
    async () => {
      const [profile, projectsDelivered, awards, villasUnderConstruction] = await Promise.all([
        prisma.companyProfile.findUnique({
          where: { id: "default" },
          select: { foundedYear: true },
        }),
        prisma.milestone.count({ where: { isActive: true } }),
        prisma.award.count({ where: { isActive: true } }),
        prisma.projectUnit.count({
          where: {
            project: {
              isPublished: true,
              deletedAt: null,
              status: ProjectStatus.UNDER_CONSTRUCTION,
            },
          },
        }),
      ]);

      return {
        foundedYear: profile?.foundedYear ?? null,
        projectsDelivered,
        awards,
        villasUnderConstruction,
      };
    },
    EMPTY,
  );
}
