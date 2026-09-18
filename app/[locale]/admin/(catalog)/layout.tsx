/**
 * app/[locale]/admin/(catalog)/layout.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The Properties zone — projects, construction progress, e-brochures.
 *
 * `viewContent`, not a bare rank. VIEWER exists for someone who needs to
 * see the catalog — an owner, an auditor — without a reason to change it,
 * and until now every page in this zone turned them away at the door
 * before that reading could happen. See lib/permissions.ts's viewContent
 * row, restored to `true` for VIEWER in this same phase, now that a guard
 * actually consults it rather than the row describing access nothing
 * enforced.
 *
 * The capability, rather than requireAdmin(locale, Role.VIEWER), because
 * VIEWER is not the only thing below EDITOR on the rank ladder — SALES
 * sits between them, and a rank check alone would let a rep past this
 * gate too. lib/admin/nav.ts's ROLE_SETS.CONTENT already leaves SALES out
 * of this zone's menu; viewContent is `false` for SALES, so this is the
 * same decision enforced at the door rather than left to each page's own
 * EDITOR-minimum guard to catch on the way in.
 *
 * WHAT VIEWER GETS AND WHAT IT DOES NOT
 *
 * This layout only decides who may load the page. It says nothing about
 * whether the page then offers a Save button — that is each page's own
 * job, matched against its own server action's own guard, which still
 * requires EDITOR (or ADMIN, where a page always required more) exactly as
 * it did before this phase. See the `canWrite` checks added to the catalog
 * pages alongside this layout.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { ReactNode } from "react";
import { requireCapability } from "@/lib/admin/guard";

type Props = { children: ReactNode; params: Promise<{ locale: string }> };

export default async function AdminCatalogLayout({ children, params }: Props) {
  const { locale } = await params;
  await requireCapability(locale, "viewContent");

  return children;
}
