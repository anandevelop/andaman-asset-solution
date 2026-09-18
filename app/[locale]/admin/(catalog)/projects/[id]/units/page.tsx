/**
 * app/[locale]/admin/projects/[id]/units/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Units & Site Plan (Units.dc.html) — the site plan on the left, the
 * selected plot on the right, the full list underneath.
 *
 * Selection and the shown phase live in the query string (?unit=, ?phase=)
 * so the detail panel can be rendered here, on the server, with the lead
 * and reservation data already joined — and so a link to one plot is
 * something a sales manager can paste into a chat.
 *
 * Everything the client components render is prepared here: areas
 * converted into the units each locale actually uses, dates turned into
 * relative phrases, enums translated. They receive display strings, not
 * Prisma models.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, Info } from "lucide-react";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { safeQuery, isDatabaseOffline } from "@/lib/db";
import { requireAdmin } from "@/lib/admin/guard";
import { hasRole } from "@/lib/role-rank";
import { intlLocale } from "@/lib/format";
import { formatLandArea } from "@/lib/land-area";
import { relativeTime } from "@/lib/relative-time";
import {
  countUnits,
  getAdminProjectUnits,
  groupByPhase,
  type UnitRow,
} from "@/lib/admin/project-units";
import ProjectHubTabs from "@/components/admin/ProjectHubTabs";
import UnitSitePlan from "@/components/admin/UnitSitePlan";
import UnitDetailPanel from "@/components/admin/UnitDetailPanel";
import UnitsPanel, { type UnitTableRow } from "@/components/admin/UnitsPanel";
import { saveUnit } from "./actions";

type Props = {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ unit?: string; phase?: string }>;
};

/** How close a reservation's follow-up date has to be before the panel
 *  starts showing it in red. */
const RESERVATION_WARNING_MS = 7 * 24 * 60 * 60 * 1000;

