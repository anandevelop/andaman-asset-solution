/**
 * prisma/seed.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Phase 2 seed. Moves the Phase-1 hardcoded Trinity Village mock data into
 * the database so app/[locale]/projects/[slug] can render from Prisma.
 *
 * Run with:  npm run prisma:seed  (also runs automatically as the last step
 * of `npm run setup`, which is documented as "safe to re-run" — see
 * scripts/setup-db.sh).
 *
 * ── Safe to re-run means "won't crash", not "won't touch real content" ──
 * Every upsert below is keyed so re-running never *duplicates* a row, but
 * that alone isn't enough once the admin panel is the real source of truth
 * for a field: an upsert whose `update` branch re-asserts a seed value will
 * silently erase whatever an admin typed or uploaded there since, the next
 * time anyone runs `db seed` — including via `npm run setup`, which a
 * developer might re-run months after launch just to pick up a schema
 * change. This bit the project directly: Project's hero/gallery/concept
 * images and copy, ProjectProgress images, and ProjectUnitType/FloorPlan
 * were all being reset to their original placeholder values on every
 * re-seed, because every one of those fields is now editable from
 * /admin — a fact that postdates when this file was first written. The
 * fix throughout: an `update` branch either touches nothing (`{}`, for
 * fields the admin now fully owns) or is guarded by an existence check
 * (for the unit-type/floor-plan block, which used to unconditionally wipe
 * and recreate). Only a genuinely new row — one that doesn't exist yet —
 * gets the full seed data, via the `create` branch.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient, PropertyType, ProjectStatus } from "@prisma/client";

// ─────────────────────────────────────────────────────────────────────────
// RICH PROJECT CONTENT (Sale-Kit parity) — Phase 11.5
//
// Source data lives in prisma/seed-data/, copied verbatim from the Sale Kit
// extraction the project lead supplied (site-assets/). Read at runtime via
// fs rather than a static `import … from "*.json"`: these files are large
// (150+ individual units across three projects) and hand-transcribing them
// into TypeScript literals is exactly the kind of copy error this approach
// avoids — the numbers here are the numbers in the file, not a retype.
//
// Two source files, two different concerns, joined by `slug`:
//   content-seed-data.json         marketing copy, image asset paths, the
//                                  shared "About Us" blurb, the shared
//                                  nearby-attractions list.
//   units-and-types-seed-data.json unit types, individual unit numbers and
//                                  land areas, project-level numbers. Its
//                                  own header says to treat it as
//                                  authoritative over anything derived in
//                                  chat, which is honoured below for the
//                                  fields it covers.
//
// NO THAI TRANSLATION EXISTS in either source file for tagline, concept
// design, "about this project", special features, the company "About Us"
// blurb, or (for the two brand-new projects) the project name itself. Every
// Thai field below is therefore either left null — the site's existing
// pickLocale() falls back to the English text rather than rendering
// blank — or, for the one column that cannot be null (Project.nameTh),
// filled with the English name as an honest placeholder. Both are called
// out explicitly per project below and again in the seed's console output,
// so this does not get mistaken for a finished translation.
// ─────────────────────────────────────────────────────────────────────────

function readSeedJson<T>(filename: string): T {
  const filePath = path.join(__dirname, "seed-data", filename);
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

type ContentSeed = {
  sharedCompanyAboutUs: { en: string };
  nearbyAttractions: {
    categories: { category: string; items: { name: string; distanceKm: number; durationMin: number }[] }[];
  };
  projects: {
    slug: string;
    tagline: { en: string };
    conceptDesignEn: string;
    aboutThisProjectEn?: string;
    specialFeatures: { titleEn: string; detailEn: string }[];
    imageAssets: {
      hero: string;
      gallery: string[];
      sitePlan: string;
      floorPlansByType: Record<string, string[]>;
    };
  }[];
};

type UnitsSeed = {
  projects: {
    slug: string;
    nameEn: string;
    location: string;
    landAreaSqm: number;
    totalUnits: number;
    facilities: string[];
    unitTypes: {
      code: string;
      nameEn: string;
      sizeSqm: number;
      bedrooms: number;
      bathrooms?: number;
      restrooms?: number;
      bedroomNote?: string;
      floorBreakdown?: Record<string, number>;
      totalUnitsOfType: number;
    }[];
    units: { unitNumber: string; typeCode: string; landAreaSqm: number }[];
  }[];
};

const contentSeed = readSeedJson<ContentSeed>("content-seed-data.json");
const unitsSeed = readSeedJson<UnitsSeed>("units-and-types-seed-data.json");

/**
 * Sale Kit facility names → the lowercase i18n keys the site already uses
 * (messages/*.json `projects.facilities.*`, matched against
 * components/admin/… FACILITY_ICON on the public project page). A name not
 * in this map is stored as-is — the page falls back to a generic icon and
 * the raw string, same behaviour as any facility typed by hand in the
 * admin, rather than silently dropping it.
 */
const FACILITY_KEY_MAP: Record<string, string> = {
  Security: "security",
  Clubhouse: "clubhouse",
  "Common Pool": "pool",
  "Common Garden": "garden",
  "Co-working Space": "coworking",
  Fitness: "fitness",
  Reception: "reception",
  Restaurant: "restaurant",
  SPA: "spa",
  Lounge: "lounge",
  "Jogging Track": "joggingTrack",
};

const mapFacility = (raw: string) => FACILITY_KEY_MAP[raw] ?? raw;

/**
 * ProjectFacility (photo cards on the public page) display text per i18n
 * key — the exact same EN/TH pairs already shown via next-intl's
 * `projects.facilities.*` keys (messages/en.json / messages/th.json) and
 * the ones the ProjectFacility migration's SQL backfill used, kept in
 * sync by hand across all three since none of them can read the other two
 * at build/migrate time.
 */
