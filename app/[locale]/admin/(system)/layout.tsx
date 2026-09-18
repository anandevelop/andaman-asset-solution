/**
 * app/[locale]/admin/(system)/layout.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The System zone — users, settings, activity.
 *
 * Role.ADMIN is the floor for the whole zone. Both narrower pages inside
 * it (users and activity, both SUPER_ADMIN and gated further by capability
 * — manageUsers, viewAuditLog) still carry their own guard on top of this
 * one: this layout is the zone's minimum, not any individual page's.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { ReactNode } from "react";
import { Role } from "@prisma/client";
import { requireAdmin } from "@/lib/admin/guard";

type Props = { children: ReactNode; params: Promise<{ locale: string }> };

export default async function AdminSystemLayout({ children, params }: Props) {
  const { locale } = await params;
  await requireAdmin(locale, Role.ADMIN);

  return children;
}
