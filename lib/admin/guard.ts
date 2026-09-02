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
import { setAuditActor } from "@/lib/audit/context";

export type AdminSession = {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** Role requires 2FA and none is enrolled yet. */
  twoFactorPending: boolean;
};

/**
 * Escape hatch for the 2FA setup page and its actions — the one place an
 * account that still owes enrolment is allowed to do work. Everything else
 * stays closed to it, so a stolen password alone cannot reach the leads
 * table during the window between a reset and re-enrolment.
 */
type GuardOptions = { allowTwoFactorSetup?: boolean };

/**
 * Attribute this request's database writes to the signed-in user.
 *
 * Called after every check has passed, never before: a request that is
 * about to be redirected or thrown out has not done anything worth
 * recording, and marking it first would attribute writes to an actor whose
 * authorisation had not been established.
 */
function markActor(user: {
  id: string;
  email?: string | null;
  role: Role;
}): void {
  setAuditActor({
    id: user.id,
    email: user.email ?? "",
    role: user.role,
  });
}

/**
 * Require an authenticated admin user. Redirects to the localised login
 * page when there is no session, so it is safe to call at the top of any
 * admin page component.
 */
export async function requireAdmin(
  locale: string,
  minimum: Role = Role.EDITOR,
  { allowTwoFactorSetup = false }: GuardOptions = {},
): Promise<AdminSession> {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect(`/${locale}/login`);
  }

  if (!hasRole(session.user.role, minimum)) {
    redirect(`/${locale}/admin?denied=1`);
  }

  if (session.user.twoFactorPending && !allowTwoFactorSetup) {
    redirect(`/${locale}/admin/account/security?setup=1`);
  }

  /*
    From here on, anything this request writes is this person's doing.

    Set on the page guard as well as the action guard because a page can
    write — the 2FA setup page mints a secret, and a future one may do more
    — and an unattributed change is exactly what the trail exists to
    prevent. See lib/audit/context.ts.
  */
  markActor(session.user);

  return {
    id: session.user.id,
    name: session.user.name ?? session.user.email ?? "",
    email: session.user.email ?? "",
    role: session.user.role,
    twoFactorPending: session.user.twoFactorPending,
  };
}

/**
 * Same check for server actions, but throws instead of redirecting — an
 * action should fail loudly rather than silently navigating.
 */
export async function requireAdminAction(
  minimum: Role = Role.EDITOR,
  { allowTwoFactorSetup = false }: GuardOptions = {},
): Promise<AdminSession> {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id || !hasRole(session.user.role, minimum)) {
    throw new Error("UNAUTHORISED");
  }

  // Middleware cannot see a server action, so the enrolment gate has to be
  // repeated here or a pending account could still mutate data by posting
  // straight at an action.
  if (session.user.twoFactorPending && !allowTwoFactorSetup) {
    throw new Error("TWO_FACTOR_SETUP_REQUIRED");
  }

  markActor(session.user);

  return {
    id: session.user.id,
    name: session.user.name ?? session.user.email ?? "",
    email: session.user.email ?? "",
    role: session.user.role,
    twoFactorPending: session.user.twoFactorPending,
  };
}