const FACILITY_DISPLAY: Record<string, { en: string; th: string }> = {
  clubhouse: { en: "Clubhouse", th: "คลับเฮาส์" },
  fitness: { en: "Fitness Center", th: "ฟิตเนส" },
  security: { en: "24-hr Security", th: "รักษาความปลอดภัย 24 ชม." },
  pool: { en: "Communal Pool", th: "สระว่ายน้ำส่วนกลาง" },
  garden: { en: "Landscaped Garden", th: "สวนภูมิทัศน์" },
  concierge: { en: "Concierge", th: "บริการคอนเซียร์จ" },
  coworking: { en: "Co-working Space", th: "พื้นที่โคเวิร์กกิ้ง" },
  reception: { en: "Reception", th: "รีเซปชั่น" },
  restaurant: { en: "Restaurant", th: "ร้านอาหาร" },
  spa: { en: "Spa", th: "สปา" },
  lounge: { en: "Lounge", th: "เลานจ์" },
  joggingTrack: { en: "Jogging Track", th: "ลู่วิ่งจ็อกกิ้ง" },
};

/**
 * Placeholder photo per facility key, until an admin uploads a real one
 * via the S3 ImageUploader (see /admin/projects/[id]/facilities). These
 * deliberately reuse the exact same Unsplash URLs already seeded
 * elsewhere in this file for hero/gallery/progress images, rather than
 * untested new Unsplash ids — every one of these is already known to
 * resolve, because it is already rendering successfully somewhere else on
 * the site. The theme match is approximate (this is stock villa/lifestyle
 * photography, not a real photo of any specific clubhouse or gym), which
 * is the same trade-off richContentUpdateFields already makes for
 * conceptDesignImageUrl/aboutThisProjectImageUrl above.
 */
const FACILITY_IMAGE: Record<string, string> = {
  clubhouse: "https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=900&q=80",
  fitness: "https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=900&q=80",
  security: "https://images.unsplash.com/photo-1485230405346-71acb9518d9c?w=900&q=80",
  pool: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=900&q=80",
  garden: "https://images.unsplash.com/photo-1602343168117-bb8ffe3e2e9f?w=900&q=80",
  concierge: "https://images.unsplash.com/photo-1613977257363-707ba9348227?w=900&q=80",
  coworking: "https://images.unsplash.com/photo-1541888946425-d81bb19240f5?w=900&q=80",
  reception: "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=900&q=80",
  restaurant: "https://images.unsplash.com/photo-1486325212027-8081e485255e?w=900&q=80",
  spa: "https://images.unsplash.com/photo-1523294587484-bae6cc870010?w=900&q=80",
  lounge: "https://images.unsplash.com/photo-1541976590-713941681591?w=900&q=80",
  joggingTrack: "https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=900&q=80",
};

/** floorBreakdown key order → the label the Sale Kit prints under each plan. */
const FLOOR_LABELS: Record<string, string> = {
  groundFloor: "Ground Floor",
  firstFloor: "1st Floor",
  secondFloor: "2nd Floor",
  thirdFloor: "3rd Floor",
};

/** site-assets/{slug}/{hero|gallery}/foo.jpg → /gallery/{slug}/foo.jpg — see task #82. */
const galleryUrl = (slug: string, assetPath: string) =>
  `/gallery/${slug}/${path.basename(assetPath)}`;
const sitePlanUrl = (slug: string, assetPath: string) =>
  `/site-plans/${slug}/${path.basename(assetPath)}`;
const floorPlanUrl = (slug: string, assetPath: string) =>
  `/floor-plans/${slug}/${path.basename(assetPath)}`;

// ── Phase 4: one article and one event, so /news and /events render with
//    real content instead of an empty state on a fresh clone. ────────────

