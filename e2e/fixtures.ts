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

/**
 * Interchangeable copies of ADMIN, one per full sign-in the suite performs.
 *
 * They exist to make the suite fast, and the reason is worth stating
 * because it looks like duplication.
 *
 * A TOTP code is valid for one 30-second step, and lib/two-factor.ts burns
 * the step once a code is accepted — replay protection, and correct. Every
 * test that signed in therefore had to wait out the rest of the current
 * step before the next one could sign in, because they all shared one
 * account: eleven sign-ins at 25 to 31 seconds each, five of the suite's
 * five and a half minutes spent waiting for a clock.
 *
 * `totpLastStep` is per account. Handing each sign-in its own removes the
 * wait without touching the protection — nothing is disabled, and the test
 * that checks a code cannot be replayed still shares one account with
 * itself on purpose.
 *
 * The shared secret is deliberate: it keeps code generation to one line,
 * and the secret is not what these accounts are testing. Their separateness
 * is in the row, which is where the burned step lives.
 */
export const ADMIN_POOL: ReadonlyArray<{
  email: string;
  password: string;
  name: string;
  totpSecret: string;
}> = Array.from({ length: 12 }, (_, index) => ({
  email: `e2e-admin-${index + 1}@andaman.test`,
  password: ADMIN.password,
  name: `E2E Administrator ${index + 1}`,
  totpSecret: ADMIN.totpSecret,
}));

/**
 * An ADMIN who has signed in but never enrolled a second factor.
 *
 * lib/two-factor-policy.ts requires 2FA of this role, so the account is
 * held in `twoFactorPending` — able to authenticate, able to reach nothing
 * but the enrolment page. It exists to prove that the gate holds on the
 * paths middleware cannot see: a stolen password on its own has to be
 * worth nothing, and /api/uploads/presign was where it was worth a bucket.
 *
 * Deliberately no totpSecret. Seeding one would put it the wrong side of
 * the gate this fixture is for.
 */
export const PENDING_ADMIN = {
  email: "e2e-pending@andaman.test",
  password: "e2e-only-passphrase-5678",
  name: "E2E Pending Administrator",
} as const;

/**
 * A read-only account — Phase 4's VIEWER access, proven end to end.
 *
 * lib/two-factor-policy.ts's EXEMPT_ROLES is empty, so VIEWER owes a second
 * factor exactly like every other role; this fixture is enrolled up front
 * with the same shared secret as ADMIN for the reason given on it above —
 * the secret is not what these accounts are testing.
 */
export const VIEWER = {
  email: "e2e-viewer@andaman.test",
  password: "e2e-only-passphrase-9012",
  name: "E2E Viewer",
  totpSecret: ADMIN.totpSecret,
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

/*
  The e-brochure the flipbook spec reads.

  `fileUrl` is a same-origin path that does not exist on disk on purpose —
  the spec fulfils it with e2e/fixtures/sample-pdf.ts through page.route().
  Serving the bytes from the test rather than from public/ is what makes
  the failure cases testable: an aborted route is exactly the 50MB-brochure
  -on-bad-hotel-wifi case, and there is no other way to produce it on
  demand.

  Same origin so the fetch is covered by connect-src 'self' and needs no
  CORS rule from a bucket the suite does not talk to.
*/
/**
 * One image in the media library.
 *
 * components/admin/InsertImageModal.tsx picks from the library and has no
 * manual-URL escape hatch, so without a row here the news editor's image
 * flow cannot be driven at all — and uploading in a test would mean a real
 * PUT to Spaces. `/icon-192.png` is a file the app already serves, so the
 * tile renders a real image rather than a broken one, and the alt text is
 * pre-filled so the modal's Insert button is enabled on selection.
 */
export const MEDIA = {
  url: "/icon-192.png",
  fileName: "icon-192.png",
  mimeType: "image/png",
  width: 192,
  height: 192,
  sizeBytes: 4096,
  altText: { en: "E2E library image", th: "", zh: "", ru: "" },
  tags: ["e2e"],
} as const;

export const E_BROCHURE = {
  slug: "e2e-trinity-brochure",
  fileUrl: "/e2e-fixtures/trinity.pdf",
  title: {
    en: "Trinity Village Brochure",
    th: "โบรชัวร์ ทรินิตี้ วิลเลจ",
    zh: "Trinity Village 手册",
    ru: "Брошюра Trinity Village",
  },
  description: {
    en: "Seeded by e2e/global-setup.ts. Not real inventory.",
    th: "ข้อมูลทดสอบ ไม่ใช่โครงการจริง",
    zh: "测试数据，非真实项目。",
    ru: "Тестовые данные, не реальный проект.",
  },
} as const;

/** Unpublished, so the index has something it must NOT list. */
export const DRAFT_BROCHURE = {
  slug: "e2e-draft-brochure",
  fileUrl: "/e2e-fixtures/draft.pdf",
  title: "Unreleased Brochure",
} as const;