export default async function AdminUnitsPage(props: Props) {
  const [{ locale, id: projectId }, searchParams] = await Promise.all([
    props.params,
    props.searchParams,
  ]);

  // VIEWER may open this to see the plan and the unit list; changing a
  // unit's status, position or details stays behind a disabled fieldset
  // for anyone below EDITOR — the actual boundary is still each action's
  // own guard, unchanged, since the site plan's drag interactions are not
  // native form controls a <fieldset disabled> can reach.
  const session = await requireAdmin(locale, Role.VIEWER);
  const canWrite = hasRole(session.role, Role.EDITOR);

  const [t, tEnum] = await Promise.all([
    getTranslations({ locale, namespace: "admin" }),
    getTranslations({ locale, namespace: "projects" }),
  ]);

  const project = await safeQuery(
    "admin:project:unitsPage",
    () =>
      prisma.project.findFirst({
        where: { id: projectId, deletedAt: null },
        select: {
          id: true,
          slug: true,
          nameEn: true,
          nameTh: true,
          status: true,
          isPublished: true,
          masterPlanImageUrl: true,
        },
      }),
    undefined,
  );

  if (!project) notFound();

  const [units, unitTypes] = await Promise.all([
    getAdminProjectUnits(project.id),
    safeQuery(
      "admin:project:unitTypes",
      () =>
        prisma.projectUnitType.findMany({
          where: { projectId: project.id },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          select: { id: true, name: true },
        }),
      [],
    ),
  ]);

  const projectName = locale === "th" ? project.nameTh : project.nameEn;
  const now = new Date();

  const statusLabels = {
    AVAILABLE: t("units.statusOptions.AVAILABLE"),
    RESERVED: t("units.statusOptions.RESERVED"),
    SOLD: t("units.statusOptions.SOLD"),
  };

  const areaLabels = {
    rai: t("units.area.rai"),
    ngan: t("units.area.ngan"),
    wa: t("units.area.wa"),
    sqm: t("units.area.sqm"),
  };

  // ── Phases ─────────────────────────────────────────────────────────────
  const phaseGroups = groupByPhase(units);

  const phaseLabelFor = (phase: number | null) =>
    phase === null ? t("units.phaseNone") : t("units.phaseN", { n: phase });

  const requestedPhase =
    searchParams.phase === "none"
      ? null
      : searchParams.phase !== undefined && Number.isInteger(Number(searchParams.phase))
        ? Number(searchParams.phase)
        : undefined;

  const activeGroup =
    (requestedPhase !== undefined
      ? phaseGroups.find((group) => group.phase === requestedPhase)
      : undefined) ??
    phaseGroups[0] ??
    null;

  const phaseUnits = activeGroup?.units ?? [];
  const counts = countUnits(phaseUnits);

  // "Phase 2 (8 plots) not released yet" for every phase that is not the
  // one on screen and has nothing on sale — the mockup's footnote.
  const otherPhaseNotes = phaseGroups
    .filter((group) => group !== activeGroup && group.allUnreleased)
    .map((group) =>
      t("units.phaseUnreleasedNote", {
        phase: phaseLabelFor(group.phase),
        count: group.units.length,
      }),
    );

  // Plots with neither a traced shape nor an anchor cannot be drawn on the
  // master plan image — the same test UnitSitePlan uses to decide between
  // the image and the tile grid, counted here so the explanation it shows
  // is a finished sentence rather than a template.
  const untracedCount = phaseUnits.filter(
    (unit) =>
      !(unit.shapePoints && unit.shapePoints.length > 2) &&
      (unit.positionXPercent === null || unit.positionYPercent === null),
  ).length;

  // ── Selected unit ──────────────────────────────────────────────────────
  const selected =
    phaseUnits.find((unit) => unit.id === searchParams.unit) ??
    // Landing on a plain link should still show something: the first plot
    // in the phase, rather than an empty panel asking for a click.
    phaseUnits[0] ??
    null;

  const livingAreaLabelFor = (unit: UnitRow) =>
    unit.livingAreaSqm === null
      ? null
      : t("units.area.sqmValue", { value: Math.round(unit.livingAreaSqm) });

  const landAreaLabelFor = (unit: UnitRow) =>
    unit.landAreaSqm === null ? null : formatLandArea(locale, unit.landAreaSqm, areaLabels);

  const facingLabelFor = (unit: UnitRow) =>
    [unit.facing, unit.viewLabel].filter(Boolean).join(" · ") || null;

  const typeLabelFor = (unit: UnitRow) => {
    // "3-bedroom villa · Type B" when the type carries a bedroom count,
    // otherwise just the type's own name.
    const parts = [
      unit.bedrooms ? t("units.bedroomsLabel", { count: unit.bedrooms }) : null,
      unit.unitTypeName,
    ].filter(Boolean);
    return parts.length ? parts.join(" · ") : null;
  };

  const dateFormat = new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const detail = selected
    ? {
        id: selected.id,
        unitNumber: selected.unitNumber,
        status: selected.status,
        statusLabel: statusLabels[selected.status],
        releasedForSale: selected.releasedForSale,
        typeLabel: typeLabelFor(selected),
        livingAreaLabel: livingAreaLabelFor(selected),
        landAreaLabel: landAreaLabelFor(selected),
        facingLabel: facingLabelFor(selected),
        reservedByLead: selected.reservedByLead,
        reservedByName: selected.reservedByName,
        expiryLabel: selected.reservationExpiresAt
          ? `${dateFormat.format(selected.reservationExpiresAt)} (${relativeTime(
              locale,
              selected.reservationExpiresAt,
              now,
            )})`
          : null,
        // A week's notice: long enough to act on, short enough that the
        // colour still means something when it appears.
        expiryUrgent: selected.reservationExpiresAt
          ? selected.reservationExpiresAt.getTime() - now.getTime() < RESERVATION_WARNING_MS
          : false,
        expiryInputValue: selected.reservationExpiresAt
          ? selected.reservationExpiresAt.toISOString().slice(0, 10)
          : "",
        form: {
          id: selected.id,
          unitNumber: selected.unitNumber,
          unitTypeId: selected.unitTypeId,
          status: selected.status,
          landAreaSqm: selected.landAreaSqm,
          facing: selected.facing,
          viewLabel: selected.viewLabel,
          phase: selected.phase,
          releasedForSale: selected.releasedForSale,
          priceTHB: selected.priceTHB,
          adminNotes: selected.adminNotes,
        },
      }
    : null;

  const tableRows: UnitTableRow[] = phaseUnits.map((unit) => ({
    id: unit.id,
    unitNumber: unit.unitNumber,
    typeLabel: typeLabelFor(unit),
    livingAreaLabel: livingAreaLabelFor(unit),
    landAreaLabel: landAreaLabelFor(unit),
    facingLabel: facingLabelFor(unit),
    status: unit.status,
    releasedForSale: unit.releasedForSale,
    leadId: unit.reservedByLead?.id ?? null,
    leadName: unit.reservedByLead?.name ?? null,
    lastEditedLabel: relativeTime(locale, unit.lastEditedAt ?? unit.updatedAt, now),
    lastEditedBy: unit.lastEditedBy,
  }));

  const formLabels = {
    unitNumber: t("units.unitNumber"),
    unitType: t("unitTypes.title"),
    unitTypeNone: t("units.form.noType"),
    status: t("units.status"),
    phase: t("units.form.phase"),
    phaseHint: t("units.form.phaseHint"),
    released: t("units.form.released"),
    releasedHint: t("units.form.releasedHint"),
    landArea: t("units.form.landArea"),
    facing: t("units.form.facing"),
    view: t("units.form.view"),
    price: t("units.form.price"),
    priceHint: t("units.form.priceHint"),
    adminNotes: t("units.form.adminNotes"),
    save: t("common.save"),
    cancel: t("common.cancel"),
    saved: t("common.saved"),
    error: t("common.error"),
    duplicate: t("units.form.duplicate"),
  };

  const saveAction = saveUnit.bind(null, locale, project.id, project.slug, selected?.id ?? "");
  const createAction = saveUnit.bind(null, locale, project.id, project.slug, "");

  return (
    <div className="space-y-6">
      <header>
        <Link
          href={`/${locale}/admin/projects`}
          className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-primary"
        >
          <ArrowLeft size={14} aria-hidden />
          {t("projects.title")}
        </Link>

        <div className="mt-3 flex flex-wrap items-center gap-2.5">
          <h1 className="text-2xl font-semibold text-primary sm:text-3xl">{projectName}</h1>
          <span className="rounded-xs bg-surface-muted px-2 py-1 text-xs font-medium text-ink-muted">
            {tEnum(`status.${project.status}` as never)}
          </span>
          <span
            className={
              project.isPublished
                ? "rounded-xs bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800"
                : "rounded-xs bg-surface-muted px-2 py-1 text-xs font-medium text-ink-muted"
            }
          >
            {project.isPublished ? t("common.published") : t("common.draft")}
          </span>
        </div>
      </header>

      <ProjectHubTabs
        locale={locale}
        projectId={project.id}
        active="units"
        labels={{
          overview: t("projects.hubOverview"),
          content: t("projectContent.tab"),
          seo: t("pageSeo.tab"),
          unitTypes: t("unitTypes.title"),
          units: t("units.title"),
          facilities: t("facilities.title"),
          progress: t("progress.title"),
        }}
      />

      {isDatabaseOffline() && (
        <p className="rounded-xs border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t("common.offline")}
        </p>
      )}

      {/* Standing site policy — units publish a status only, never a
          price; the public unit CTA is "Ask about this unit", which
          creates a lead tied to the unit automatically. Informational
          only: there is no per-project override, since the policy is
          site-wide by design. */}
      <p className="flex items-start gap-2.5 rounded-xs border border-accent/30 bg-accent-50/60 px-4 py-3 text-sm text-ink">
        <Info size={16} className="mt-0.5 shrink-0 text-accent-700" aria-hidden />
        {t("units.pricePolicyNote")}
      </p>

      <fieldset disabled={!canWrite} className="contents">
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <UnitSitePlan
            locale={locale}
            projectId={project.id}
            units={phaseUnits.map((unit) => ({
              id: unit.id,
              unitNumber: unit.unitNumber,
              status: unit.status,
              releasedForSale: unit.releasedForSale,
              shapePoints: unit.shapePoints,
              positionXPercent: unit.positionXPercent,
              positionYPercent: unit.positionYPercent,
            }))}
            selectedUnitId={selected?.id ?? null}
            activePhase={activeGroup?.phase ?? null}
            phases={phaseGroups.map((group) => ({
              phase: group.phase,
              label: phaseLabelFor(group.phase),
              count: group.units.length,
              allUnreleased: group.allUnreleased,
            }))}
            masterPlanImageUrl={project.masterPlanImageUrl}
            counts={counts}
            labels={{
              title: `${t("sitePlan.title")} · ${phaseLabelFor(activeGroup?.phase ?? null)}`,
              changeImage: t("units.changePlanImage"),
              editPositions: t("units.editPositions"),
              north: t("units.north"),
              available: statusLabels.AVAILABLE,
              reserved: statusLabels.RESERVED,
              sold: statusLabels.SOLD,
              unreleased: t("units.unreleased"),
              otherPhaseNotes,
              untracedNote:
                untracedCount > 0 ? t("units.untracedNote", { count: untracedCount }) : null,
              empty: t("units.empty"),
            }}
          />
        </div>

        <div className="lg:col-span-2">
          <UnitDetailPanel
            locale={locale}
            projectId={project.id}
            projectSlug={project.slug}
            unit={detail}
            unitTypes={unitTypes}
            statusLabels={statusLabels}
            saveAction={saveAction}
            labels={{
              empty: t("units.detail.empty"),
              heading: t("units.detail.heading"),
              type: t("units.detail.type"),
              livingArea: t("units.detail.livingArea"),
              landArea: t("units.detail.landArea"),
              facing: t("units.detail.facing"),
              linkedLead: t("units.detail.linkedLead"),
              reservedBy: t("units.detail.reservedBy"),
              expires: t("units.detail.expires"),
              notReleased: t("units.unreleased"),
              extend: t("units.detail.extend"),
              extendSave: t("common.save"),
              markSold: t("units.detail.markSold"),
              releaseHold: t("units.detail.releaseHold"),
              makeAvailable: t("units.detail.makeAvailable"),
              markReserved: t("units.detail.markReserved"),
              edit: t("units.detail.edit"),
              cancel: t("common.cancel"),
              auditNote: t("units.detail.auditNote"),
              error: t("common.error"),
              notSet: t("units.detail.notSet"),
              form: formLabels,
            }}
          />
        </div>
      </div>

      <UnitsPanel
        locale={locale}
        projectId={project.id}
        projectSlug={project.slug}
        rows={tableRows}
        selectedUnitId={selected?.id ?? null}
        unitTypes={unitTypes}
        statusLabels={statusLabels}
        saveAction={createAction}
        labels={{
          title: t("units.listTitle"),
          subtitle: t("units.listSubtitle", {
            count: phaseUnits.length,
            phase: phaseLabelFor(activeGroup?.phase ?? null),
          }),
          search: t("units.searchPlaceholder"),
          importCsv: t("units.importCsv"),
          addUnit: t("units.addUnit"),
          columnUnit: t("units.unitNumber"),
          columnType: t("unitTypes.title"),
          columnLivingArea: t("units.detail.livingArea"),
          columnLandArea: t("units.detail.landArea"),
          columnFacing: t("units.detail.facing"),
          columnStatus: t("units.status"),
          columnLead: t("units.detail.linkedLead"),
          columnUpdated: t("projects.columns.lastEdited"),
          notReleased: t("units.unreleased"),
          none: t("units.detail.notSet"),
          empty: t("units.empty"),
          noMatches: t("units.noMatches"),
          cancel: t("common.cancel"),
          csvIntro: t("units.csv.intro"),
          csvColumns: t("units.csv.columns"),
          csvChoose: t("units.csv.choose"),
          csvSkippedTitle: t("units.csv.skippedTitle"),
          csvNothingApplied: t("units.csv.nothingApplied"),
          csvError: t("common.error"),
          csvReasons: {
            EMPTY_FILE: t("units.csv.reasons.EMPTY_FILE"),
            NO_ROWS: t("units.csv.reasons.NO_ROWS"),
            TOO_MANY_ROWS: t("units.csv.reasons.TOO_MANY_ROWS"),
            MISSING_UNIT_NUMBER_COLUMN: t("units.csv.reasons.MISSING_UNIT_NUMBER_COLUMN"),
            MISSING_UNIT_NUMBER: t("units.csv.reasons.MISSING_UNIT_NUMBER"),
            DUPLICATE_IN_FILE: t("units.csv.reasons.DUPLICATE_IN_FILE"),
            BAD_STATUS: t("units.csv.reasons.BAD_STATUS"),
            UNKNOWN_UNIT_TYPE: t("units.csv.reasons.UNKNOWN_UNIT_TYPE"),
            BAD_LAND_AREA: t("units.csv.reasons.BAD_LAND_AREA"),
            BAD_PRICE: t("units.csv.reasons.BAD_PRICE"),
            BAD_PHASE: t("units.csv.reasons.BAD_PHASE"),
            BAD_RELEASED: t("units.csv.reasons.BAD_RELEASED"),
            SAVE_FAILED: t("common.error"),
          },
          form: formLabels,
        }}
      />
      </fieldset>
    </div>
  );
}