const ARTICLE = {
  slug: "buying-property-in-phuket-what-foreign-buyers-should-know",

  titleEn: "Buying property in Phuket: what foreign buyers should know",
  titleTh: "ซื้ออสังหาริมทรัพย์ในภูเก็ต: สิ่งที่ผู้ซื้อชาวต่างชาติควรรู้",

  excerptEn:
    "Freehold, leasehold and company structures explained — and which one actually fits how you intend to use the property.",
  excerptTh:
    "อธิบายความต่างระหว่างกรรมสิทธิ์แบบ freehold, leasehold และการถือผ่านบริษัท พร้อมแนวทางเลือกให้ตรงกับการใช้งานจริง",

  contentEn: `Thailand does not permit foreign nationals to own land outright. That single sentence is the root of nearly every question we are asked, and it is less restrictive than it first sounds.

## The three routes

**Freehold condominium.** Foreign buyers may own a condominium unit outright, provided that no more than 49% of the building's total floor area is in foreign hands. This is the cleanest structure available and requires no ongoing arrangement.

**Leasehold.** A registered lease of up to 30 years, renewable by agreement. Common for villas, and the route most of our buyers at Pasak take. The lease is registered at the Land Office and survives a sale of the underlying land.

**Thai company.** A properly operated Thai limited company may own land. This route carries real compliance obligations — annual filings, genuine Thai shareholding, audited accounts — and should never be treated as a paper formality.

## What actually matters

The right structure depends less on cost than on intent:

- Buying to live in for a decade or more, leasehold usually wins on simplicity.
- Buying to let, the tax treatment of rental income differs by structure and is worth modelling before you commit.
- Buying to pass on, succession rules differ sharply between a lease and a company holding.

> Take independent Thai legal advice before signing anything. Not from the developer's lawyer — from your own.

## Due diligence, briefly

Confirm the title deed (chanote is the strongest), check for encumbrances at the Land Office, verify that construction permits exist for what is actually being built, and read the servitude arrangements for access roads. On a small development these checks take days, not weeks.`,

  contentTh: `กฎหมายไทยไม่อนุญาตให้ชาวต่างชาติถือครองที่ดินโดยตรง ประโยคนี้คือที่มาของคำถามเกือบทั้งหมดที่เราได้รับ และในทางปฏิบัติมีข้อจำกัดน้อยกว่าที่หลายคนเข้าใจ

## ทางเลือกหลักสามแบบ

**คอนโดมิเนียมแบบ freehold** ชาวต่างชาติถือกรรมสิทธิ์ห้องชุดได้เต็มรูปแบบ โดยพื้นที่ที่ชาวต่างชาติถือครองรวมกันต้องไม่เกิน 49% ของพื้นที่อาคารทั้งหมด เป็นโครงสร้างที่ตรงไปตรงมาที่สุดและไม่ต้องดูแลต่อเนื่อง

**สิทธิการเช่าระยะยาว (leasehold)** จดทะเบียนเช่าได้สูงสุด 30 ปี และต่ออายุได้ตามข้อตกลง เป็นรูปแบบที่นิยมสำหรับบ้านเดี่ยวและวิลล่า และเป็นทางที่ผู้ซื้อส่วนใหญ่ในโครงการย่านพาซักเลือกใช้ สัญญาเช่าจดทะเบียนที่สำนักงานที่ดินและยังมีผลแม้ที่ดินเปลี่ยนมือ

**บริษัทไทย** บริษัทจำกัดที่ดำเนินกิจการจริงสามารถถือครองที่ดินได้ แต่มีภาระด้านการปฏิบัติตามกฎหมายที่แท้จริง ทั้งการยื่นงบการเงินประจำปี สัดส่วนผู้ถือหุ้นไทยที่มีตัวตนจริง และการตรวจสอบบัญชี ไม่ควรมองว่าเป็นเพียงพิธีการทางเอกสาร

## สิ่งที่ควรพิจารณาจริง ๆ

การเลือกโครงสร้างขึ้นอยู่กับวัตถุประสงค์มากกว่าค่าใช้จ่าย:

- ซื้อเพื่ออยู่อาศัยระยะยาวสิบปีขึ้นไป สิทธิการเช่ามักได้เปรียบเรื่องความเรียบง่าย
- ซื้อเพื่อปล่อยเช่า การจัดเก็บภาษีรายได้ค่าเช่าต่างกันตามโครงสร้าง ควรคำนวณให้ชัดก่อนตัดสินใจ
- ซื้อเพื่อส่งต่อให้ทายาท กฎเกณฑ์การรับมรดกระหว่างสิทธิการเช่ากับการถือผ่านบริษัทต่างกันมาก

> ควรปรึกษาที่ปรึกษากฎหมายไทยที่เป็นอิสระก่อนลงนามในเอกสารใด ๆ และควรเป็นทนายของท่านเอง ไม่ใช่ทนายของผู้พัฒนาโครงการ

## การตรวจสอบก่อนซื้อโดยสังเขป

ตรวจสอบประเภทโฉนด (โฉนดครุฑแดงมีความมั่นคงสูงสุด) ตรวจภาระผูกพันที่สำนักงานที่ดิน ยืนยันว่ามีใบอนุญาตก่อสร้างตรงกับสิ่งที่กำลังสร้างจริง และอ่านข้อตกลงภาระจำยอมเรื่องทางเข้าออก สำหรับโครงการขนาดเล็ก ขั้นตอนเหล่านี้ใช้เวลาไม่กี่วัน`,

  coverImageUrl:
    "https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=1600&q=80",
  category: "Guides",
  tags: ["ownership", "legal", "foreign buyers"],

  metaTitleEn: "Buying Property in Phuket — A Foreign Buyer's Guide to Ownership",
  metaTitleTh: "ซื้ออสังหาริมทรัพย์ในภูเก็ต — คู่มือกรรมสิทธิ์สำหรับผู้ซื้อต่างชาติ",
  metaDescriptionEn:
    "Freehold, leasehold or a Thai company? How foreign buyers can hold Phuket property, what each route costs in compliance, and the due diligence that matters.",
  metaDescriptionTh:
    "freehold, leasehold หรือถือผ่านบริษัทไทย? แนวทางการถือครองอสังหาริมทรัพย์ภูเก็ตสำหรับชาวต่างชาติ ภาระที่ตามมาของแต่ละทาง และการตรวจสอบที่ต้องทำ",

  isPublished: true,
};

const EVENT = {
  slug: "trinity-village-open-house-september-2026",

  titleEn: "Trinity Village open house",
  titleTh: "เปิดบ้าน ทรินิตี้ วิลเลจ",

  descriptionEn:
    "Walk the site with our project team while Phase A is topping out. You will see the pool shells poured, the clubhouse foundations set, and the sightlines between plots that drove the whole masterplan.\n\nRefreshments from 10:00. Wear shoes you do not mind getting dusty — this is an active construction site, and helmets are provided at the gate.",
  descriptionTh:
    "เดินชมพื้นที่โครงการพร้อมทีมงาน ในช่วงที่งานโครงสร้างเฟส A ใกล้แล้วเสร็จ ท่านจะได้เห็นโครงสร้างสระว่ายน้ำที่เทเสร็จแล้ว ฐานรากคลับเฮาส์ และระยะมองระหว่างแปลงซึ่งเป็นหัวใจของผังโครงการ\n\nมีอาหารว่างตั้งแต่เวลา 10:00 น. แนะนำให้สวมรองเท้าที่เปื้อนได้ เนื่องจากเป็นพื้นที่ก่อสร้างจริง และมีหมวกนิรภัยแจกที่ทางเข้า",

  location: "Trinity Village, Pasak 8, Cherngtalay, Phuket",
  coverImageUrl:
    "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1600&q=80",
  capacity: 40,
  isPublished: true,
};

const prisma = new PrismaClient();

