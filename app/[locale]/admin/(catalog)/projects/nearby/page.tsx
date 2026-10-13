/**
 * app/[locale]/admin/(catalog)/projects/nearby/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The shared "Nearby" list: what every project without a list of its own
 * shows. See lib/nearby.ts. Until the first save it opens with the
 * built-in list from content/nearby-attractions.ts, which is also what
 * the site shows meanwhile.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { getTranslations } from "next-intl/server";
import { Role } from "@prisma/client";
import { requireAdmin } from "@/lib/admin/guard";
import { hasRole } from "@/lib/role-rank";
import { getNearbyForEditing } from "@/lib/nearby";
import AdminPageHeader from "@/components/admin/ui/AdminPageHeader";
import NearbyEditor from "@/components/admin/NearbyEditor";
import { saveNearbyList } from "./actions";

type Props = { params: Promise<{ locale: string }> };

export default async function AdminSharedNearbyPage(props: Props) {
  const { locale } = await props.params;
  const session = await requireAdmin(locale, Role.VIEWER);
  const canWrite = hasRole(session.role, Role.EDITOR);

  const [t, list] = await Promise.all([
    getTranslations({ locale, namespace: "admin" }),
    getNearbyForEditing(null),
  ]);

  return (
    <div className="space-y-6">
      <AdminPageHeader title={t("nearby.sharedTitle")} description={t("nearby.sharedIntro")} />
      <NearbyEditor
        scope="shared"
        source={list.source}
        initial={list.categories}
        canWrite={canWrite}
        action={saveNearbyList.bind(null, locale, null)}
      />
    </div>
  );
}
