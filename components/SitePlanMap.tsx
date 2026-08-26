"use client";

/**
 * components/SitePlanMap.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Interactive master plan — SVG polygon overlay on top of the site plan
 * image, colour-coded by unit status, with zoom/pan (react-zoom-pan-pinch)
 * and filter pills. Renders inside the "Site Plan + Unit Status" section
 * on the project page, in place of the previous plain <Image>.
 *
 * Coordinate system: the overlay <svg> uses viewBox="0 0 100 100" and the
 * image sits in a container whose aspect ratio is fixed to match the
 * actual site plan artwork (1754×1241 — see the three files under
 * public/site-plans/). Both unit.shapePoints and unit.positionX/YPercent
 * are already stored as 0-100 percentages of that box (see the field
 * comment on ProjectUnit.shapePoints in schema.prisma), so no runtime
 * conversion is needed here — the two just have to keep sharing the same
 * box. A future site-plan photo with a different aspect ratio would need
 * this container's aspect-[...] adjusted, the same pragmatic constraint
 * already documented for the Award trophy images and the project gallery
 * picks in prisma/seed.ts.
 *
 * Units with shapePoints render as filled polygons. Units with only
 * positionXPercent/Y (or none at all — nothing to plot) fall back to a
 * round pin marker so an unmapped unit doesn't just vanish from the map
 * the moment a project starts using this component. Units with neither
 * don't render on the map at all, but still count in the filter pills —
 * see the "N/Total units mapped" progress figure on the admin drawing
 * tool for the same distinction from the other side.
 *
 * ── Unit-number label sizing ─────────────────────────────────────────────
 * Every mapped unit always shows its number — there is no hidden-below-a-
 * size-threshold state any more. An earlier version hid a polygon's label
 * once its on-screen box fell under a ~24px floor and swapped in a
 * hover/tap tooltip instead, on a fine (mouse) pointer only; on a coarse
 * (touch) pointer, where there's no hover to reveal that tooltip with, it
 * always showed the number regardless of size. That mouse/touch split
 * stopped making sense once the project page started rendering this map
 * in a narrower column (see the "Site Plan + Unit Status" section on the
 * project page) rather than the full container width — plenty of desktop
 * visitors with a mouse now see the exact same undersized-on-first-paint
 * boxes touch users always did, and silently hiding their numbers behind
 * a hover they have no reason to try reads as "the number is just
 * missing," not "hover to reveal it." So the touch behaviour — always
 * show, floored at MIN_FONT_PX — is now what every pointer type gets.
 *
 * Every label now renders at the same flat size (FLAT_FONT_PX) rather
 * than one scaled to its own polygon's bounding box — the earlier
 * per-plot scaling made a big villa's number noticeably larger than the
 * townhome row's right next to it, which read as unpolished rather than
 * intentional once every label was made permanently visible (see above).
 * The box still has to account for the current zoom level —
 * `transform.scale` (kept in sync by <TransformSync>, a required child of
 * TransformWrapper since the sync hook isn't callable from outside it)
 * and the container's actual rendered pixel size (via ResizeObserver,
 * since this is a responsive component) both feed into the label
 * geometry calculation below, purely so the on-screen size stays literal
 * pixels at any zoom/viewport rather than for per-plot sizing.
 *
 * The label lives inside the same zoomed content as the polygon (so its
 * *position* just follows along for free via percentage placement), but
 * its `fontSize`/stroke-width are pre-divided by the current scale — so
 * that once the ancestor's CSS transform re-multiplies them back on
 * render, the result is the literal on-screen pixel size the geometry
 * calculation decided on, not that size multiplied by zoom a second time.
 *
 * A simple collision fallback (CROWD_DISTANCE_PX/CROWD_SHRINK_STEP_PX,
 * see labelGeometry below) still shrinks two labels a step further when
 * they land close together on screen — with every label always visible
 * now, tightly packed rows of small units are exactly where that matters
 * most.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  TransformWrapper,
  TransformComponent,
  useControls,
  useTransformEffect,
} from "react-zoom-pan-pinch";
import { Maximize, Minus, Plus, RotateCcw } from "lucide-react";
import type { ProjectUnitSummary, UnitStatus, ShapePoint } from "@/lib/projects";

type Labels = {
  all: string;
  available: string;
  reserved: string;
  sold: string;
  zoomIn: string;
  zoomOut: string;
  fullscreen: string;
  resetView: string;
};

type Props = {
  projectName: string;
  masterPlanImageUrl: string;
  units: ProjectUnitSummary[];
  labels: Labels;
};

type FilterValue = "ALL" | UnitStatus;
type Transform = { scale: number; positionX: number; positionY: number };

// Tailwind classes are looked up whole, never string-concatenated, so the
// JIT compiler can see every one of them statically (same convention as
// UNIT_STATUS_STYLE/DOT on the project page).
//
// Palette matches the muted emerald/accent-gold/ink treatment the project
// page's own legend and unit chip list already use (UNIT_STATUS_STYLE in
// projects/[slug]/page.tsx) — this used to be stock Tailwind green-500/
// red-500, which read as a generic web-template map dropped into an
// otherwise navy-and-gold site. SOLD in particular was a saturated alarm
// red; it's now the same "faded out of the running" ink tone the chip
// list already uses for a sold unit, which still reads clearly against
// the lighter available/reserved plots without breaking the brand.
const POLYGON_FILL: Record<UnitStatus, string> = {
  AVAILABLE: "fill-emerald-500/30",
  RESERVED: "fill-accent/40",
  SOLD: "fill-ink/40",
};
const POLYGON_STROKE: Record<UnitStatus, string> = {
  AVAILABLE: "stroke-emerald-600",
  RESERVED: "stroke-accent",
  SOLD: "stroke-ink/60",
};
const POLYGON_STROKE_WIDTH: Record<UnitStatus, number> = {
  AVAILABLE: 2,
  RESERVED: 2,
  SOLD: 1.5,
};
const PIN_FILL: Record<UnitStatus, string> = {
  AVAILABLE: "fill-emerald-500",
  RESERVED: "fill-accent",
  SOLD: "fill-ink/60",
};

// Small dot rendered inside each filter pill, so status is still readable
// at a glance once the pill itself switched to the site's standard
// solid-navy-when-active chip (see ProjectFilterBar's `chip()`) rather
// than a colour-coded border.
const STATUS_DOT: Record<FilterValue, string> = {
  ALL: "bg-primary",
  AVAILABLE: "bg-emerald-500",
  RESERVED: "bg-accent",
  SOLD: "bg-ink/50",
};

// Every label renders at the same flat size now, rather than scaled to
// its own polygon's on-screen box — the previous per-plot scaling made
// adjacent unit numbers look randomly mismatched in size (a big villa
// plot's "R01" noticeably larger than the townhome row's "R11" right next
// to it), which read as unpolished rather than intentional. The only
// thing that still shrinks a label now is the crowd-collision fallback
// below, for the genuinely tight rows where two flat-size badges would
// overlap.
const FLAT_FONT_PX = 10;
const MIN_FONT_PX = 7;
// Flat pixel distance below which two labels are considered likely to
// collide. Not exact (it doesn't know either label's actual rendered
// width), just the "simple fallback" the task asked for.
const CROWD_DISTANCE_PX = 22;
const CROWD_SHRINK_STEP_PX = 1.5;

function pointsToAttr(points: ShapePoint[]): string {
  return points.map((p) => `${p.x},${p.y}`).join(" ");
}

function average(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Keeps `transform` in sync with react-zoom-pan-pinch's own state —
 *  renders nothing, just a hook carrier that has to live inside
 *  <TransformWrapper> to call useTransformEffect at all. */
