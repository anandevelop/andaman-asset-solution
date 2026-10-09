/**
 * lib/agents/guard.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Who may use the co-agent admin pages. Server-only.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { requireAdmin, requireAdminAction, type AdminSession } from "@/lib/admin/guard";

/** The CRM roles (lib/admin/nav.ts ROLE_SETS.CRM). Rank alone would admit
 *  EDITOR, which outranks SALES but has no business in resident data. */
const AGENTS_ROLES: ReadonlySet<Role> = new Set([Role.SUPER_ADMIN, Role.ADMIN, Role.SALES]);

export function isAgentsRole(role: Role): boolean {
  return AGENTS_ROLES.has(role);
}

export async function requireAgentsAdmin(locale: string): Promise<AdminSession> {
  const session = await requireAdmin(locale, Role.SALES);
  if (!isAgentsRole(session.role)) redirect(`/${locale}/admin?denied=1`);
  return session;
}

export async function requireAgentsAction(minimum: Role = Role.SALES): Promise<AdminSession> {
  const session = await requireAdminAction(minimum);
  if (!isAgentsRole(session.role)) throw new Error("UNAUTHORISED");
  return session;
}
