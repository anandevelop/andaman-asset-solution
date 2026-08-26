/**
 * app/[locale]/admin/projects/[id]/units/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Every physical unit on one project — status (inline dropdown) and
 * whether it has a traced shape yet ("Draw Shape" links to
 * ../site-plan?unit=id, pre-selecting that unit there). Grouped by unit
 * type, same grouping the public project page's status table uses, so
 * the two stay easy to compare side by side.
 *
 * sandbox: `prisma as any` — see the cast note above getProjectBySlug in
 * lib/projects.ts.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, PenLine } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin/guard";
import UnitStatusSelect from "@/components/admin/UnitStatusSelect";
import { updateUnitStatus } from "./actions";

type Props = { params: { locale: string; id: string } };

export default async function AdminUnitsPage({ params }: Props) {
  const { locale, id: projectId } = params;
  await requireAdmin(locale);

  const t = await getTranslations({ locale, namespace: "admin" });
  const db = prisma as any;

  const project = await db.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: { id: true, slug: true, nameEn: true, nameTh: true },
  });
  if (!project) notFound();

  const units = await db.projectUnit.findMany({
    where: { projectId },
    orderBy: [{ sortOrder: "asc" }, { unitNumber: "asc" }],
    include: { unitType: { select: { name: true } } },
  });

  const projectName = locale === "th" ? project.nameTh : project.nameEn;
  const statusLabels = {
    AVAILABLE: t("units.statusOptions.AVAILABLE"),
    RESERVED: t("units.statusOptions.RESERVED"),
    SOLD: t("units.statusOptions.SOLD"),
  };

  const unitsByType = units.reduce((acc: Record<string, any[]>, u: any) => {
    const key = u.unitType?.name ?? "—";
    (acc[key] ??= []).push(u);
    return acc;
  }, {});

  return (
    <div className="space-y-8">
      <header>
        <Link
          href={`/${locale}/admin/projects`}
          className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-primary"
        >
          <ArrowLeft size={14} aria-hidden />
          {t("projects.title")}
        </Link>

        <p className="admin-section-title mt-4">{t("units.title")}</p>
        <h1 className="mt-2 text-2xl font-semibold text-primary sm:text-3xl">{projectName}</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-muted">{t("units.subtitle")}</p>

        <div className="mt-3">
          <Link
            href={`/${locale}/admin/projects/${project.id}/site-plan`}
            className="inline-flex items-center gap-1.5 text-sm text-accent-700 hover:text-accent-800"
          >
            <PenLine size={14} aria-hidden />
            {t("sitePlan.title")}
          </Link>
        </div>
      </header>

      {units.length === 0 ? (
        <div className="admin-card text-center text-sm text-ink-muted">{t("units.empty")}</div>
      ) : (
        <div className="space-y-8">
          {Object.entries(unitsByType).map(([typeName, groupUnits]) => (
            <section key={typeName} className="admin-card overflow-x-auto">
              <h2 className="mb-4 text-base font-semibold text-primary">{typeName}</h2>
              <table className="w-full min-w-[560px] border-collapse">
                <thead>
                  <tr className="border-b border-primary/10">
                    <th className="admin-th">{t("units.unitNumber")}</th>
                    <th className="admin-th">{t("units.status")}</th>
                    <th className="admin-th">{t("sitePlan.title")}</th>
                    <th className="admin-th" />
                  </tr>
                </thead>
                <tbody>
                  {(groupUnits as any[]).map((unit) => {
                    const isMapped = unit.shapePoints !== null;
                    return (
                      <tr key={unit.id} className="border-b border-primary/5 last:border-0">
                        <td className="admin-td font-medium text-primary">{unit.unitNumber}</td>
                        <td className="admin-td">
                          <UnitStatusSelect
                            action={updateUnitStatus.bind(
                              null,
                              locale,
                              project.id,
                              project.slug,
                              unit.id,
                            )}
                            status={unit.status}
                            labels={statusLabels}
                          />
                        </td>
                        <td className="admin-td">
                          <span
                            className={
                              isMapped
                                ? "rounded-sm bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800"
                                : "rounded-sm bg-surface-muted px-2 py-1 text-xs font-medium text-ink-muted"
                            }
                          >
                            {isMapped ? t("units.mapped") : t("units.notMapped")}
                          </span>
                        </td>
                        <td className="admin-td text-right">
                          <Link
                            href={`/${locale}/admin/projects/${project.id}/site-plan?unit=${unit.id}`}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-accent-700 hover:text-accent-800"
                          >
                            <PenLine size={13} aria-hidden />
                            {t("units.drawShape")}
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
