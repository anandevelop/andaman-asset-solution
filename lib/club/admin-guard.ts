/**
 * lib/club/admin-guard.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Who may use the ANDAMAN CLUB admin pages (residents, agents). Server-only.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { requireAdmin, requireAdminAction, type AdminSession } from "@/lib/admin/guard";

/** The CRM roles (lib/admin/nav.ts ROLE_SETS.CRM). Rank alone would admit
 *  EDITOR, which outranks SALES but has no business in resident data. */
const CLUB_ROLES: ReadonlySet<Role> = new Set([Role.SUPER_ADMIN, Role.ADMIN, Role.SALES]);

export function isClubRole(role: Role): boolean {
  return CLUB_ROLES.has(role);
}

export async function requireClubAdmin(locale: string): Promise<AdminSession> {
  const session = await requireAdmin(locale, Role.SALES);
  if (!isClubRole(session.role)) redirect(`/${locale}/admin?denied=1`);
  return session;
}

export async function requireClubAction(minimum: Role = Role.SALES): Promise<AdminSession> {
  const session = await requireAdminAction(minimum);
  if (!isClubRole(session.role)) throw new Error("UNAUTHORISED");
  return session;
}
