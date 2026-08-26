/**
 * content/nearby-attractions.ts
 * ─────────────────────────────────────────────────────────────────────────
 * "Nearby Attractions" section on every project page — schools, beaches,
 * golf/activity spots and lifestyle amenities, with distance/drive time
 * from the development.
 *
 * Previously a full admin-editable feature (NearbyAttractionCategory/Item
 * models + a "shared default, project-overridable" fallback in
 * lib/projects.ts). Removed by client request once it became clear the
 * override capability was never used: all 3 launched projects (Residence
 * Prime, Trinity Village, The Victory) render the exact same list from the
 * Sale Kit extraction, and the admin UI for editing the shared default was
 * silently pointless anyway — prisma/seed.ts wiped and recreated that table
 * on every seed run, so an edit made through the admin never survived a
 * re-seed. A ~790-line CRUD (own admin nav item, 4-language translation
 * tabs, drag-free reorder) maintaining a list that never actually changed
 * wasn't worth keeping. If a future project legitimately needs a different
 * list (e.g. a development far enough from Cherngtalay that these schools
 * and beaches stop being relevant), that's a one-line code edit here, not
 * a data-entry task — see COMPANY_TIMELINE and PRIVACY_POLICY_* for the
 * same "code-owned, developer-edited" convention already used elsewhere on
 * this site for content that only ever changes when a developer is already
 * involved.
 *
 * Source data (place names, distances, drive times): Sale Kit PDF extraction,
 * prisma/seed-data/content-seed-data.json → nearbyAttractions. That file's
 * own note flags the same list appearing verbatim in all 3 Sale Kits.
 *
 * Two categories are both labelled "Lifestyle" in the Sale Kit source
 * (shopping/dining vs. airport/hospital/mall/old town) — kept as-is here
 * rather than silently renamed, since that's how every project page has
 * displayed this section since launch; renaming it would be a content
 * change, not a backend removal.
 *
 * Place names (schools, beaches, golf clubs, malls) are proper nouns, kept
 * in English only — same convention as project names in
 * content/company-timeline.ts. Only the 5 category labels are translated.
 */

import type { Locale } from "@/i18n";

export type NearbyAttractionItem = {
  name: string;
  distanceKm: number;
  durationMin: number;
};

export type NearbyAttractionCategory = {
  /** Stable, human-readable id — used as the React key, not shown in the UI. */
  id: string;
  categoryName: Record<Locale, string>;
  items: NearbyAttractionItem[];
};

const CATEGORIES: NearbyAttractionCategory[] = [
  {
    id: "international-school",
    categoryName: {
      en: "International School",
      th: "โรงเรียนนานาชาติ",
      zh: "国际学校",
      ru: "Международная школа",
    },
    items: [
      { name: "Kajonkiet Cherngtalay School", distanceKm: 3, durationMin: 6 },
      { name: "HeadStart International School", distanceKm: 6, durationMin: 10 },
      { name: "HEI Schools Phuket", distanceKm: 8, durationMin: 12 },
      { name: "UWC School", distanceKm: 10, durationMin: 21 },
      { name: "British International School", distanceKm: 12, durationMin: 24 },
    ],
  },
  {
    id: "beach",
    categoryName: {
      en: "Beach",
      th: "ชายหาด",
      zh: "海滩",
      ru: "Пляж",
    },
    items: [
      { name: "Layan Beach", distanceKm: 7, durationMin: 14 },
      { name: "Bangtao Beach", distanceKm: 7, durationMin: 14 },
      { name: "Surin Beach", distanceKm: 7, durationMin: 14 },
      { name: "Maikao Beach", distanceKm: 22, durationMin: 30 },
    ],
  },
  {
    id: "activity",
    categoryName: {
      en: "Activity",
      th: "กิจกรรม",
      zh: "休闲活动",
      ru: "Активный отдых",
    },
    items: [
      { name: "Blue Tree", distanceKm: 6, durationMin: 10 },
      { name: "Laguna Golf Club", distanceKm: 7, durationMin: 16 },
      { name: "Thanyapura Sport Complex", distanceKm: 11, durationMin: 23 },
      { name: "Blue Canyon Golf Club", distanceKm: 15, durationMin: 25 },
      { name: "Red Mountain Golf Club", distanceKm: 22, durationMin: 33 },
    ],
  },
  {
    id: "lifestyle-shopping",
    categoryName: {
      en: "Lifestyle",
      th: "ไลฟ์สไตล์",
      zh: "生活方式",
      ru: "Стиль жизни",
    },
    items: [
      { name: "Porto de Phuket", distanceKm: 4, durationMin: 9 },
      { name: "Boat Avenue", distanceKm: 4, durationMin: 9 },
      { name: "Robinson Lifestyle Phuket", distanceKm: 7, durationMin: 10 },
      { name: "Cafe del Mar", distanceKm: 10, durationMin: 17 },
    ],
  },
  {
    id: "lifestyle-infrastructure",
    categoryName: {
      en: "Lifestyle",
      th: "ไลฟ์สไตล์",
      zh: "生活方式",
      ru: "Стиль жизни",
    },
    items: [
      { name: "Phuket International Airport", distanceKm: 15, durationMin: 24 },
      { name: "Bangkok Hospital Phuket", distanceKm: 18, durationMin: 25 },
      { name: "Central Festival", distanceKm: 19, durationMin: 28 },
      { name: "Phuket Old Town", distanceKm: 20, durationMin: 34 },
    ],
  },
];

export function getNearbyAttractionCategories(locale: string): {
  id: string;
  categoryName: string;
  sortOrder: number;
  items: { id: string; name: string; distanceKm: number; durationMin: number }[];
}[] {
  const l = (locale in CATEGORIES[0].categoryName ? locale : "en") as Locale;

  return CATEGORIES.map((cat, sortOrder) => ({
    id: cat.id,
    categoryName: cat.categoryName[l],
    sortOrder,
    items: cat.items.map((item, index) => ({
      id: `${cat.id}-${index}`,
      name: item.name,
      distanceKm: item.distanceKm,
      durationMin: item.durationMin,
    })),
  }));
}