// ── Trinity Village (was PROJECT const in the Phase-1 page) ──────────────
const TRINITY_VILLAGE = {
  slug: "trinity-village",

  nameEn: "Trinity Village",
  nameTh: "ทรินิตี้ วิลเลจ",

  taglineEn: "Pool villas set in quiet privacy, minutes from Pasak's coastline.",
  taglineTh: "พูลวิลล่าท่ามกลางความเป็นส่วนตัว ห่างจากชายฝั่งพาซักเพียงไม่กี่นาที",

  descriptionEn:
    "Set back from Pasak 8 on 26,230 sq.m. of gently sloped land, Trinity Village holds just 30 pool villas — each one planned so no two owners ever share a sightline. This is a project built for people who have already found luxury elsewhere, and are now looking for quiet.",
  descriptionTh:
    "ตั้งอยู่ลึกเข้ามาจากถนนพาซัก 8 บนพื้นที่ 26,230 ตร.ม. ทรินิตี้ วิลเลจ มีเพียง 30 พูลวิลล่า ออกแบบให้ไม่มีบ้านหลังใดมองเห็นกันโดยตรง โครงการนี้สร้างขึ้นสำหรับผู้ที่พบความหรูหราจากที่อื่นมาแล้ว และกำลังมองหาความเงียบสงบ",

  location: "Pasak 8, Cherngtalay, Phuket",
  propertyType: PropertyType.POOL_VILLA,
  status: ProjectStatus.UNDER_CONSTRUCTION,

  landAreaSqm: "26230.00",
  totalUnits: 30,
  priceFromTHB: "24900000.00",

  // Keys map to the `projects.facilities.*` i18n namespace; unknown keys
  // fall back to rendering the raw string.
  facilities: ["clubhouse", "fitness", "security"],

  heroImageUrl:
    "https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=1800&q=80",
  gallery: [
    "https://images.unsplash.com/photo-1602343168117-bb8ffe3e2e9f?w=1200&q=80",
    "https://images.unsplash.com/photo-1613977257363-707ba9348227?w=900&q=80",
    "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=900&q=80",
    "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=900&q=80",
  ],

  latitude: "8.019400",
  longitude: "98.298600",

  metaTitleEn: "Trinity Village — 30 Pool Villas at Pasak 8, Phuket",
  metaTitleTh: "ทรินิตี้ วิลเลจ — 30 พูลวิลล่า พาซัก 8 ภูเก็ต",
  metaDescriptionEn:
    "Thirty private pool villas on 26,230 sq.m. at Pasak 8, Cherngtalay. Clubhouse, fitness and 24-hour security. Register for a private viewing.",
  metaDescriptionTh:
    "พูลวิลล่าส่วนตัว 30 หลัง บนพื้นที่ 26,230 ตร.ม. พาซัก 8 เชิงทะเล พร้อมคลับเฮาส์ ฟิตเนส และรักษาความปลอดภัย 24 ชม. ลงทะเบียนนัดชมโครงการ",

  isPublished: true,
  sortOrder: 1,
};

// ── Monthly construction progress (was MOCK_MONTHS in ProgressGallery) ──
const PROGRESS_UPDATES = [
  {
    year: 2026,
    month: 6,
    images: [
      "https://images.unsplash.com/photo-1541976590-713941681591?w=800&q=80",
      "https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=800&q=80",
      "https://images.unsplash.com/photo-1590644365607-1c5a9e5d4d18?w=800&q=80",
    ],
    isPublished: true,
  },
  {
    year: 2026,
    month: 7,
    images: [
      "https://images.unsplash.com/photo-1541888946425-d81bb19240f5?w=800&q=80",
      "https://images.unsplash.com/photo-1486325212027-8081e485255e?w=800&q=80",
      "https://images.unsplash.com/photo-1523294587484-bae6cc870010?w=800&q=80",
    ],
    isPublished: true,
  },
  {
    year: 2026,
    month: 8,
    images: [
      "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&q=80",
      "https://images.unsplash.com/photo-1613977257363-707ba9348227?w=800&q=80",
      "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800&q=80",
    ],
    isPublished: true,
  },
];

// ── "Our Sales" team (shown only on /about and /contact) ─────────────────
//
// phoneNumber duplicates whatsappNumber for all three people below — a
// placeholder, not a confirmed second line, exactly like the migration's
// backfill for any row that predates this column. Correct it via
// /admin/sales-team the moment a person's real direct line differs.
// email is null for all three: no address was supplied for any of them.
const SALES_TEAM = [
  {
    nameEn: "Mr.Sunthorn A. (Nhong)",
    nameTh: "คุณสุนทร อ. (หนอง)",
    positionEn: "Sales Director",
    positionTh: "ผู้อำนวยการฝ่ายขาย",
    whatsappNumber: "+66989369542",
    phoneNumber: "+66989369542",
    email: null,
    sortOrder: 1,
  },
  {
    nameEn: "Mr.Ray B. (Ray)",
    nameTh: "คุณเรย์ บ. (เรย์)",
    positionEn: "Sales & Customer Support Executive",
    positionTh: "เจ้าหน้าที่ฝ่ายขายและบริการลูกค้า",
    whatsappNumber: "+66618190731",
    phoneNumber: "+66618190731",
    email: null,
    sortOrder: 2,
  },
  {
    nameEn: "Mr.Suwit P. (Vee)",
    nameTh: "คุณสุวิทย์ พ. (วี)",
    positionEn: "Sales Executive",
    positionTh: "เจ้าหน้าที่ฝ่ายขาย",
    whatsappNumber: "+66953089559",
    phoneNumber: "+66953089559",
    email: null,
    sortOrder: 3,
  },
  // photoUrl intentionally omitted — null until an admin uploads a real
  // photo via /admin/sales-team (S3 ImageUploader). The public section
  // falls back to an initial-letter avatar until then.
];

