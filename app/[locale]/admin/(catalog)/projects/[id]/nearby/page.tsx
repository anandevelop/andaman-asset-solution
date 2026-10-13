/**
 * app/[locale]/admin/(catalog)/projects/[id]/nearby/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * "สถานที่ใกล้เคียง": the Nearby panel on this project's page. Either the
 * project's own list or, until it has one, the shared list, which is
 * edited at /admin/projects/nearby. See lib/nearby.ts.
 *
 * VIEWER can open it, and EDITOR and above can save, as on the facilities
 * tab beside it.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin/guard";
import { hasRole } from "@/lib/role-rank";
import { getNearbyForEditing } from "@/lib/nearby";
import ProjectHubTabs from "@/components/admin/ProjectHubTabs";
import NearbyEditor from "@/components/admin/NearbyEditor";
import { revertToSharedNearbyList, saveNearbyList } from "../../nearby/actions";

type Props = { params: Promise<{ locale: string; id: string }> };

export default async function AdminProjectNearbyPage(props: Props) {
  const { locale, id: projectId } = await props.params;
  const session = await requireAdmin(locale, Role.VIEWER);
  const canWrite = hasRole(session.role, Role.EDITOR);

  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: { id: true },
  });
  if (!project) notFound();

  const [t, list] = await Promise.all([
    getTranslations({ locale, namespace: "admin" }),
    getNearbyForEditing(projectId),
  ]);

  return (
    <div className="space-y-6">
      <ProjectHubTabs locale={locale} projectId={projectId} active="nearby" />

      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="max-w-2xl text-sm text-adm-muted">{t("nearby.projectIntro")}</p>
        <Link href={`/${locale}/admin/projects/nearby`} className="text-sm text-adm-accent-ink hover:underline">
          {t("nearby.editShared")}
        </Link>
      </div>

      <NearbyEditor
        key={list.source}
        scope="project"
        source={list.source}
        initial={list.categories}
        canWrite={canWrite}
        action={saveNearbyList.bind(null, locale, projectId)}
        revert={revertToSharedNearbyList.bind(null, locale, projectId)}
      />
    </div>
  );
}
