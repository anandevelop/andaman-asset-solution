/**
 * content/company-timeline.ts
 * ─────────────────────────────────────────────────────────────────────────
 * COMPANY_FOUNDED_YEAR is only the fallback now. The founding year is set
 * in the admin (Pages › About › Our story › Year founded,
 * CompanyProfile.foundedYear), and the About stats, the About timeline and
 * the project pages' "Since {year}" all read that first. This constant is
 * what they show on a database with no company profile yet.
 *
 * It was 2005, which was never the founding year: the company was founded
 * in 2021, and the project pages and the timeline printed 2005 straight
 * from here even after the admin field said 2021 (corrected 2026-10-27).
 *
 * The timeline itself (project history, one photo per entry) moved to the
 * database — see the Milestone model in schema.prisma, lib/milestones.ts,
 * and /admin/milestones — so it can be managed without a code change. This
 * file used to also export the static array that seeded it; that array now
 * lives only as literal data in prisma/seed.ts, which is the one place it
 * still needs to exist as code.
 * ─────────────────────────────────────────────────────────────────────────
 */

export const COMPANY_FOUNDED_YEAR = 2021;