// ── Awards (home page) ────────────────────────────────────────────────────
//
// trophyImageUrl points at one of the two generic trophy graphics supplied
// (awards-trophy-images.zip has no per-award artwork, one per awarding
// body) rather than five distinct photos — every DotProperty award shares
// "dotproperty-trophy.png", the one PropertyGuru award uses
// "propertyguru-trophy.png". An admin can replace either with a real award
// photo later via /admin/awards.
const AWARDS = [
  {
    titleEn: "Best Breakthrough Developer",
    titleTh: "ผู้พัฒนาโครงการยอดเยี่ยม",
    organization: "PropertyGuru",
    projectName: null,
    year: 2021,
    trophyImageUrl: "/awards/propertyguru-trophy.png",
    sortOrder: 1,
  },
  {
    titleEn: "Best Development-Luxury Townhome",
    titleTh: "บ้านทาวน์โฮมหรูยอดเยี่ยม",
    organization: "DotProperty",
    projectName: "The Residence",
    year: 2021,
    trophyImageUrl: "/awards/dotproperty-trophy.png",
    sortOrder: 2,
  },
  {
    titleEn: "Breakthrough Developer",
    titleTh: "ผู้พัฒนาโครงการดาวรุ่ง",
    organization: "DotProperty",
    projectName: null,
    year: 2021,
    trophyImageUrl: "/awards/dotproperty-trophy.png",
    sortOrder: 3,
  },
  {
    titleEn: "Best Development-Urban Lifestyle",
    titleTh: "โครงการไลฟ์สไตล์เมืองยอดเยี่ยม",
    organization: "DotProperty",
    projectName: "The Residence",
    year: 2021,
    trophyImageUrl: "/awards/dotproperty-trophy.png",
    sortOrder: 4,
  },
  {
    titleEn: "Best Development-New Launch Villa",
    titleTh: "วิลล่าเปิดตัวใหม่ยอดเยี่ยม",
    organization: "DotProperty",
    projectName: "The Victory",
    year: 2021,
    trophyImageUrl: "/awards/dotproperty-trophy.png",
    sortOrder: 5,
  },
  // Present on the old site's /our-achievements/ page (Property Guru Thailand
  // Property Awards 2021 list) but missing from this array until now —
  // found while building the new Achievements page from that page's content.
  {
    titleEn: "Highly Commended of Best Club Facilities Design",
    titleTh: "รางวัลชมเชย การออกแบบสิ่งอำนวยความสะดวกส่วนกลางยอดเยี่ยม",
    organization: "PropertyGuru",
    projectName: "The Victory",
    year: 2021,
    trophyImageUrl: "/awards/propertyguru-trophy.png",
    sortOrder: 6,
  },
];

// ── Rich content merge (Sale-Kit parity): residence-prime, trinity-village,
//    victory. Joins content-seed-data.json (copy, images) with
//    units-and-types-seed-data.json (unit types, land areas) by slug. ──────

const RICH_PROJECTS = contentSeed.projects.map((content) => {
  const units = unitsSeed.projects.find((p) => p.slug === content.slug);
  if (!units) {
    throw new Error(
      `content-seed-data.json has a "${content.slug}" project with no matching entry in units-and-types-seed-data.json — cannot seed without both halves.`
    );
  }
  return { content, units };
});

/**
 * Fields sourced from the Sale Kit JSON that this phase owns and re-asserts
 * on every seed run: hero/gallery/site-plan images, facilities, concept
 * copy, area figures. Deliberately excludes the *Th columns — neither
 * source file has a Thai translation for any of these (see file header), so
 * they are left `undefined` here rather than forced to `null`, meaning a
 * real translation entered later via the admin survives a re-seed instead
 * of being wiped out.
 */
function richContentUpdateFields(
  content: ContentSeed["projects"][number],
  units: UnitsSeed["projects"][number]
) {
  // Illustrative images for the two narrative sections, drawn from the
  // same imageAssets.gallery list that already fills project.gallery
  // rather than any new asset — none of the Sale Kit extracts supplied
  // dedicated artwork for these two sections. gallery[0] is what the
  // Overview section on the project page uses as its lead image (see
  // `[overviewImage, ...villaImages] = project.gallery` there), so this
  // deliberately picks different indices — gallery[1] and the last
  // element — rather than the first, to avoid the same photo appearing
  // twice in the two most prominent slots on the page. The remaining
  // images (including these two) still also appear in the Gallery strip
  // further down the page; with only 4-8 photos per project there is no
  // pool large enough to keep every section's image fully exclusive.
  const gallery = content.imageAssets.gallery;
  const conceptDesignImageAsset = gallery[1] ?? gallery[0];
  const aboutThisProjectImageAsset = gallery[gallery.length - 1];

  return {
    taglineEn: content.tagline.en,
    conceptDesignEn: content.conceptDesignEn,
    aboutThisProjectEn: content.aboutThisProjectEn ?? null,
    conceptDesignImageUrl: galleryUrl(content.slug, conceptDesignImageAsset),
    // Only set alongside real "About This Project" copy — an image with
    // no section to sit next to would just be dead data on the row.
    aboutThisProjectImageUrl: content.aboutThisProjectEn
      ? galleryUrl(content.slug, aboutThisProjectImageAsset)
      : null,
    specialFeatures:
      content.specialFeatures.length > 0
        ? content.specialFeatures.map((f) => ({
            titleEn: f.titleEn,
            titleTh: null,
            detailEn: f.detailEn,
            detailTh: null,
          }))
        : null,
    location: units.location,
    landAreaSqm: units.landAreaSqm.toFixed(2),
    totalUnits: units.totalUnits,
    facilities: units.facilities.map(mapFacility),
    heroImageUrl: galleryUrl(content.slug, content.imageAssets.hero),
    gallery: content.imageAssets.gallery.map((g) => galleryUrl(content.slug, g)),
    masterPlanImageUrl: sitePlanUrl(content.slug, content.imageAssets.sitePlan),
  };
}

