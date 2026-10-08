/**
 * lib/club/portal.ts — everything a signed-in resident's screens read.
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import { compareForPortal, effectivePct, formatDiscount, isWithinValidity, partnerValidity } from "./benefits";
import { currentCard } from "./cards";

export type PortalPartner = {
  id: string;
  name: string;
  category: string;
  area: string | null;
  pct: number | null;
  /** Localised, e.g. "ลด 20% ค่าอาหาร"; null = coming soon. */
  label: string | null;
  note: string | null;
  validTo: Date | null;
  coverImage: string | null;
  phones: string[];
  emails: string[];
  website: string | null;
  contactName: string | null;
  sortOrder: number;
};

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

/** Partners this house can see: active, enabled for its project, in date, not hidden for it. */
export async function getResidentPartners(unitId: string, projectId: string, locale: string): Promise<PortalPartner[]> {
  const [partners, overrides] = await Promise.all([
    prisma.partner.findMany({
      where: { isActive: true, projects: { some: { projectId } } },
      include: { translations: { where: { locale } } },
    }),
    prisma.partnerUnitOverride.findMany({ where: { unitId } }),
  ]);
  const byPartner = new Map(overrides.map((o) => [o.partnerId, o]));
  const now = new Date();
  return partners
    .filter((p) => isWithinValidity(partnerValidity(p.validFrom, p.validTo, now)))
    .filter((p) => !byPartner.get(p.id)?.hidden)
    .map((p) => {
      const pct = effectivePct(p.discountPct, byPartner.get(p.id)?.discountPct);
      const note = p.translations[0]?.discountNote || (locale === "th" ? p.discountNote : null) || p.discountNote;
      return {
        id: p.id,
        name: p.name,
        category: p.category,
        area: p.area,
        pct,
        note,
        label: formatDiscount(pct, note, locale),
        validTo: p.validTo,
        coverImage: p.coverImage,
        phones: p.phones,
        emails: p.emails,
        website: p.website,
        contactName: p.contactName,
        sortOrder: p.sortOrder,
      };
    })
    .sort(compareForPortal);
}

export function projectName(project: { nameEn: string; nameTh: string }, locale: string): string {
  return (locale === "th" ? project.nameTh : project.nameEn) || project.nameEn;
}
