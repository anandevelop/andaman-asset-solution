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
import { ArrowRight, Info, Map as MapIcon } from "lucide-react";
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
import UnitTileBoard, { type TileGroup } from "@/components/admin/UnitTileBoard";
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

  const t = await getTranslations({ locale, namespace: "admin" });

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

  const now = new Date();

  const statusLabels = {
    AVAILABLE: t("units.statusOptions.AVAILABLE"),
    RESERVED: t("units.statusOptions.RESERVED"),
    SOLD: t("units.statusOptions.SOLD"),
    TRANSFERRED: t("units.statusOptions.TRANSFERRED"),
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

  // Plots with neither a traced shape nor an anchor cannot be drawn on the
  // master plan image — the site-plan card's "traced x / y".
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


  // ── Tiles, grouped by house type ───────────────────────────────────────
  /* In the house types' own order; plots with no type last. A plot held
     for somebody is `locked` — see UnitTileBoard's header for why it gets
     the detail panel rather than the quick menu. */
  const typeOrder = new Map(unitTypes.map((type, index) => [type.id, index]));
  const tileGroupsById = new Map<string, TileGroup>();
  for (const unit of phaseUnits) {
    const key = unit.unitTypeId ?? "none";
    const group = tileGroupsById.get(key) ?? {
      key,
      label: unit.unitTypeName ?? t("units.tiles.noType"),
      meta: unit.bedrooms ? t("units.bedroomsLabel", { count: unit.bedrooms }) : null,
      units: [],
    };
    group.units.push({
      id: unit.id,
      unitNumber: unit.unitNumber,
      status: unit.status,
      released: unit.releasedForSale,
      locked:
        unit.status === "RESERVED" &&
        Boolean(unit.reservedByLead || unit.reservedByName || unit.reservationExpiresAt),
      selectedInPanel: unit.id === selected?.id,
      detailHref: `?${new URLSearchParams({
        ...(activeGroup ? { phase: String(activeGroup.phase ?? "none") } : {}),
        unit: unit.id,
      }).toString()}`,
    });
    tileGroupsById.set(key, group);
  }
  const tileGroups = [...tileGroupsById.values()].sort(
    (a, b) => (typeOrder.get(a.key) ?? Number.MAX_SAFE_INTEGER) - (typeOrder.get(b.key) ?? Number.MAX_SAFE_INTEGER),
  );

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
      <ProjectHubTabs
        locale={locale}
        projectId={project.id}
        active="units"
      />

      {isDatabaseOffline() && (
        <p className="rounded-xs border border-adm-warning/30 bg-adm-warning-bg px-4 py-3 text-sm text-adm-warning">
          {t("common.offline")}
        </p>
      )}

      {/* Standing site policy — units publish a status only, never a
          price; the public unit CTA is "Ask about this unit", which
          creates a lead tied to the unit automatically. Informational
          only: there is no per-project override, since the policy is
          site-wide by design. */}
      <p className="flex items-start gap-2.5 rounded-xs border border-adm-fill/30 bg-adm-fill/15 px-4 py-3 text-sm text-adm-text">
        <Info size={16} className="mt-0.5 shrink-0 text-adm-accent-ink" aria-hidden />
        {t("units.pricePolicyNote")}
      </p>

      <fieldset disabled={!canWrite} className="contents">
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <section className="admin-card space-y-4">
          {/* Phases, when the project releases in stages — the tiles and
              the counts are one phase at a time, as the plan was. */}
          {phaseGroups.length > 1 && (
            <nav aria-label={t("units.phaseLabel")} className="inline-flex flex-wrap rounded-[10px] border border-adm-line bg-adm-bg p-0.5">
              {phaseGroups.map((group) => {
                const current = group === activeGroup;
                return (
                  <Link
                    key={group.phase ?? "none"}
                    href={`?phase=${group.phase ?? "none"}`}
                    scroll={false}
                    aria-current={current ? "page" : undefined}
                    className={[
                      "rounded-[8px] px-3 py-1 text-[12.5px] transition-colors",
                      current
                        ? "bg-adm-solid font-medium text-adm-text shadow-[0_0_0_1px_var(--adm-line)]"
                        : "text-adm-muted hover:text-adm-text",
                    ].join(" ")}
                  >
                    {phaseLabelFor(group.phase)} · {group.units.length}
                  </Link>
                );
              })}
            </nav>
          )}

          {phaseUnits.length === 0 ? (
            <p className="py-8 text-center text-sm text-adm-muted">{t("units.empty")}</p>
          ) : (
            <UnitTileBoard
              locale={locale}
              projectId={project.id}
              projectSlug={project.slug}
              groups={tileGroups}
              statusLabels={statusLabels}
              canWrite={canWrite}
              labels={{
                details: t("units.tiles.details"),
                unreleased: t("units.unreleased"),
                lockedHint: t("units.tiles.lockedHint"),
                shiftHint: t("units.tiles.shiftHint"),
                bulkStatus: t("units.tiles.bulkStatus"),
                clear: t("units.tiles.clear"),
                failed: t("common.error"),
              }}
            />
          )}
        </section>

        <div className="space-y-4">
          {/* How much is left, as one ring: available of what is on sale.
              Unreleased plots are not counted as available — see
              countUnits. */}
          <section className="admin-card flex items-center gap-4">
            <AvailabilityRing available={counts.available} total={counts.available + counts.reserved + counts.sold} />
            <dl className="grid flex-1 grid-cols-2 gap-x-3 gap-y-1 text-xs">
              <dt className="text-adm-muted">{statusLabels.AVAILABLE}</dt>
              <dd className="text-right font-semibold tabular-nums text-adm-success">{counts.available}</dd>
              <dt className="text-adm-muted">{statusLabels.RESERVED}</dt>
              <dd className="text-right font-semibold tabular-nums text-adm-warning">{counts.reserved}</dd>
              <dt className="text-adm-muted">{statusLabels.SOLD}</dt>
              <dd className="text-right font-semibold tabular-nums text-adm-neutral">{counts.sold}</dd>
              {counts.unreleased > 0 && (
                <>
                  <dt className="text-adm-muted">{t("units.unreleased")}</dt>
                  <dd className="text-right font-semibold tabular-nums text-adm-muted">{counts.unreleased}</dd>
                </>
              )}
            </dl>
          </section>

          {/* The plan editor is a step of this tab; this card is the way in
              from the tiles (tests/admin/project-workspace.test.ts). */}
          <Link
            href={`/${locale}/admin/projects/${project.id}/site-plan`}
            className="admin-card group block overflow-hidden p-0! transition-colors hover:border-adm-line-strong"
          >
            <span className="flex h-28 items-center justify-center overflow-hidden bg-adm-text/4">
              {project.masterPlanImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- admin thumbnail, see ProjectsTable
                <img src={project.masterPlanImageUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <MapIcon size={28} aria-hidden className="text-adm-muted" />
              )}
            </span>
            <span className="block px-4 py-3">
              <span className="flex items-center justify-between gap-2 text-sm font-semibold text-adm-text">
                {t("sitePlan.title")}
                <ArrowRight size={14} aria-hidden className="text-adm-muted transition-transform group-hover:translate-x-0.5" />
              </span>
              <span className="mt-0.5 block text-xs text-adm-muted">
                {t("units.tiles.traced", { traced: phaseUnits.length - untracedCount, total: phaseUnits.length })}
              </span>
            </span>
          </Link>

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
          exportCsv: t("units.exportCsv"),
          exportFailed: t("units.export.failed"),
          exportRateLimited: t("units.export.rateLimited"),
          exportTruncated: t("units.export.truncated"),
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

/** Available of what is on sale, as a ring. Server-rendered SVG; the
 *  number beside it carries the meaning, the ring is the glance. */
function AvailabilityRing({ available, total }: { available: number; total: number }) {
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const share = total === 0 ? 0 : available / total;
  return (
    <span className="relative inline-flex h-16 w-16 shrink-0 items-center justify-center">
      <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90" aria-hidden>
        <circle cx="32" cy="32" r={radius} fill="none" strokeWidth="6" className="stroke-adm-line" />
        <circle
          cx="32"
          cy="32"
          r={radius}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          className="stroke-adm-success"
          strokeDasharray={`${share * circumference} ${circumference}`}
        />
      </svg>
      <span className="absolute text-sm font-semibold tabular-nums text-adm-text">
        {available}
        <span className="text-[10px] font-normal text-adm-muted">/{total}</span>
      </span>
    </span>
  );
}
