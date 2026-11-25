/**
 * app/[locale]/admin/(company)/layout.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The company-as-employer zone: job applications and open positions.
 *
 * A capability, not a rank. HR sits at the bottom of the rank ladder
 * (lib/role-rank.ts) so that nothing else in the back office admits it,
 * and ADMIN sits near the top but must not read a CV — "at least this
 * role" answers neither. manageCareers is held by SUPER_ADMIN and HR only.
 *
 * Every page and action below repeats the check; see (crm)/layout.tsx for
 * why a layout guard is never the only one.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { ReactNode } from "react";
import { requireCapability } from "@/lib/admin/guard";

type Props = { children: ReactNode; params: Promise<{ locale: string }> };

export default async function AdminCompanyLayout({ children, params }: Props) {
  const { locale } = await params;
  await requireCapability(locale, "manageCareers");

  return children;
}
