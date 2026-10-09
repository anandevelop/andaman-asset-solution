/**
 * lib/club/portal.ts — everything a signed-in resident's screens read.
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import { currentCard } from "./cards";

export async function getResidentContext(residentId: string) {
  const resident = await prisma.resident.findUnique({
    where: { id: residentId },
    include: {
      members: { orderBy: { createdAt: "asc" } },
      unit: { include: { project: { select: { id: true, cardCode: true, nameEn: true, nameTh: true } } } },
    },
  });
  if (!resident) return null;
  const card = await currentCard(residentId);
  return { resident, unit: resident.unit, project: resident.unit.project, card };
}

export function projectName(project: { nameEn: string; nameTh: string }, locale: string): string {
  return (locale === "th" ? project.nameTh : project.nameEn) || project.nameEn;
}
