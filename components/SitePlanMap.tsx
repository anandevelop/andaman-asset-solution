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
 * Each label is still sized off its own on-screen bounding box, not a
 * flat font-size, so a tiny plot doesn't get a number bigger than the
 * shape itself, and the box has to account for the current zoom level —
 * `transform.scale` (kept in sync by <TransformSync>, a required child of
 * TransformWrapper since the sync hook isn't callable from outside it)
 * and the container's actual rendered pixel size (via ResizeObserver,
 * since this is a responsive component) both feed into the label
 * geometry calculation below. MIN_FONT_PX/MAX_FONT_PX were both brought
 * down a notch from their original values for the same narrower-column
 * reason above — the map simply renders smaller on screen now, so the
 * whole label size range needed to shrink with it.
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
const POLYGON_FILL: Record<UnitStatus, string> = {
  AVAILABLE: "fill-green-500/40",
  RESERVED: "fill-accent/40",
  // Bright red, deliberately an alarm colour here — a sold-out plot is
  // the one status a buyer scanning the plan needs to rule out at a
  // glance, so this is the one status allowed to compete for attention.
  SOLD: "fill-red-500/90",
};
const POLYGON_STROKE: Record<UnitStatus, string> = {
  AVAILABLE: "stroke-green-500",
  RESERVED: "stroke-accent",
  SOLD: "stroke-red-600",
};
// SOLD's border reads heavier than the other two at the same width given
// how saturated the fill is, so it is a touch thinner (1.5px vs 2px) —
// still a literal on-screen pixel width at any zoom via vector-effect.
const POLYGON_STROKE_WIDTH: Record<UnitStatus, number> = {
  AVAILABLE: 2,
  RESERVED: 2,
  SOLD: 1.5,
};
const PIN_FILL: Record<UnitStatus, string> = {
  AVAILABLE: "fill-green-500",
  RESERVED: "fill-accent",
  SOLD: "fill-red-500",
};
const PILL_STYLE: Record<FilterValue, string> = {
  ALL: "border-primary/60",
  AVAILABLE: "border-green-500",
  RESERVED: "border-accent",
  SOLD: "border-red-600",
};

// Brought down from 8/16 — the map now typically renders in a narrower
// column (see the "Site Plan + Unit Status" section on the project page),
// so the whole label size range needed to shrink with it to keep numbers
// from crowding tightly packed rows of small units.
const MIN_FONT_PX = 6;
const MAX_FONT_PX = 13;
// Flat pixel distance below which two labels are considered likely to
// collide. Not exact (it doesn't know either label's actual rendered
// width), just the "simple fallback" the task asked for.
const CROWD_DISTANCE_PX = 22;
const CROWD_SHRINK_STEP_PX = 2;

function pointsToAttr(points: ShapePoint[]): string {
  return points.map((p) => `${p.x},${p.y}`).join(" ");
}

function average(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function polygonBounds(points: ShapePoint[]) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
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

  // Per-unit label geometry — on-screen box size, resulting font size,
  // and whether it clears the readability floor. Recomputed whenever the
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

      const bounds = polygonBounds(shapePoints);
      const boxWidthPx = (bounds.maxX - bounds.minX) * pxPerUnitX;
      const boxHeightPx = (bounds.maxY - bounds.minY) * pxPerUnitY;
      const minBoxPx = Math.min(boxWidthPx, boxHeightPx);

      const anchorX = unit.positionXPercent ?? average(shapePoints.map((p) => p.x));
      const anchorY = unit.positionYPercent ?? average(shapePoints.map((p) => p.y));

      geo.set(unit.id, {
        fontPx: Math.min(MAX_FONT_PX, Math.max(MIN_FONT_PX, minBoxPx * 0.35)),
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
      <div className="mb-5 flex flex-wrap gap-2.5">
        {pills.map((pill) => {
          const active = filter === pill.value;
          return (
            <button
              key={pill.value}
              type="button"
              onClick={() => setFilter(pill.value)}
              className={`rounded-full border-2 px-4 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? `${PILL_STYLE[pill.value]} bg-primary/[0.04] text-primary`
                  : "border-transparent bg-primary-900/[0.03] text-ink/60 hover:text-primary"
              }`}
            >
              {pill.label} ({pill.count})
            </button>
          );
        })}
      </div>

      {/* ── Map ─────────────────────────────────────────────────────── */}
      <div
        ref={containerRef}
        className="relative aspect-[1754/1241] w-full overflow-hidden border border-primary/10 bg-white"
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
                  time. */}
              <div className="pointer-events-none absolute inset-0">
                {units.map((unit) => {
                  const shapePoints = unit.shapePoints;
                  if (!shapePoints || shapePoints.length < 3) return null;

                  const geo = labelGeometry.get(unit.id);
                  const labelX = unit.positionXPercent ?? average(shapePoints.map((p) => p.x));
                  const labelY = unit.positionYPercent ?? average(shapePoints.map((p) => p.y));
                  const fontPx = geo?.fontPx ?? MAX_FONT_PX;
                  const dimmed = filter !== "ALL" && unit.status !== filter;

                  return (
                    <span
                      key={unit.id}
                      className="absolute font-sans font-bold leading-none text-white"
                      style={{
                        left: `${labelX}%`,
                        top: `${labelY}%`,
                        // translate centres the label on its anchor;
                        // scale is the inverse-zoom compensation from the
                        // comment above — combined in one transform so
                        // they apply as a single, predictable operation.
                        transform: `translate(-50%, -50%) scale(${1 / transform.scale})`,
                        fontSize: `${fontPx}px`,
                        opacity: dimmed ? 0.15 : 1,
                        // Thin dark outline for contrast against a light
                        // fill — the layered-shadow trick, since HTML text
                        // has no paint-order/stroke like SVG does.
                        textShadow:
                          "-0.5px -0.5px 0 rgba(15,23,42,0.85), 0.5px -0.5px 0 rgba(15,23,42,0.85), -0.5px 0.5px 0 rgba(15,23,42,0.85), 0.5px 0.5px 0 rgba(15,23,42,0.85)",
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
