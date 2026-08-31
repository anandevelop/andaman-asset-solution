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
 * ADMIN and SUPER_ADMIN can read every lead's contact details and create
 * users; EDITOR can publish content, which is reversible. The line is drawn
 * at "can this account leak the customer database or mint another admin".
 */
export function roleRequiresTwoFactor(role: string | null | undefined): boolean {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}
