/**
 * app/[locale]/admin/projects/[id]/site-plan/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Polygon drawing tool — trace each unit's boundary on the master plan
 * image so components/SitePlanMap.tsx has something to render on the
 * public project page. Linked from ../units (per-row "Draw Shape") and
 * from the project edit page header.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin/guard";
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
  await requireAdmin(locale);

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

  const projectName = locale === "th" ? project.nameTh : project.nameEn;
  const mappedCount = units.filter((u: any) => u.shapePoints !== null).length;

  return (
    <div className="space-y-8">
      <header>
        <Link
          href={`/${locale}/admin/projects/${project.id}/units`}
          className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-primary"
        >
          <ArrowLeft size={14} aria-hidden />
          {t("units.title")}
        </Link>

        <p className="admin-section-title mt-4">{t("sitePlan.title")}</p>
        <h1 className="mt-2 text-2xl font-semibold text-primary sm:text-3xl">{projectName}</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-muted">{t("sitePlan.hint")}</p>
      </header>

      {!project.masterPlanImageUrl ? (
        <div className="admin-card text-center text-sm text-ink-muted">
          {t("sitePlan.noImage")}
        </div>
      ) : units.length === 0 ? (
        <div className="admin-card text-center text-sm text-ink-muted">
          {t("units.empty")}
        </div>
      ) : (
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
      )}
    </div>
  );
}
