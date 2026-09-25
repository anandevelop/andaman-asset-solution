/**
 * app/[locale]/admin/(content)/pages/home/sections/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The order list is the Home tab itself now, not a tab beside three
 * editors — see ../page.tsx for what replaced this and why. Kept as a
 * route so the address survives; next.config.js sends browsers here too,
 * and this catches anything that reaches the segment another way.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { redirect } from "next/navigation";

type Props = { params: Promise<{ locale: string }> };

export default async function AdminHomeSectionsIndex(props: Props) {
  const { locale } = await props.params;
  redirect(`/${locale}/admin/pages/home`);
}
