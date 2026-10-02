/**
 * app/[locale]/admin/(catalog)/projects/[id]/site-plan/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Polygon drawing tool — trace each unit's boundary on the master plan
 * image so components/SitePlanMap.tsx has something to render on the
 * public project page.
 *
 * It used to be reachable only from a per-row "Draw Shape" button on the
 * units table: no tab, no menu row, and grepping the back office found no
 * other link to it. It is now a step of the workspace's units tab (the
 * segmented control in ProjectHubTabs), and the units page links to it.
 */

import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin/guard";
import { hasRole } from "@/lib/role-rank";
import ProjectHubTabs from "@/components/admin/ProjectHubTabs";
import SitePlanDrawer from "@/components/admin/SitePlanDrawer";
import { saveUnitShape } from "./actions";

type Props = {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ unit?: string }>;
};

export default async function AdminSitePlanPage(props: Props) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const { locale, id: projectId } = params;
  // VIEWER may open this to see which units are already mapped; drawing or
  // saving a shape stays behind a disabled fieldset for anyone below
  // EDITOR — the actual boundary is still saveUnitShape's own guard,
  // unchanged, since a canvas tool has drag interactions a plain
  // <fieldset disabled> cannot reach.
  const session = await requireAdmin(locale, Role.VIEWER);
  const canWrite = hasRole(session.role, Role.EDITOR);

  const t = await getTranslations({ locale, namespace: "admin" });
  const db = prisma;

  const project = await db.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: { id: true, slug: true, nameEn: true, nameTh: true, masterPlanImageUrl: true },
  });
  if (!project) notFound();

  const units = await db.projectUnit.findMany({
    where: { projectId },
    orderBy: [{ sortOrder: "asc" }, { unitNumber: "asc" }],
    select: { id: true, unitNumber: true, status: true, shapePoints: true },
  });

  const mappedCount = units.filter((u: any) => u.shapePoints !== null).length;

  return (
    <div className="space-y-8">
      <ProjectHubTabs locale={locale} projectId={project.id} active="sitePlan" />

      <p className="max-w-2xl text-sm text-adm-muted">{t("sitePlan.hint")}</p>

      {!project.masterPlanImageUrl ? (
        <div className="admin-card text-center text-sm text-adm-muted">
          {t("sitePlan.noImage")}
        </div>
      ) : units.length === 0 ? (
        <div className="admin-card text-center text-sm text-adm-muted">
          {t("units.empty")}
        </div>
      ) : (
        <fieldset disabled={!canWrite} className="contents">
        <SitePlanDrawer
          masterPlanImageUrl={project.masterPlanImageUrl}
          units={units.map((u: any) => ({
            id: u.id,
            unitNumber: u.unitNumber,
            status: u.status,
            shapePoints: u.shapePoints,
          }))}
          preselectedUnitId={searchParams.unit ?? null}
          mappedCount={mappedCount}
          totalCount={units.length}
          action={saveUnitShape.bind(null, locale, project.id, project.slug)}
          labels={{
            progress: t("sitePlan.progress", { mapped: mappedCount, total: units.length }),
            selectUnit: t("sitePlan.selectUnit"),
            notMappedGroup: t("sitePlan.notMappedGroup"),
            mappedGroup: t("sitePlan.mappedGroup"),
            clickHint: t("sitePlan.clickHint"),
            closeShape: t("sitePlan.closeShape"),
            redraw: t("sitePlan.redraw"),
            undo: t("sitePlan.undo"),
            edit: t("sitePlan.edit"),
            save: t("common.save"),
            saving: t("common.saving"),
            saved: t("common.saved"),
            error: t("common.error"),
            minPointsError: t("sitePlan.minPointsError"),
            selectUnitError: t("sitePlan.selectUnitError"),
            allMapped: t("sitePlan.allMapped"),
            zoomIn: t("sitePlan.zoomIn"),
            zoomOut: t("sitePlan.zoomOut"),
            resetView: t("sitePlan.resetView"),
          }}
        />
        </fieldset>
      )}
    </div>
  );
}
