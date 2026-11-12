/**
 * /admin/analytics/sources — now the "แหล่งที่มา & คลิก" tab of
 * /admin/analytics. Kept as a redirect so a saved link still lands there.
 */

import { redirect } from "next/navigation";

type Props = { params: Promise<{ locale: string }> };

export default async function TrafficSourcesRedirect(props: Props) {
  const { locale } = await props.params;
  redirect(`/${locale}/admin/analytics?tab=sources`);
}
