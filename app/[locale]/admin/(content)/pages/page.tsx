/**
 * app/[locale]/admin/pages/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The hub has no content of its own — every tab is a real route — so the
 * bare path goes to the first one. Same arrangement as
 * admin/settings/page.tsx.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { redirect } from "next/navigation";

type Props = { params: Promise<{ locale: string }> };

export default async function AdminPagesIndex(props: Props) {
  const { locale } = await props.params;
  redirect(`/${locale}/admin/pages/home`);
}
