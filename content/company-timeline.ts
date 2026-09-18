/**
 * content/company-timeline.ts
 * ─────────────────────────────────────────────────────────────────────────
 * COMPANY_FOUNDED_YEAR (2005) is the single source of truth for the About
 * page's "years of experience" stat, a project page mini-stat ("since
 * {year}"), and formerly the starting point drawn on the About page's
 * "Milestones" timeline — previously a separate, inconsistent constant
 * (2019) with no real basis. Update this one value if the founding year is
 * ever corrected; every reader of it updates with it.
 *
 * The timeline itself (project history, one photo per entry) moved to the
 * database — see the Milestone model in schema.prisma, lib/milestones.ts,
 * and /admin/milestones — so it can be managed without a code change. This
 * file used to also export the static array that seeded it; that array now
 * lives only as literal data in prisma/seed.ts, which is the one place it
 * still needs to exist as code.
 * ─────────────────────────────────────────────────────────────────────────
 */

export const COMPANY_FOUNDED_YEAR = 2005;
