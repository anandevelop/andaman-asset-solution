"use client";

/**
 * components/admin/UnitSitePlan.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The site plan on the admin Units page (Units.dc.html) — every plot in
 * the phase being viewed, coloured by sale status, click one to open it in
 * the detail panel beside it.
 *
 * TWO RENDERINGS, BECAUSE THERE ARE TWO REAL SITUATIONS.
 *
 * When the project has a master plan image and someone has traced plots on
 * it (/admin/projects/[id]/site-plan), this draws the real thing: the
 * image, with each traced boundary filled by status. When it does not —
 * which is every project until somebody does that tracing, and per
 * ProjectUnit.shapePoints' own comment that is currently all of them —
 * it falls back to a grid of numbered tiles carrying exactly the same
 * information minus the geography. The fallback is not a placeholder: a
 * sales manager reading "how much of phase 1 is left" gets the answer from
 * either one.
 *
 * Selection lives in the query string (?unit=…) rather than local state,
 * so the detail panel can be rendered on the server with the lead and
 * reservation data attached, and so a link to one plot is a link someone
 * can send.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import Link from "next/link";
import { Compass, ImageIcon, Loader2, Move } from "lucide-react";

export type UnitTile = {
  id: string;
  unitNumber: string;
  status: "AVAILABLE" | "RESERVED" | "SOLD";
  releasedForSale: boolean;
  shapePoints: { x: number; y: number }[] | null;
  positionXPercent: number | null;
  positionYPercent: number | null;
};

export type PhaseTab = {
  /** Null is the "this project isn't phased" group. */
  phase: number | null;
  label: string;
  count: number;
  allUnreleased: boolean;
};

type Props = {
  locale: string;
  projectId: string;
  units: UnitTile[];
  selectedUnitId: string | null;
  activePhase: number | null;
  phases: PhaseTab[];
  masterPlanImageUrl: string | null;
  counts: { available: number; reserved: number; sold: number; unreleased: number };
  labels: {
    title: string;
    changeImage: string;
    editPositions: string;
    north: string;
    available: string;
    reserved: string;
    sold: string;
    unreleased: string;
    /** "Phase 2 (8 plots) not released yet" — already formatted. */
    otherPhaseNotes: string[];
    /** Already formatted, or null when there is nothing to explain. */
    untracedNote: string | null;
    empty: string;
  };
};

/** Tile and polygon colours, shared so the plan and its legend agree. */
const TONE = {
  AVAILABLE: {
    tile: "border-emerald-500/50 bg-emerald-50 text-emerald-900 hover:border-emerald-500",
    swatch: "border-emerald-500/60 bg-emerald-50",
    fill: "fill-emerald-500/35 stroke-emerald-600",
  },
  RESERVED: {
    tile: "border-accent/60 bg-accent-50 text-accent-900 hover:border-accent",
    swatch: "border-accent/70 bg-accent-50",
    fill: "fill-accent/40 stroke-accent-700",
  },
  SOLD: {
    tile: "border-primary/15 bg-surface-muted text-ink-muted hover:border-primary/30",
    swatch: "border-primary/20 bg-surface-muted",
    fill: "fill-primary/25 stroke-primary/50",
  },
  /* Not one of the three sale statuses — a plot held back for a later
     release. Dashed so it reads as "not part of this yet" at a glance. */
  UNRELEASED: {
    tile: "border-dashed border-primary/25 bg-surface text-ink-muted/60 hover:border-primary/40",
    swatch: "border-dashed border-primary/30 bg-surface",
    fill: "fill-primary/10 stroke-primary/30",
  },
} as const;

function toneFor(unit: UnitTile) {
  return unit.releasedForSale ? TONE[unit.status] : TONE.UNRELEASED;
}