/**
 * Full row for a project this phase introduces for the first time
 * (residence-prime, victory — trinity-village already exists via
 * TRINITY_VILLAGE above and only ever takes the update-fields branch, so
 * its real nameEn/nameTh, description, price and lat/long are untouched).
 * nameTh has no source translation anywhere in either seed file; the
 * English name is used as an explicit, honest placeholder rather than left
 * blank, and the project is seeded unpublished until real Thai copy and a
 * photography review land — see the seed summary logged at the end of
 * main() for a standing reminder of this.
 */
function richContentCreateFields(
  content: ContentSeed["projects"][number],
  units: UnitsSeed["projects"][number],
  sortOrder: number
) {
  return {
    slug: content.slug,
    nameEn: units.nameEn,
    nameTh: units.nameEn, // placeholder — see comment above
    ...richContentUpdateFields(content, units),
    propertyType: PropertyType.POOL_VILLA,
    status: ProjectStatus.UPCOMING,
    isPublished: false,
    sortOrder,
  };
}

/**
 * Production guard.
 *
 * The seed writes a demo project, article and event. Those are fine in a
 * fresh clone and are exactly what must never appear on the live site —
 * and `npm run setup` runs the seed as its last step, so this is one
 * mistyped command away on a server, months after launch.
 *
 * Deliberately an opt-out rather than an opt-in: the check has to hold on
 * a machine where nobody remembered to set anything. ALLOW_PRODUCTION_SEED
 * exists for the one legitimate case — seeding a brand-new production
 * database before it has any real content.
 */
function assertNotProduction() {
  if (process.env.NODE_ENV !== "production") return;
  if (process.env.ALLOW_PRODUCTION_SEED === "true") {
    console.warn("⚠  Seeding a PRODUCTION database (ALLOW_PRODUCTION_SEED=true).");
    return;
  }

  console.error(
    "❌ Refusing to seed: NODE_ENV=production.\n" +
      "   This inserts demo content (a project, an article and an event).\n" +
      "   If the database is genuinely empty and you want it anyway, re-run\n" +
      "   with ALLOW_PRODUCTION_SEED=true.",
  );
  process.exit(1);
}