function TransformSync({ onChange }: { onChange: (t: Transform) => void }) {
  useTransformEffect(({ state }) => {
    onChange({ scale: state.scale, positionX: state.positionX, positionY: state.positionY });
  });
  return null;
}

/** +/- / reset / fullscreen — a child of TransformWrapper since useControls()
 *  needs the pinch-zoom context it provides. */
function ZoomControls({
  labels,
  onFullscreen,
}: {
  labels: Labels;
  onFullscreen: () => void;
}) {
  const { zoomIn, zoomOut, resetTransform } = useControls();

  const buttonClass =
    "flex h-9 w-9 items-center justify-center rounded-sm border border-primary/10 bg-white text-primary shadow-card transition-colors hover:bg-primary/5";

  return (
    <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-2">
      <button
        type="button"
        aria-label={labels.zoomIn}
        onClick={() => zoomIn()}
        className={buttonClass}
      >
        <Plus size={16} aria-hidden />
      </button>
      <button
        type="button"
        aria-label={labels.zoomOut}
        onClick={() => zoomOut()}
        className={buttonClass}
      >
        <Minus size={16} aria-hidden />
      </button>
      <button
        type="button"
        aria-label={labels.resetView}
        onClick={() => resetTransform()}
        className={buttonClass}
      >
        <RotateCcw size={15} aria-hidden />
      </button>
      <button
        type="button"
        aria-label={labels.fullscreen}
        onClick={onFullscreen}
        className={buttonClass}
      >
        <Maximize size={15} aria-hidden />
      </button>
    </div>
  );
}

