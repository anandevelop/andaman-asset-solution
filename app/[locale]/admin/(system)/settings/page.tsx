/**
 * app/[locale]/admin/(system)/settings/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * /admin/settings has no content of its own — every group is a real route
 * under it (see the layout beside this file), so this sends the bare path
 * to the first one rather than rendering another screen whose only job
 * would be a list of links the left rail already shows.
 *
 * Notifications, because the two groups that used to come first were not
 * settings: "company" edited the About page's copy and "contact" edited
 * the contact page's, and both are tabs of /admin/pages now.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { redirect } from "next/navigation";

type Props = { params: Promise<{ locale: string }> };

export default async function AdminSettingsIndex(props: Props) {
  const { locale } = await props.params;
  redirect(`/${locale}/admin/settings/notifications`);
}
