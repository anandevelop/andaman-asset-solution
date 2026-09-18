/**
 * app/[locale]/admin/(content)/layout.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The Website Content zone — the Pages hub, news, events, media,
 * publishing.
 *
 * `viewContent`, for the same reason as (catalog)/layout.tsx next door: a
 * bare Role.VIEWER rank check would also admit SALES (it outranks VIEWER),
 * which lib/admin/nav.ts's ROLE_SETS.CONTENT already excludes from this
 * zone's menu on purpose — the capability enforces that exclusion at the
 * door instead of leaving it to each page's own EDITOR-minimum guard.
 *
 * events/[id]/registrations stays out of this loosening on its own
 * account — it guards with requireCapability("viewCustomerContact")
 * rather than viewContent, because a registration list is personal data
 * in the same way a lead is, not because this layout treats it specially.
 * VIEWER's viewContent grant does not reach viewCustomerContact — see
 * lib/permissions.ts — so it is refused there regardless of this layout's
 * floor.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { ReactNode } from "react";
import { requireCapability } from "@/lib/admin/guard";

type Props = { children: ReactNode; params: Promise<{ locale: string }> };

export default async function AdminContentLayout({ children, params }: Props) {
  const { locale } = await params;
  await requireCapability(locale, "viewContent");

  return children;
}
