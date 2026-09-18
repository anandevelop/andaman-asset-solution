/**
 * app/[locale]/admin/settings/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * /admin/settings has no content of its own any more — every group is a
 * real route under it (see the layout beside this file), so this sends the
 * bare path to the first one rather than rendering an eighth screen whose
 * only job would be a list of links the left rail already shows.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { redirect } from "next/navigation";

type Props = { params: Promise<{ locale: string }> };

export default async function AdminSettingsIndex(props: Props) {
  const { locale } = await props.params;
  redirect(`/${locale}/admin/settings/company`);
}
