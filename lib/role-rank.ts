/**
 * lib/role-rank.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The role hierarchy, and nothing else — zero imports, on purpose.
 *
 * Split out of lib/auth.ts (which pulls in next-auth, bcryptjs and the
 * credentials provider) for the same reason lib/two-factor-policy.ts is
 * its own module: this comparison is needed from contexts that cannot
 * afford lib/auth.ts's weight — components/admin/AdminSidebar.tsx (a
 * client component filtering nav items by role) chief among them. Pulling
 * bcryptjs into a client bundle would not just bloat it; several of
 * lib/auth.ts's transitive imports are Node-only and do not build for the
 * browser at all.
 *
 * lib/auth.ts re-exports `hasRole` from here, so existing server-side
 * imports of it from "@/lib/auth" keep working unchanged.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { Role } from "@prisma/client";

/**
 * Role hierarchy — higher number grants everything below it, for pages
 * gated with `requireAdmin(locale, minimum)`/`requireAdminAction(minimum)`
 * and for nav items filtered by the same minimum in AdminSidebar.
 *
 * VIEWER sits at the bottom (read-only everywhere it can reach at all) and
 * SALES sits just above it, deliberately below EDITOR rather than beside
 * it: every existing content-management guard (`Role.EDITOR` minimum, the
 * default) must keep excluding SALES without every one of those call
 * sites having to change. SALES pages (leads, appointments, sales team)
 * instead pass `Role.SALES` explicitly as their minimum — see
 * lib/admin/guard.ts's callers in app/[locale]/admin/leads and
 * app/[locale]/admin/appointments.
 *
 * Rank alone cannot express "SALES may use the CRM but not edit content"
 * — a strictly-ordered ladder only ever grants everything below a
 * threshold. The leads/appointments pages additionally scope SALES to
 * rows assigned to them (see app/[locale]/admin/leads/actions.ts), which
 * is the part rank cannot do at all.
 */
const ROLE_RANK: Record<Role, number> = {
  VIEWER: 0,
  SALES: 1,
  EDITOR: 2,
  ADMIN: 3,
  SUPER_ADMIN: 4,
};

export function hasRole(role: Role | undefined | null, minimum: Role): boolean {
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}