async function main() {
  assertNotProduction();

  console.log("🌱 Seeding Andaman Asset Solution…");

  // `update: {}` — every field in TRINITY_VILLAGE (name, tagline,
  // description, hero/gallery images, price, meta tags, isPublished…) is
  // editable via /admin/projects/[id] now. Re-asserting the whole object on
  // every re-seed used to silently revert any of that back to this
  // placeholder Sale Kit copy. Only a first-time `create` still needs the
  // full object — the seed's entire purpose for an already-existing row is
  // "make sure it exists," not "make sure it still looks like this."
  const project = await prisma.project.upsert({
    where: { slug: TRINITY_VILLAGE.slug },
    update: {},
    create: TRINITY_VILLAGE,
  });

  console.log(`  ✓ Project  ${project.slug} (${project.id})`);

  // Same reasoning as the project upsert above: a progress update's images/
  // title/summary/isPublished are all editable from the monthly progress
  // manager in /admin, so `update` must not re-assert the seed's version of
  // them — only `create` (a genuinely new month) gets the full object.
  for (const update of PROGRESS_UPDATES) {
    await prisma.projectProgress.upsert({
      where: {
        projectId_year_month: {
          projectId: project.id,
          year: update.year,
          month: update.month,
        },
      },
      update: {},
      create: { ...update, projectId: project.id },
    });
    console.log(`  ✓ Progress ${update.year}-${String(update.month).padStart(2, "0")}`);
  }

  // ── Rich project content (Sale-Kit parity) ──────────────────────────────
  //
  // Cast to `any` for this block only: the six models/columns below were
  // added to schema.prisma in this phase, but the sandbox this seed was
  // authored in cannot reach the network to run `prisma generate` (see the
  // long comment in lib/projects.ts), so the locally generated client's
  // types predate them. The SQL these calls emit is still exactly what a
  // properly generated client would produce — this only works around a
  // stale *type* declaration, not a schema mismatch. Safe to drop the cast
  // the moment `prisma generate` has been run against this schema.
  const db = prisma as any;

  // ── "Our Sales" team ─────────────────────────────────────────────────
  //
  // Upserted on whatsappNumber (the model's @@unique key) rather than
  // wiped-and-recreated: unlike ProjectUnitType/NearbyAttractionCategory,
  // an admin is expected to upload a real photoUrl, correct phoneNumber/
  // email once they're confirmed to differ from the WhatsApp number, and
  // adjust sortOrder for these three people almost immediately after this
  // first seed runs — a re-seed must not throw any of that work away.
  // `update` therefore only refreshes the four text fields this phase
  // owns (nameEn/Th, positionEn/Th) and never touches photoUrl, isActive,
  // sortOrder, phoneNumber or email.
  for (const person of SALES_TEAM) {
    const { whatsappNumber, nameEn, nameTh, positionEn, positionTh, ...rest } = person;
    await db.salesPerson.upsert({
      where: { whatsappNumber },
      update: { nameEn, nameTh, positionEn, positionTh },
      create: { whatsappNumber, nameEn, nameTh, positionEn, positionTh, ...rest },
    });
    console.log(`  ✓ SalesPerson ${nameEn}`);
  }

  // ── Awards ───────────────────────────────────────────────────────────
  //
  // Upserted on the (organization, titleEn, year) composite key rather
  // than wiped-and-recreated, same reasoning as SalesPerson: an admin is
  // expected to swap in a real trophy photo per award almost immediately,
  // and a re-seed must not throw that away. `update` only refreshes
  // titleTh and projectName — never trophyImageUrl, isActive or
  // sortOrder.
  for (const award of AWARDS) {
    const { organization, titleEn, year, titleTh, projectName, ...rest } = award;
    await db.award.upsert({
      where: { organization_titleEn_year: { organization, titleEn, year } },
      update: { titleTh, projectName },
      create: { organization, titleEn, year, titleTh, projectName, ...rest },
    });
    console.log(`  ✓ Award ${organization} — ${titleEn}`);
  }

  let richSortOrder = TRINITY_VILLAGE.sortOrder + 1;
  for (const { content, units } of RICH_PROJECTS) {
    const isNewProject = content.slug !== TRINITY_VILLAGE.slug;

    // `update: {}` — every field richContentUpdateFields() sets (hero/
    // gallery/site-plan images, concept design image + copy, "about this
    // project" image + copy, special features, facilities, location, land
    // area, unit count) is editable via /admin/projects/[id] now. A
    // re-seed must not re-assert any of it, for the same reason as the
    // TRINITY_VILLAGE upsert above — only a first-time `create` for a
    // genuinely new project still needs the full object.
    const richProject = await db.project.upsert({
      where: { slug: content.slug },
      update: {},
      create: richContentCreateFields(content, units, richSortOrder),
    });
    if (isNewProject) richSortOrder += 1;

    console.log(`  ✓ Project  ${richProject.slug} (${richProject.id}) [rich content]`);

    // Unit types + floor plans: used to be wiped and recreated every run.
    // That was true "no admin UI edits these independently of a re-seed
    // yet" only when this comment was first written — /admin/projects/[id]/
    // unit-types (UnitTypeForm) now lets an admin create brand-new types,
    // edit specs, and swap in real floor-plan photos, all of which a
    // deleteMany + recreate would throw away on the next `db seed`. Guarded
    // to first-seed-only: if the project already has any unit types, this
    // whole block is skipped and whatever's in the database stands.
    const typeIdByCode = new Map<string, string>();
    const existingTypeCount = await db.projectUnitType.count({
      where: { projectId: richProject.id },
    });

    if (existingTypeCount === 0) {
      for (const [index, type] of units.unitTypes.entries()) {
        const floorImages = content.imageAssets.floorPlansByType[type.code] ?? [];
        const floorKeys = Object.keys(type.floorBreakdown ?? {});
        const floorPlanCount = Math.min(
          floorImages.length,
          floorKeys.length || floorImages.length
        );

        const createdType = await db.projectUnitType.create({
          data: {
            projectId: richProject.id,
            name: type.nameEn,
            descriptionEn: type.bedroomNote ?? null,
            livingAreaSqm: type.sizeSqm.toFixed(2),
            bedrooms: type.bedrooms,
            bathrooms: type.bathrooms ?? null,
            restrooms: type.restrooms ?? null,
            totalUnits: type.totalUnitsOfType,
            coverImageUrl: floorImages[0]
              ? floorPlanUrl(content.slug, floorImages[0])
              : null,
            sortOrder: index,
            floorPlans: {
              create: Array.from({ length: floorPlanCount }, (_, i) => ({
                floorName: FLOOR_LABELS[floorKeys[i]] ?? `Floor ${i + 1}`,
                imageUrl: floorPlanUrl(content.slug, floorImages[i]),
                sortOrder: i,
              })),
            },
          },
        });
        typeIdByCode.set(type.code, createdType.id);
        console.log(
          `    ✓ UnitType ${richProject.slug}/${type.code} (${floorPlanCount} floor plan${
            floorPlanCount === 1 ? "" : "s"
          })`
        );
      }
    } else {
      // Already seeded (or admin-managed) — map the seed JSON's type codes
      // to whatever unit types actually exist now, purely so the
      // individual-unit upsert loop below can still relink units to a real
      // unitTypeId. Matched by name since that's the only field both sides
      // share; a type an admin has since renamed just won't match here,
      // and that unit's link is left alone rather than guessed at.
      const existingTypes = await db.projectUnitType.findMany({
        where: { projectId: richProject.id },
        select: { id: true, name: true },
      });
      const idByName = new Map<string, string>(
        existingTypes.map((t: { id: string; name: string }): [string, string] => [t.name, t.id]),
      );
      for (const type of units.unitTypes) {
        const id = idByName.get(type.nameEn);
        if (id) typeIdByCode.set(type.code, id);
      }
      console.log(
        `  ↳ Unit types already exist for ${richProject.slug} — skipped (admin-owned via /admin/projects/[id]/unit-types)`
      );
    }

    // Individual units: true upsert by (projectId, unitNumber) — a re-seed
    // must never clobber a status an admin has already set on a real unit,
    // so `update` only ever relinks the unit type and refreshes the land
    // area, and never touches `status`, `shapePoints`/`positionXPercent/Y`
    // or `adminNotes`.
    for (const unit of units.units) {
      const unitTypeId = typeIdByCode.get(unit.typeCode);

      // Only possible when unit types already existed under renamed types
      // (see the `else` branch above) and this particular unit doesn't
      // exist in the database yet — `unitTypeId` is a required column, so
      // rather than crash the whole seed run on one unresolvable link,
      // skip just this unit and say so.
      if (!unitTypeId) {
        const exists = await db.projectUnit.findUnique({
          where: {
            projectId_unitNumber: { projectId: richProject.id, unitNumber: unit.unitNumber },
          },
          select: { id: true },
        });
        if (!exists) {
          console.warn(
            `    ! Skipped unit ${unit.unitNumber} for ${richProject.slug} — no matching unit type "${unit.typeCode}" found (renamed since seeding?)`
          );
          continue;
        }
      }

      await db.projectUnit.upsert({
        where: {
          projectId_unitNumber: {
            projectId: richProject.id,
            unitNumber: unit.unitNumber,
          },
        },
        update: {
          unitTypeId,
          landAreaSqm: unit.landAreaSqm.toFixed(2),
        },
        create: {
          projectId: richProject.id,
          unitTypeId,
          unitNumber: unit.unitNumber,
          landAreaSqm: unit.landAreaSqm.toFixed(2),
        },
      });
    }
    console.log(`    ✓ Units    ${units.units.length} for ${richProject.slug}`);

    // Facility photo cards: upserted on the (projectId, nameEn) @@unique
    // key, same reasoning as SalesPerson/Award above — an admin is
    // expected to swap in a real photo per facility via
    // /admin/projects/[id]/facilities, so a re-seed must never clobber
    // that, or isActive/sortOrder. `update` only refreshes nameTh (the
    // one field this seed owns that could legitimately drift — nameEn is
    // the upsert key itself, so it never changes) and deliberately leaves
    // `imageUrl` alone here.
    //
    // imageUrl itself is filled in by the guarded updateMany just below,
    // not by this upsert's `update` branch — an early version set it only
    // in `create`, which meant a row already sitting at imageUrl: null
    // (e.g. one the ProjectFacility migration's SQL backfill created,
    // before this seed block existed) would stay null forever on every
    // future re-seed, since `upsert` only ever takes the `create` branch
    // once. The `imageUrl: null` clause in the updateMany's `where` is
    // exactly what makes this safe to run repeatedly: it only ever touches
    // a row that has never had a photo set, real or seeded, so an admin's
    // upload is never overwritten by a later `prisma db seed` run.
    const facilityKeys = units.facilities.map(mapFacility);
    for (const [index, key] of facilityKeys.entries()) {
      const display = FACILITY_DISPLAY[key] ?? { en: key, th: key };
      const imageUrl = FACILITY_IMAGE[key] ?? null;

      await db.projectFacility.upsert({
        where: {
          projectId_nameEn: { projectId: richProject.id, nameEn: display.en },
        },
        update: { nameTh: display.th },
        create: {
          projectId: richProject.id,
          nameEn: display.en,
          nameTh: display.th,
          imageUrl,
          sortOrder: index,
        },
      });

      if (imageUrl) {
        await db.projectFacility.updateMany({
          where: { projectId: richProject.id, nameEn: display.en, imageUrl: null },
          data: { imageUrl },
        });
      }
    }
    console.log(`    ✓ Facilities ${facilityKeys.length} for ${richProject.slug}`);
  }

  // ── One-off fix: broken "24-hr Security" placeholder ────────────────────
  //
  // The Unsplash id originally assigned to the "security" facility key
  // (see FACILITY_IMAGE.security above — a rotation used elsewhere in this
  // file for progress-gallery photos) turned out to render as a broken
  // image for this particular use. FACILITY_IMAGE.security has already
  // been repointed at a fresh, verified id, but the guarded updateMany in
  // the loop above only ever fills in a row sitting at `imageUrl: null` —
  // it will not touch a row that already has *some* value, broken or not,
  // since that's indistinguishable from an admin's real upload without
  // this extra step.
  //
  // Guarded on the exact old broken URL, not just on `nameEn`, so this:
  //  - only ever touches a row that still has that specific broken value
  //  - never re-fires (and never logs) once every affected row is fixed
  //  - never touches a row where an admin has since uploaded a real photo,
  //    since its imageUrl would no longer match the old broken string
  const BROKEN_SECURITY_IMAGE_URL =
    "https://images.unsplash.com/photo-1590644365607-1c5a9e5d4d18?w=900&q=80";
  const fixedSecurityImage = await db.projectFacility.updateMany({
    where: { nameEn: "24-hr Security", imageUrl: BROKEN_SECURITY_IMAGE_URL },
    data: { imageUrl: FACILITY_IMAGE.security },
  });
  if (fixedSecurityImage.count > 0) {
    console.log(
      `  ✓ Fixed broken "24-hr Security" image on ${fixedSecurityImage.count} project(s)`,
    );
  }

  // ── Nearby attractions ───────────────────────────────────────────────
  // No longer a database table — removed by client request (see
  // prisma/migrations/20260826020000_remove_nearby_attractions and
  // content/nearby-attractions.ts for why). contentSeed.nearbyAttractions
  // below is unused now; kept in content-seed-data.json as the original
  // Sale Kit extraction content/nearby-attractions.ts was transcribed from.

  // ── Company profile (singleton) ─────────────────────────────────────────
  // Never touches aboutUsTh beyond its implicit null default on first
  // create — an admin-entered Thai translation must survive a re-seed.
  await db.companyProfile.upsert({
    where: { id: "default" },
    update: { aboutUsEn: contentSeed.sharedCompanyAboutUs.en },
    create: { id: "default", aboutUsEn: contentSeed.sharedCompanyAboutUs.en },
  });
  console.log("  ✓ Company profile");

  console.log(
    "  ⚠ residence-prime and victory are seeded isPublished:false with " +
      "nameTh set to the English name as a placeholder — no Thai " +
      "translation exists yet in the source Sale Kit data for either " +
      "project's name, tagline, concept design, or special features."
  );

  // ── Phase 4: news + events ────────────────────────────────────────────

  // publishedAt is set on create only. Re-running the seed should not
  // silently republish an article the team has since taken down.
  const article = await prisma.newsArticle.upsert({
    where: { slug: ARTICLE.slug },
    update: ARTICLE,
    create: { ...ARTICLE, publishedAt: new Date() },
  });

  console.log(`  ✓ Article  ${article.slug}`);

  // Anchored 30 days out so a fresh clone always has a genuinely upcoming
  // event, rather than a hardcoded date that quietly goes stale.
  const startsAt = new Date();
  startsAt.setDate(startsAt.getDate() + 30);
  startsAt.setHours(10, 0, 0, 0);

  const endsAt = new Date(startsAt);
  endsAt.setHours(16, 0, 0, 0);

  const event = await prisma.event.upsert({
    where: { slug: EVENT.slug },
    update: EVENT,
    create: { ...EVENT, startsAt, endsAt },
  });

  console.log(`  ✓ Event    ${event.slug}`);

  console.log("🌱 Seed complete.");
}

main()
  .catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
