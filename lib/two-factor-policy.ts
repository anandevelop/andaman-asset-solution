/**
 * lib/two-factor-policy.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Who must use 2FA — and nothing else.
 *
 * Its own module because middleware.ts runs on the edge runtime and answers
 * this question on every admin navigation. Importing it from lib/totp.ts
 * would drag node:crypto, bcryptjs and the Prisma enum into the edge bundle
 * for the sake of one comparison. Zero imports here, one source of truth
 * shared by the edge gate, the server guards and the session callback.
 * ─────────────────────────────────────────────────────────────────────────
 */

/**
 * Roles allowed to work without a second factor.
 *
 * Empty, deliberately. The line used to sit between ADMIN and EDITOR, on
 * the reasoning that only ADMIN and SUPER_ADMIN "can read every lead's
 * contact details" — but that was never true of the code. /admin/leads
 * requires nothing above EDITOR and lists name, email and phone a hundred
 * rows at a time with filters, and the RSVP roster on an event's edit page
 * does the same for attendees. So the role the policy exempted had exactly
 * the access the policy existed to protect. The export at
 * /api/admin/leads/export is correctly ADMIN-only, which made the gap
 * easier to miss: the bulk door was locked and the one beside it was not.
 *
 * Keeping this as a list rather than `return true` leaves the decision
 * visible and reversible — an exemption has to be written down here, where
 * the reasoning for it is, instead of being buried in a boolean.
 */
const EXEMPT_ROLES: readonly string[] = [];

/**
 * Note the fail-closed shape: a signed-in account whose role claim has gone
 * missing is not in the list either, so it is held at enrolment rather than
 * waved through. Every caller already guards on there being a session at
 * all, so this cannot strand an anonymous visitor.
 */
export function roleRequiresTwoFactor(role: string | null | undefined): boolean {
  return !EXEMPT_ROLES.includes(role ?? "");
}
