/**
 * app/[locale]/admin/(club)/layout.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The ANDAMAN CLUB zone — residents and their cards, partners, co-agents.
 * A route group, so URLs stay /admin/residents, /admin/partners.
 *
 * Role.SALES is the floor: sales record transfers and hand cards over.
 * Pages and actions narrow from here (ADMIN for reissue, resale, the QR
 * ZIP; SUPER_ADMIN for approving per-house benefit changes) and each one
 * repeats its own guard — a layout guard does not protect a server action.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { ReactNode } from "react";
import { Role } from "@prisma/client";
import { requireAdmin } from "@/lib/admin/guard";

type Props = { children: ReactNode; params: Promise<{ locale: string }> };

export default async function AdminClubLayout({ children, params }: Props) {
  const { locale } = await params;
  await requireAdmin(locale, Role.SALES);

  return children;
}
