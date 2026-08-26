/**
 * lib/admin/guard.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Server-side authorisation for admin pages and server actions.
 *
 * middleware.ts already blocks anonymous requests, but middleware is a
 * routing concern — it does not protect a server action invoked directly.
 * Every action and page therefore re-checks here. Defence in depth: the
 * middleware is for UX (redirect to login), this is for security.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { Role } from "@prisma/client";
import { authOptions, hasRole } from "@/lib/auth";

export type AdminSession = {
  id: string;
  name: string;
  email: string;
  role: Role;
};

/**
 * Require an authenticated admin user. Redirects to the localised login
 * page when there is no session, so it is safe to call at the top of any
 * admin page component.
 */
export async function requireAdmin(
  locale: string,
  minimum: Role = Role.EDITOR,
): Promise<AdminSession> {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect(`/${locale}/login`);
  }

  if (!hasRole(session.user.role, minimum)) {
    redirect(`/${locale}/admin?denied=1`);
  }

  return {
    id: session.user.id,
    name: session.user.name ?? session.user.email ?? "",
    email: session.user.email ?? "",
    role: session.user.role,
  };
}

/**
 * Same check for server actions, but throws instead of redirecting — an
 * action should fail loudly rather than silently navigating.
 */
export async function requireAdminAction(
  minimum: Role = Role.EDITOR,
): Promise<AdminSession> {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id || !hasRole(session.user.role, minimum)) {
    throw new Error("UNAUTHORISED");
  }

  return {
    id: session.user.id,
    name: session.user.name ?? session.user.email ?? "",
    email: session.user.email ?? "",
    role: session.user.role,
  };
}
