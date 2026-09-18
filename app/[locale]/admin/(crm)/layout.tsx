/**
 * app/[locale]/admin/(crm)/layout.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The CRM zone — leads, appointments, sales team, the mobile shell.
 *
 * A route group, so the URL is unaffected: `/admin/leads` is still
 * `/admin/leads`, not `/admin/(crm)/leads` — Next drops any segment
 * wrapped in parentheses when building the path. What the group buys is a
 * layout that wraps every page in it, which is where this guard now lives
 * instead of being copied into each one.
 *
 * Role.SALES, not `viewAllLeads` — this is the safety-net floor, not the
 * zone's real requirement. Three of the four pages here (leads,
 * appointments, the mobile shell) need the stricter `viewAllLeads`
 * capability check, because EDITOR outranks SALES on the rank ladder but
 * must not read a customer's phone number — "at least this rank" is the
 * wrong question for them, and lib/permissions.ts's header explains the gap
 * in full. But the fourth, sales-team, is deliberately looser: the roster
 * is published on the website, so a content editor edits it, which is
 * exactly the EDITOR access `viewAllLeads` would have refused at this
 * door before any of those pages' own guards ran. Role.SALES is the actual
 * loosest requirement across all four; each page's own guard below narrows
 * from there to what that specific page needs.
 *
 * DEFENCE IN DEPTH, NOT A REPLACEMENT
 *
 * Every page below still calls its own guard — sales-team/page.tsx has
 * Role.SALES because that rank is genuinely its own minimum, not because
 * it is narrower than the rest of the zone; leads/[id]/page.tsx repeats
 * requireCapability for the same reason lib/admin/guard.ts's own header
 * gives: a layout guard is a routing-time convenience, not the thing a
 * server action can be trusted to have passed through. Removing either
 * guard would leave the other carrying weight it was never sized for.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { ReactNode } from "react";
import { Role } from "@prisma/client";
import { requireAdmin } from "@/lib/admin/guard";

type Props = { children: ReactNode; params: Promise<{ locale: string }> };

export default async function AdminCrmLayout({ children, params }: Props) {
  const { locale } = await params;
  await requireAdmin(locale, Role.SALES);

  return children;
}