export default function SitePlanMap({
  projectName,
  masterPlanImageUrl,
  units,
  labels,
}: Props) {
  const [filter, setFilter] = useState<FilterValue>("ALL");
  const containerRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState<Transform>({ scale: 1, positionX: 0, positionY: 0 });
  const [size, setSize] = useState({ width: 0, height: 0 });

  // The container's own rendered box never moves/scales (react-zoom-pan-
  // pinch only ever transforms its *content*), so this is a stable base
  // for converting viewBox percentages into real on-screen pixels.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const counts = units.reduce(
    (acc, u) => {
      acc[u.status] += 1;
      return acc;
    },
    { AVAILABLE: 0, RESERVED: 0, SOLD: 0 } as Record<UnitStatus, number>,
  );

  const pills: { value: FilterValue; label: string; count: number }[] = [
    { value: "ALL", label: labels.all, count: units.length },
    { value: "AVAILABLE", label: labels.available, count: counts.AVAILABLE },
    { value: "RESERVED", label: labels.reserved, count: counts.RESERVED },
    { value: "SOLD", label: labels.sold, count: counts.SOLD },
  ];

  const handleFullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      el.requestFullscreen?.();
    }
  };

  // Per-unit label geometry — on-screen anchor position, plus the flat
  // font size adjusted only for local crowding. Recomputed whenever the
  // shapes, the container size, or the zoom scale change.
  const labelGeometry = useMemo(() => {
    const geo = new Map<string, { fontPx: number; anchorXPx: number; anchorYPx: number }>();

    // Not measured yet (first paint, before the ResizeObserver fires) —
    // default to "show everything at max size" rather than flashing
    // every label hidden for a frame.
    if (size.width === 0 || size.height === 0) return geo;

    const pxPerUnitX = (size.width / 100) * transform.scale;
    const pxPerUnitY = (size.height / 100) * transform.scale;

    for (const unit of units) {
      const shapePoints = unit.shapePoints;
      if (!shapePoints || shapePoints.length < 3) continue;

      const anchorX = unit.positionXPercent ?? average(shapePoints.map((p) => p.x));
      const anchorY = unit.positionYPercent ?? average(shapePoints.map((p) => p.y));

      // Every label starts at the same flat size (FLAT_FONT_PX) — see the
      // constant's comment for why this replaced the old per-plot,
      // box-size-proportional formula. Only the crowd-collision pass
      // below shrinks a label from here.
      geo.set(unit.id, {
        fontPx: FLAT_FONT_PX,
        anchorXPx: anchorX * pxPerUnitX,
        anchorYPx: anchorY * pxPerUnitY,
      });
    }

    // Simple collision fallback: two labels whose anchors land within a
    // flat pixel distance of each other both drop a step. Not a real
    // layout solver — just enough to stop the obvious overlaps.
    const ids = [...geo.keys()];
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const a = geo.get(ids[i])!;
        const b = geo.get(ids[j])!;

        const dx = a.anchorXPx - b.anchorXPx;
        const dy = a.anchorYPx - b.anchorYPx;
        if (Math.sqrt(dx * dx + dy * dy) < CROWD_DISTANCE_PX) {
          a.fontPx = Math.max(MIN_FONT_PX, a.fontPx - CROWD_SHRINK_STEP_PX);
          b.fontPx = Math.max(MIN_FONT_PX, b.fontPx - CROWD_SHRINK_STEP_PX);
        }
      }
    }

    return geo;
  }, [units, size, transform.scale]);

  return (
    <div>
      {/* ── Filter pills ────────────────────────────────────────────── */}
      {/* Same solid-navy-when-active chip language as ProjectFilterBar's
          chip() on /projects, rather than the old colour-coded-border
          treatment — a status dot inside each pill still carries the
          colour meaning, so nothing is lost switching to the shared
          convention. */}
      <div className="mb-5 flex flex-wrap gap-2.5">
        {pills.map((pill) => {
          const active = filter === pill.value;
          return (
            <button
              key={pill.value}
              type="button"
              onClick={() => setFilter(pill.value)}
              aria-pressed={active}
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-medium uppercase tracking-wide transition-colors ${
                active
                  ? "border-primary bg-primary text-white"
                  : "border-primary/15 text-ink/70 hover:border-primary/40 hover:text-primary"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${active ? "bg-white" : STATUS_DOT[pill.value]}`}
                aria-hidden
              />
              {pill.label} ({pill.count})
            </button>
          );
        })}
      </div>

      {/* ── Map ─────────────────────────────────────────────────────── */}
      {/* rounded-sm + shadow-card matches every other framed white panel
          on the site (news/event cards, the fallback master-plan block
          above) — this was previously flat square corners with no
          elevation, which read as a generic template widget rather than
          part of the site. */}
      <div
        ref={containerRef}
        className="relative aspect-[1754/1241] w-full overflow-hidden rounded-sm border border-primary/10 bg-white shadow-card"
      >
        <TransformWrapper minScale={1} maxScale={6} centerOnInit>
          <TransformSync onChange={setTransform} />
          <ZoomControls labels={labels} onFullscreen={handleFullscreen} />

          <TransformComponent
            wrapperClass="!w-full !h-full"
            contentClass="!w-full !h-full"
          >
            <div className="relative h-full w-full">
              {/* eslint-disable-next-line @next/next/no-img-element -- inside
                  a react-zoom-pan-pinch transform target; next/image's fill
                  layout fights the library's own width/height measuring. */}
              <img
                src={masterPlanImageUrl}
                alt={`${projectName} — site plan`}
                className="h-full w-full object-cover"
                draggable={false}
              />

              <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                className="absolute inset-0 h-full w-full"
              >
                {units.map((unit) => {
                  const dimmed = filter !== "ALL" && unit.status !== filter;
                  const opacity = dimmed ? 0.15 : 1;
                  // Assigned to a local so TS narrows it inside the .reduce
                  // callbacks below — narrowing a property access like
                  // `unit.shapePoints` doesn't carry into a nested function
                  // scope the way narrowing a plain variable does.
                  const shapePoints = unit.shapePoints;

                  if (shapePoints && shapePoints.length >= 3) {
                    // The unit-number label itself is rendered in the HTML
                    // layer below, not here — see that layer's header
                    // comment for why an SVG <text> can't carry a literal
                    // pixel font-size inside a viewBox="0 0 100 100".
                    return (
                      <polygon
                        key={unit.id}
                        points={pointsToAttr(shapePoints)}
                        style={{ opacity }}
                        className={`${POLYGON_FILL[unit.status]} ${POLYGON_STROKE[unit.status]}`}
                        /* vector-effect keeps this a literal on-screen
                           pixel border at any zoom level, per spec,
                           rather than N viewBox units (which would look
                           wildly thick — the box is only 100 units
                           wide). */
                        strokeWidth={POLYGON_STROKE_WIDTH[unit.status]}
                        vectorEffect="non-scaling-stroke"
                      />
                    );
                  }

                  if (unit.positionXPercent !== null && unit.positionYPercent !== null) {
                    return (
                      <g key={unit.id} style={{ opacity }}>
                        <circle
                          cx={unit.positionXPercent}
                          cy={unit.positionYPercent}
                          r={2}
                          className={PIN_FILL[unit.status]}
                          stroke="white"
                          strokeWidth={0.4}
                          vectorEffect="non-scaling-stroke"
                        />
                        <text
                          x={unit.positionXPercent}
                          y={unit.positionYPercent - 3}
                          textAnchor="middle"
                          className="fill-white font-sans text-[2.5px] font-bold"
                          style={{
                            paintOrder: "stroke",
                            stroke: "rgba(15,23,42,0.85)",
                            strokeWidth: 0.4,
                          }}
                        >
                          {unit.unitNumber}
                        </text>
                      </g>
                    );
                  }

                  return null;
                })}
              </svg>

              {/* Unit-number labels — plain HTML, not SVG <text>. Root
                  cause of the earlier oversized-label bug: an SVG
                  <text>'s `font-size` presentation attribute, when given a
                  bare number (no unit), is resolved in the SVG's own user/
                  viewBox coordinate space — 1 "unit" here is 1/100th of
                  the whole image, so a "14" meant to be 14px rendered as
                  14% of the image width instead, tens of times too big.
                  A plain HTML element has no such ambiguity: `fontSize`
                  set in real CSS px is real CSS px, full stop.
                  This layer is positioned with the same left/top-percent
                  scheme as the polygons above and sits inside the very
                  same <TransformComponent>, so react-zoom-pan-pinch's
                  pan/zoom transform moves both layers together for free —
                  no separate position math needed here. Only the already-
                  computed `fontPx` (which itself already reacts to the
                  current zoom scale, see labelGeometry above) needs an
                  inverse `scale(1/zoom)` on each label so the ancestor's
                  own zoom transform doesn't apply on top of it a second
                  time.

                  Rendered as a small white badge rather than bare
                  coloured-outline text — the badge reads the same crisp
                  size against every fill colour (emerald, gold, or ink)
                  instead of relying on a text-shadow outline that looked
                  fine on the old saturated red but washed out against the
                  new, more muted palette. */}
              <div className="pointer-events-none absolute inset-0">
                {units.map((unit) => {
                  const shapePoints = unit.shapePoints;
                  if (!shapePoints || shapePoints.length < 3) return null;

                  const geo = labelGeometry.get(unit.id);
                  const labelX = unit.positionXPercent ?? average(shapePoints.map((p) => p.x));
                  const labelY = unit.positionYPercent ?? average(shapePoints.map((p) => p.y));
                  const fontPx = geo?.fontPx ?? FLAT_FONT_PX;
                  const dimmed = filter !== "ALL" && unit.status !== filter;

                  return (
                    <span
                      key={unit.id}
                      className="absolute whitespace-nowrap rounded-sm border border-primary/10 bg-white/95 font-sans font-semibold leading-none text-primary shadow-sm"
                      style={{
                        left: `${labelX}%`,
                        top: `${labelY}%`,
                        // translate centres the label on its anchor;
                        // scale is the inverse-zoom compensation from the
                        // comment above — combined in one transform so
                        // they apply as a single, predictable operation.
                        transform: `translate(-50%, -50%) scale(${1 / transform.scale})`,
                        fontSize: `${fontPx}px`,
                        padding: `${fontPx * 0.15}px ${fontPx * 0.35}px`,
                        opacity: dimmed ? 0.15 : 1,
                      }}
                    >
                      {unit.unitNumber}
                    </span>
                  );
                })}
              </div>
            </div>
          </TransformComponent>
        </TransformWrapper>
      </div>
    </div>
  );
}
