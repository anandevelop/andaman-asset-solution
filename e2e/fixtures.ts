/**
 * e2e/fixtures.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The data the end-to-end suite asserts against, and the shared helpers
 * that read it.
 *
 * Fixtures live here rather than in the seed script so a spec can import
 * the exact slug or price it is about to look for. A spec that hardcodes
 * "trinity-village" and a seed that writes "trinity-villas" fail with a
 * timeout and a screenshot of an empty page; sharing the constant makes it
 * a type error instead.
 * ─────────────────────────────────────────────────────────────────────────
 */

export const ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL ?? "e2e-admin@andaman.test",
  password: process.env.E2E_ADMIN_PASSWORD ?? "e2e-only-passphrase-1234",
  name: "E2E Administrator",
  /*
    The fixture is a SUPER_ADMIN, and SUPER_ADMIN accounts must have 2FA
    (lib/two-factor-policy.ts) — so the suite seeds an enrolled
    authenticator and generates real codes from this secret, rather than
    lowering the fixture's role to dodge the gate. A test account that skips
    the second factor would leave the enrolment gate itself untested, which
    is the part most likely to break silently.

    Base32, fixed, and worthless outside a throwaway database.
  */
  totpSecret: "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP",
} as const;

/*
  Four projects, chosen so the filter bar has something to do.

  ProjectFilterBar hides a whole row when fewer than two distinct values
  exist — so a single-project seed renders no property-type filter at all,
  and a spec written against it would pass by asserting on nothing. Two
  property types and two statuses is the minimum that exercises every
  control.
*/
export const PROJECTS = [
  {
    slug: "e2e-trinity-village",
    nameEn: "Trinity Village",
    nameTh: "ทรินิตี้ วิลเลจ",
    location: "Pasak 8, Cherngtalay, Phuket",
    propertyType: "POOL_VILLA",
    status: "UNDER_CONSTRUCTION",
    priceFromTHB: 24_500_000,
    totalUnits: 12,
  },
  {
    slug: "e2e-andaman-heights",
    nameEn: "Andaman Heights",
    nameTh: "อันดามัน ไฮทส์",
    location: "Kamala, Phuket",
    propertyType: "CONDOMINIUM",
    status: "READY_TO_MOVE_IN",
    priceFromTHB: 8_900_000,
    totalUnits: 64,
  },
  {
    slug: "e2e-layan-reserve",
    nameEn: "Layan Reserve",
    nameTh: "ลายัน รีเสิร์ฟ",
    location: "Layan Beach, Phuket",
    propertyType: "POOL_VILLA",
    status: "READY_TO_MOVE_IN",
    priceFromTHB: 62_000_000,
    totalUnits: 6,
  },
  {
    // Unpublished. Present so the listing has something it must NOT show —
    // a filter test that only ever counts visible cards cannot catch a
    // query that has quietly started returning drafts.
    slug: "e2e-secret-draft",
    nameEn: "Unreleased Development",
    nameTh: "โครงการที่ยังไม่เปิดตัว",
    location: "Undisclosed, Phuket",
    propertyType: "TOWNHOME",
    status: "UPCOMING",
    priceFromTHB: 5_000_000,
    totalUnits: 20,
    isPublished: false,
  },
] as const;

export const PUBLISHED_PROJECTS = PROJECTS.filter(
  (project) => (project as { isPublished?: boolean }).isPublished !== false,
);

export const DRAFT_PROJECT = PROJECTS.find(
  (project) => (project as { isPublished?: boolean }).isPublished === false,
)!;

/** The project detail page the lead-submission spec enquires about. */
export const LEAD_PROJECT = PROJECTS[0];