function pointsToAttr(points: { x: number; y: number }[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

export default function UnitSitePlan({
  locale,
  projectId,
  units,
  selectedUnitId,
  activePhase,
  phases,
  masterPlanImageUrl,
  counts,
  labels,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const setParam = (updates: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === "") params.delete(key);
      else params.set(key, value);
    }
    const query = params.toString();
    startTransition(() =>
      router.replace(`/${locale}/admin/projects/${projectId}/units${query ? `?${query}` : ""}`),
    );
  };

  const select = (unitId: string) => setParam({ unit: unitId });

  /*
    The traced plan is used only when *every* plot in the phase can be
    drawn on it — a shape, or at least an anchor point.

    "At least one is traced" was the first rule here and it was wrong: real
    projects have a handful of plots traced and the rest not (see
    ProjectUnit.shapePoints, which notes that seeded units all start
    unmapped), so that rule produced a plan showing four plots and silently
    omitting twenty-six. A plot missing from the plan is a plot nobody
    clicks. The grid always shows all of them, so it wins until the tracing
    is actually finished.
  */
  const placeable = units.filter(
    (unit) =>
      (unit.shapePoints && unit.shapePoints.length > 2) ||
      (unit.positionXPercent !== null && unit.positionYPercent !== null),
  );
  const showImage = Boolean(masterPlanImageUrl) && units.length > 0 && placeable.length === units.length;
  const untracedCount = units.length - placeable.length;

  return (
    <section className="admin-card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-primary">
          {labels.title}
          {pending && <Loader2 size={13} className="ml-2 inline animate-spin text-ink-muted" aria-hidden />}
        </h2>

        <div className="flex items-center gap-2">
          <Link
            href={`/${locale}/admin/projects/${projectId}/edit`}
            className="admin-btn-ghost py-1.5! text-xs"
          >
            <ImageIcon size={13} aria-hidden />
            {labels.changeImage}
          </Link>
          <Link
            href={`/${locale}/admin/projects/${projectId}/site-plan`}
            className="admin-btn-ghost py-1.5! text-xs"
          >
            <Move size={13} aria-hidden />
            {labels.editPositions}
          </Link>
        </div>
      </div>

      {phases.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {phases.map((tab) => (
            <button
              key={String(tab.phase)}
              type="button"
              onClick={() => setParam({ phase: tab.phase === null ? "none" : String(tab.phase), unit: "" })}
              aria-pressed={tab.phase === activePhase}
              className={[
                "rounded-xs border px-2.5 py-1 text-xs font-medium transition-colors",
                tab.phase === activePhase
                  ? "border-primary bg-primary text-white"
                  : "border-primary/15 text-ink-muted hover:text-primary",
              ].join(" ")}
            >
              {tab.label}
              <span className="ml-1.5 tabular-nums opacity-70">{tab.count}</span>
            </button>
          ))}
        </div>
      )}

      <div className="relative overflow-hidden rounded-xs bg-surface-muted/70 p-5">
        <span className="pointer-events-none absolute right-4 top-3 z-10 flex items-center gap-1 text-xs text-ink-muted">
          <Compass size={12} aria-hidden />
          {labels.north}
        </span>

        {units.length === 0 ? (
          <p className="py-10 text-center text-sm text-ink-muted">{labels.empty}</p>
        ) : showImage ? (
          <div className="relative mx-auto max-w-3xl">
            {/* Plain <img>, like every other admin preview — next/image
                would refuse a master plan hosted anywhere outside
                next.config.js's remotePatterns. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={masterPlanImageUrl!} alt="" className="w-full rounded-xs" />
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="absolute inset-0 h-full w-full"
            >
              {units.map((unit) => {
                const tone = toneFor(unit);
                const isSelected = unit.id === selectedUnitId;

                if (unit.shapePoints && unit.shapePoints.length > 2) {
                  return (
                    <polygon
                      key={unit.id}
                      points={pointsToAttr(unit.shapePoints)}
                      onClick={() => select(unit.id)}
                      className={`${tone.fill} cursor-pointer transition-opacity hover:opacity-80`}
                      strokeWidth={isSelected ? 1.2 : 0.4}
                      stroke={isSelected ? "currentColor" : undefined}
                    />
                  );
                }

                // No traced boundary: a pin at the stored anchor, when
                // there is one. A unit with neither is only reachable from
                // the table below — which is why the fallback grid exists.
                if (unit.positionXPercent === null || unit.positionYPercent === null) return null;

                return (
                  <circle
                    key={unit.id}
                    cx={unit.positionXPercent}
                    cy={unit.positionYPercent}
                    r={isSelected ? 2.2 : 1.6}
                    onClick={() => select(unit.id)}
                    className={`${tone.fill} cursor-pointer`}
                    strokeWidth={0.4}
                  />
                );
              })}
            </svg>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(74px,1fr))] gap-3">
            {units.map((unit) => {
              const tone = toneFor(unit);
              const isSelected = unit.id === selectedUnitId;

              return (
                <button
                  key={unit.id}
                  type="button"
                  onClick={() => select(unit.id)}
                  aria-pressed={isSelected}
                  className={[
                    "rounded-xs border-2 py-4 text-sm font-semibold transition-colors",
                    tone.tile,
                    isSelected ? "ring-2 ring-primary ring-offset-1" : "",
                  ].join(" ")}
                >
                  {unit.unitNumber}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div className="flex flex-wrap items-center gap-4 text-xs text-ink-muted">
          <span className="flex items-center gap-1.5">
            <span className={`h-3 w-3 rounded-xs border ${TONE.AVAILABLE.swatch}`} aria-hidden />
            {labels.available} <span className="font-semibold tabular-nums">{counts.available}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className={`h-3 w-3 rounded-xs border ${TONE.RESERVED.swatch}`} aria-hidden />
            {labels.reserved} <span className="font-semibold tabular-nums">{counts.reserved}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className={`h-3 w-3 rounded-xs border ${TONE.SOLD.swatch}`} aria-hidden />
            {labels.sold} <span className="font-semibold tabular-nums">{counts.sold}</span>
          </span>
          {counts.unreleased > 0 && (
            <span className="flex items-center gap-1.5">
              <span className={`h-3 w-3 rounded-xs border ${TONE.UNRELEASED.swatch}`} aria-hidden />
              {labels.unreleased}{" "}
              <span className="font-semibold tabular-nums">{counts.unreleased}</span>
            </span>
          )}
        </div>

        {labels.otherPhaseNotes.length > 0 && (
          <p className="text-xs text-ink-muted/80">{labels.otherPhaseNotes.join(" · ")}</p>
        )}
      </div>

      {/* Says why the master plan image is not the thing on screen, and
          points at the tool that would change that. Only shown when there
          is an image to be missing out on. */}
      {masterPlanImageUrl && untracedCount > 0 && labels.untracedNote && (
        <p className="text-xs text-ink-muted">
          {labels.untracedNote}{" "}
          <Link
            href={`/${locale}/admin/projects/${projectId}/site-plan`}
            className="font-medium text-accent-700 hover:text-accent-800"
          >
            {labels.editPositions}
          </Link>
        </p>
      )}
    </section>
  );
}
