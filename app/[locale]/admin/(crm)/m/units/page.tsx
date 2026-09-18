/**
 * app/[locale]/admin/m/units/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * "Units" tab — Mobile.dc.html screen 3. The mockup opens straight into
 * one project's unit list; a project picker is added first (?project=id)
 * since a rep's phone has no other way to say which development they are
 * standing at. The status-change bottom sheet itself is MobileUnitList.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isDatabaseOffline, safeQuery } from "@/lib/db";
import { requireAdmin } from "@/lib/admin/guard";
import MobileShell from "@/components/admin/mobile/MobileShell";
import MobileUnitList from "@/components/admin/mobile/MobileUnitList";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ project?: string }>;
};

export default async function MobileUnitsPage(props: Props) {
  const { locale } = await props.params;
  const { project: projectId } = await props.searchParams;
  await requireAdmin(locale, Role.SALES);
  const t = await getTranslations({ locale, namespace: "admin.mobile" });
  const tRoot = await getTranslations({ locale, namespace: "admin" });
  const tUnits = await getTranslations({ locale, namespace: "admin.units" });

  if (!projectId) {
    const projects = await safeQuery(
      "mobile:projectPicker",
      () =>
        prisma.project.findMany({
          where: { deletedAt: null },
          orderBy: { nameEn: "asc" },
          select: { id: true, nameEn: true, nameTh: true },
        }),
      [],
    );

    return (
      <MobileShell locale={locale} active="units" title={t("units.pickProject")}>
          {/* An empty list during an outage reads as "you have no leads",
            which is the wrong and more alarming of the two meanings. */}
        {isDatabaseOffline() && (
          <p className="rounded-xs border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900">
            {tRoot("common.offline")}
          </p>
        )}

        {projects.length === 0 && (
          <p className="rounded-xs border border-dashed border-primary/20 bg-white p-4 text-center text-sm text-ink-muted">
            {tUnits("empty")}
          </p>
        )}
        {projects.map((project) => (
          <Link
            key={project.id}
            href={`/${locale}/admin/m/units?project=${project.id}`}
            className="flex min-h-[52px] items-center rounded-xs border border-primary/10 bg-white px-3.5 py-2.5 text-sm font-medium text-primary"
          >
            {locale === "th" ? project.nameTh : project.nameEn}
          </Link>
        ))}
      </MobileShell>
    );
  }

  const project = await safeQuery(
    "mobile:unitsProject",
    () =>
      prisma.project.findFirst({
        where: { id: projectId, deletedAt: null },
        select: { id: true, slug: true, nameEn: true, nameTh: true },
      }),
    null,
  );
  if (!project) notFound();

  const units = await safeQuery(
    "mobile:units",
    () =>
      prisma.projectUnit.findMany({
        where: { projectId: project.id },
        orderBy: [{ sortOrder: "asc" }, { unitNumber: "asc" }],
        select: { id: true, unitNumber: true, status: true, unitType: { select: { name: true } } },
      }),
    [],
  );

  const statusLabels = {
    AVAILABLE: tUnits("statusOptions.AVAILABLE"),
    RESERVED: tUnits("statusOptions.RESERVED"),
    SOLD: tUnits("statusOptions.SOLD"),
  };

  const counts = units.reduce(
    (acc, unit) => {
      acc[unit.status] += 1;
      return acc;
    },
    { AVAILABLE: 0, RESERVED: 0, SOLD: 0 } as Record<"AVAILABLE" | "RESERVED" | "SOLD", number>,
  );

  const projectName = locale === "th" ? project.nameTh : project.nameEn;

  return (
    <MobileShell
      locale={locale}
      active="units"
      eyebrow={projectName}
      backHref={`/${locale}/admin/m/units`}
      title={t("units.title")}
    >
      {/* An empty list during an outage reads as "you have no leads",
          which is the wrong and more alarming of the two meanings. */}
      {isDatabaseOffline() && (
        <p className="rounded-xs border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900">
          {tRoot("common.offline")}
        </p>
      )}

      <div className="flex gap-4 px-1 text-xs text-ink-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[1px]" style={{ backgroundColor: "#1f7a5c" }} aria-hidden />
          {statusLabels.AVAILABLE} {counts.AVAILABLE}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[1px]" style={{ backgroundColor: "#e8b384" }} aria-hidden />
          {statusLabels.RESERVED} {counts.RESERVED}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[1px]" style={{ backgroundColor: "#9bb6c6" }} aria-hidden />
          {statusLabels.SOLD} {counts.SOLD}
        </span>
      </div>

      {units.length === 0 ? (
        <p className="rounded-xs border border-dashed border-primary/20 bg-white p-4 text-center text-sm text-ink-muted">
          {tUnits("empty")}
        </p>
      ) : (
        <MobileUnitList
          locale={locale}
          projectId={project.id}
          projectSlug={project.slug}
          units={units.map((unit) => ({
            id: unit.id,
            unitNumber: unit.unitNumber,
            status: unit.status,
            typeLabel: unit.unitType?.name ?? "—",
          }))}
          statusLabels={statusLabels}
          sheetLabels={{
            title: t("units.sheetTitle"),
            cancel: tRoot("common.cancel"),
            save: tRoot("common.save"),
            error: tRoot("common.error"),
          }}
        />
      )}
    </MobileShell>
  );
}
