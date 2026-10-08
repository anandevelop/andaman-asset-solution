/**
 * scripts/seed-club-partners.ts
 * ─────────────────────────────────────────────────────────────────────────
 * ANDAMAN CLUB: the starting partner list (the mockup's PARTNERS array),
 * enabled for the three club projects found by Project.cardCode (rp, tv,
 * vc). Idempotent by partner name: an existing partner is left as the
 * admin edited it — only missing project links are added.
 *
 *   npx tsx --env-file=.env scripts/seed-club-partners.ts
 * ─────────────────────────────────────────────────────────────────────────
 */
import { PrismaClient } from "@prisma/client";
import { pgAdapter } from "../lib/prisma-adapter";

const prisma = new PrismaClient({ adapter: pgAdapter() });

type Seed = {
  category: "hosp" | "dine" | "beach" | "spa" | "act";
  name: string;
  area: string;
  phones?: string[];
  contactName?: string;
  emails?: string[];
  website?: string;
  pct?: number;
  note?: string;
  notes?: { en: string; zh: string; ru: string };
  validFrom?: string;
  validTo?: string;
};

const PARTNERS: Seed[] = [
  { category: "hosp", name: "Bangkok Hospital Phuket", area: "Phuket Town", phones: ["076 254 425"], contactName: "คุณเตย", emails: ["info.phuket@bangkokhospital.com", "natthanicha.tr@bangkokhospital.com"], website: "https://www.bangkokhospital.com/en/phuket" },
  { category: "hosp", name: "Bangkok Hospital Siriroj", area: "Phuket Town", phones: ["076 361 888"], website: "https://www.bangkokhospital.com/en/siriroj" },
  { category: "hosp", name: "Bumrungrad Referral Office", area: "Phuket", phones: ["02 011 5689"], emails: ["andaman@bumrungrad.com"], website: "https://www.bumrungrad.com" },
  { category: "hosp", name: "Dibuk Hospital", area: "Phuket Town", phones: ["076 298 298"] },
  {
    category: "dine", name: "AIM Lounge", area: "Phuket", phones: ["082 412 1359"], emails: ["info@aimloungethailand.com"],
    pct: 20, note: "ค่าอาหาร", notes: { en: "on food", zh: "餐饮", ru: "на еду" }, validFrom: "2026-01-01", validTo: "2026-10-20",
  },
  { category: "dine", name: "Suay Restaurant", area: "Cherngtalay", phones: ["061 172 3959", "093 339 1890"], emails: ["cheftammasak@gmail.com"], website: "https://suayrestaurant.com", pct: 10, validTo: "2026-12-31" },
  { category: "dine", name: "L'Arôme by the Sea", area: "Kalim / Patong", phones: ["065 239 2111", "076 346 271"], emails: ["information@laromegroup.com"], website: "https://en.laromegroup.com/laromebythesea" },
  { category: "dine", name: "Age Restaurant", area: "Anantara Layan", phones: ["076 317 200"], emails: ["age.alay@anantara.com"], website: "https://www.agerestaurant.com/contact-us/" },
  { category: "dine", name: "Nitan Phuket", area: "Thalang", phones: ["098 459 9250"], emails: ["info@nitanphuket.com"], website: "https://www.nitanphuket.com" },
  { category: "dine", name: "Dinner in the Sky", area: "Karon", phones: ["099 089 1384"], emails: ["info@dinnerintheskyphuket.com"], website: "https://dinnerintheskyphuket.com/contact/" },
  { category: "beach", name: "Nomad Beach Club", area: "Bang Tao", phones: ["061 753 9396"], emails: ["bookings@nomadbeachclubphuket.com"], website: "https://www.nomadbeachclubphuket.com" },
  { category: "beach", name: "Carpe Diem Beach Club", area: "Bang Tao", phones: ["065 058 5388"], emails: ["inquiries@carpediemphuket.com"], website: "https://carpediemphuket.com" },
  { category: "beach", name: "Yona Beach Club", area: "Floating · Patong Bay", phones: ["02 430 4400"] },
  { category: "spa", name: "Niyama Spa & Wellness", area: "Cherngtalay", phones: ["084 354 1680"], emails: ["niyamaspawellness@gmail.com"], website: "https://www.niyamaphuket.com/about" },
  { category: "spa", name: "Ayurah Spa & Wellness", area: "Aleenta", phones: ["076 580 339"], emails: ["eservation@akaryn.com"], website: "https://www.aleenta.com/huahin/contact/" },
  { category: "spa", name: "DIVANA SPA", area: "Phuket" },
  { category: "act", name: "Blue Canyon Country Club", area: "Mai Khao", phones: ["076 328 088", "065 350 1722"], contactName: "Sales 065 350 1722", emails: ["sales@bluecanyonphuket.com"], website: "https://www.bluecanyonphuket.com" },
  { category: "act", name: "Laguna Golf Phuket", area: "Bang Tao", phones: ["083 550 6683"], emails: ["golf@lagunaphuket.com"], website: "https://www.lagunagolfphuket.com" },
  { category: "act", name: "AIM Charters · Boat Trip", area: "Phuket", phones: ["063 398 2865"], emails: ["aimcharters@gmail.com"], website: "https://aimcharters.com", pct: 20, validFrom: "2025-11-01", validTo: "2026-09-20" },
];

const day = (value?: string) => (value ? new Date(`${value}T00:00:00.000Z`) : null);

async function main() {
  const projects = await prisma.project.findMany({
    where: { cardCode: { in: ["rp", "tv", "vc"] } },
    select: { id: true, cardCode: true },
  });
  const found = new Set(projects.map((project) => project.cardCode));
  for (const code of ["rp", "tv", "vc"]) {
    if (!found.has(code)) console.warn(`! No project has cardCode "${code}" — skipped. Set Project.cardCode and re-run.`);
  }
  if (!projects.length) console.warn("! Partners will be created without projects; residents will not see them until projects are linked.");

  let created = 0;
  let existing = 0;
  for (const [index, seed] of PARTNERS.entries()) {
    let partner = await prisma.partner.findFirst({ where: { name: seed.name }, select: { id: true } });
    if (partner) {
      existing += 1;
    } else {
      partner = await prisma.partner.create({
        data: {
          name: seed.name,
          category: seed.category,
          area: seed.area,
          phones: seed.phones ?? [],
          contactName: seed.contactName ?? null,
          emails: seed.emails ?? [],
          website: seed.website ?? null,
          discountPct: seed.pct ?? null,
          discountNote: seed.note ?? null,
          validFrom: day(seed.validFrom),
          validTo: day(seed.validTo),
          sortOrder: index,
          isActive: true,
          translations: seed.notes
            ? { create: Object.entries(seed.notes).map(([locale, discountNote]) => ({ locale, discountNote })) }
            : undefined,
        },
        select: { id: true },
      });
      created += 1;
    }
    if (projects.length) {
      await prisma.partnerProject.createMany({
        data: projects.map((project) => ({ partnerId: partner.id, projectId: project.id })),
        skipDuplicates: true,
      });
    }
  }
  console.log(`Partners: ${created} created, ${existing} already there · projects linked: ${[...found].join(", ") || "none"}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
