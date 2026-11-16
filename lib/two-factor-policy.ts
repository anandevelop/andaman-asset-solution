/**
 * lib/two-factor-policy.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Who must use 2FA — by role, and the one per-account exception a super
 * admin can grant (twoFactorExempt, for a bot that signs in unattended).
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

/**
 * Roles that can never be excused, whatever the switch on the account says.
 *
 * A super admin creates accounts and hands out roles — and flips this very
 * switch — so an exempt super admin would be a password-only way to exempt
 * everybody else.
 */
const NEVER_EXEMPT_ROLES: readonly string[] = ["SUPER_ADMIN"];

/** May this role be excused from the second factor at all? */
export function roleMayBeExempt(role: string | null | undefined): boolean {
  return Boolean(role) && !NEVER_EXEMPT_ROLES.includes(role as string);
}

/**
 * Is this one account excused? The stored switch, checked against the role
 * every time it is read — so promoting an exempt account to super admin
 * ends the exemption even if the column was left set.
 */
export function isExemptFromTwoFactor(account: {
  role?: string | null;
  twoFactorExempt?: boolean | null;
}): boolean {
  return account.twoFactorExempt === true && roleMayBeExempt(account.role);
}

/**
 * "Signed in, but owes 2FA setup": the role requires it, none is enrolled,
 * and the account has not been excused. The one definition the session
 * callback, the edge gate and the account page share.
 */
export function owesTwoFactorSetup(account: {
  role?: string | null;
  twoFactorEnabled?: boolean | null;
  twoFactorExempt?: boolean | null;
}): boolean {
  return roleRequiresTwoFactor(account.role) && !account.twoFactorEnabled && !isExemptFromTwoFactor(account);
}
