/**
 * app/[locale]/admin/pages/home/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * No content of its own; the first tab is the landing place.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { redirect } from "next/navigation";

type Props = { params: Promise<{ locale: string }> };

export default async function AdminPagesHomeIndex(props: Props) {
  const { locale } = await props.params;
  redirect(`/${locale}/admin/pages/home/sections`);
}
