"use client";

/**
 * components/SitePlanMap.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The whole "Site Plan + Unit Status" section body: phase tabs, the status
 * filter pills, the interactive master plan, and the summary bar
 * underneath it — one client component rather than four, because the
 * phase a visitor has selected has to dim the same map the status filter
 * dims, and the summary bar's counts have to react to both. Splitting that
 * state across a server-rendered wrapper and a client map would mean
 * either lifting the map's own zoom/pan state up too (react-zoom-pan-
 * pinch's context has to wrap whatever reads it) or duplicating the dim
 * logic in two places; keeping everything here keeps it in one.
 *
 * The map itself is unchanged from the previous version: SVG polygon
 * overlay, zoom/pan (react-zoom-pan-pinch), flat-size unit-number labels
 * with a crowd-collision shrink pass. See the sections below for what
 * that part still does — this header now covers the section as a whole.
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
 * stopped making sense once the map started rendering at the section's
 * full container width (see below) rather than a narrower column — plenty
 * of desktop visitors with a mouse now see the exact same undersized-on-
 * first-paint boxes touch users always did, and silently hiding their
 * numbers behind a hover they have no reason to try reads as "the number
 * is just missing," not "hover to reveal it." So the touch behaviour —
 * always show, floored at MIN_FONT_PX — is now what every pointer type
 * gets.
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
 * A size-aware collision fallback (CROWD_SHRINK_STEP_PX/CROWD_SHRINK_ROUNDS,
 * see labelGeometry below) still shrinks two labels a step further when
 * their *estimated badge widths* — not just a flat distance — would
 * overlap. With every label always visible now, tightly packed rows of
 * small units (and narrow, mobile-width containers, where the whole plan
 * has much less on-screen room to begin with) are exactly where that
 * matters most; the initial zoom is also higher on narrow viewports (see
 * MOBILE_INITIAL_SCALE below) so there's more physical room per badge
 * before the shrink pass even has to act.
 *
 * ── Full-width layout, phases, and the summary bar ───────────────────────
 * This used to render at ~58% width beside a scrollable column of unit-
 * number chips grouped by type. That list is gone: it duplicated the map
 * it sat next to (the same unit, twice, in two visual languages) without
 * telling a visitor anything the map's own colours and a plain count
 * couldn't. The map now takes the section's full width, and what used to
 * be "which units exist" is now "how many are left" — the summary bar
 * below the map, which is the thing a buyer scanning the plan actually
 * wants to know.
 *
 * Phase tabs are new. `ProjectUnit.phase` lets a development release in
 * stages, and a project using it wants its plan filterable by stage the
 * same way the status pills already filter by AVAILABLE/RESERVED/SOLD —
 * both dim non-matching units rather than removing them, so the plan's
 * overall shape stays legible while a visitor narrows what they're
 * looking at. `phases` arrives empty for the (majority) single-release
 * projects, and the tab row simply does not render rather than showing
 * one meaningless "Phase 1" pill.
 *
 * The summary bar's counts are always scoped to the *phase* filter (never
 * to the status filter, which would make "Available: 5" and "Reserved: 2"
 * add up to something other than the total) — see the render below for
 * exactly which units feed it.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  TransformWrapper,
  TransformComponent,
  useControls,
  useTransformEffect,
} from "react-zoom-pan-pinch";
import { Maximize, Minus, Plus, RotateCcw } from "lucide-react";
import type { ProjectUnitSummary, UnitStatus, ShapePoint } from "@/lib/projects";

/** WhatsApp's own glyph. Inline rather than from lucide, which has no
 *  brand marks — same copy as SalesTeamSection.tsx's, and for the same
 *  reason: the whole point of this button is that it looks like the app
 *  it hands you to. */
function WhatsAppGlyph({ size = 14 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      className="shrink-0"
      aria-hidden
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  );
}

type Labels = {
  all: string;
  available: string;
  reserved: string;
  sold: string;
  zoomIn: string;
  zoomOut: string;
  fullscreen: string;
  resetView: string;
  allPhases: string;
  askDetails: string;
  unitsSuffix: string;
};

export type PhaseOption = { value: number; label: string };

type Props = {
  projectName: string;
  /** Null when no master plan photo has been uploaded yet — the map,
   *  zoom controls and "updated" chip are skipped entirely in that case,
   *  and only the summary bar renders (see the render below). */
  masterPlanImageUrl: string | null;
  units: ProjectUnitSummary[];
  labels: Labels;
  /** Ascending, translated — empty on a project sold as one release. */
  phases: PhaseOption[];
  /** Pre-built server-side (locale-aware date formatting, the "updated
   *  {date}" sentence with its date already bolded) — null hides the
   *  chip entirely, which is also what happens when the last edit is
   *  over 30 days old; see the page's own comment on that rule. */
  updated: { full: ReactNode; date: string } | null;
  whatsappUrl: string;
};

type FilterValue = "ALL" | UnitStatus;
type PhaseValue = "ALL" | number;
type Transform = { scale: number; positionX: number; positionY: number };

// Tailwind classes are looked up whole, never string-concatenated, so the
// JIT compiler can see every one of them statically (same convention as
// UNIT_STATUS_STYLE/DOT on the project page).
//
// Palette matches the muted emerald/accent-gold treatment the project
// page's own legend and unit chip list already use (UNIT_STATUS_STYLE in
// projects/[slug]/page.tsx) — this used to be stock Tailwind green-500,
// which read as a generic web-template map dropped into an otherwise
// navy-and-gold site. SOLD is a deliberate exception to the muted
// treatment (per explicit request): a sold-out plot is the one status a
// buyer scanning the plan needs to rule out at a glance, so it keeps a
// red — just Tailwind's red-500/600 rather than a near-opaque alarm red.
const POLYGON_FILL: Record<UnitStatus, string> = {
  AVAILABLE: "fill-emerald-500/30",
  RESERVED: "fill-accent/40",
  SOLD: "fill-red-500/45",
};
const POLYGON_STROKE: Record<UnitStatus, string> = {
  AVAILABLE: "stroke-emerald-600",
  RESERVED: "stroke-accent",
  SOLD: "stroke-red-600",
};
const POLYGON_STROKE_WIDTH: Record<UnitStatus, number> = {
  AVAILABLE: 2,
  RESERVED: 2,
  SOLD: 1.5,
};
const PIN_FILL: Record<UnitStatus, string> = {
  AVAILABLE: "fill-emerald-500",
  RESERVED: "fill-accent",
  SOLD: "fill-red-500",
};

// Small dot rendered inside each filter pill, so status is still readable
// at a glance once the pill itself switched to the site's standard
// solid-navy-when-active chip (see ProjectFilterBar's `chip()`) rather
// than a colour-coded border. Also reused, unchanged, for the summary
// bar's own status dots below.
const STATUS_DOT: Record<FilterValue, string> = {
  ALL: "bg-primary",
  AVAILABLE: "bg-emerald-500",
  RESERVED: "bg-accent",
  SOLD: "bg-red-500",
};

// The summary bar's proportion strip under each status figure — solid,
// not the polygon's translucent fill, since a 4px sliver reads as a
// smudge rather than a colour at that low an opacity.
const STATUS_BAR_FILL: Record<UnitStatus, string> = {
  AVAILABLE: "bg-emerald-500",
  RESERVED: "bg-accent",
  SOLD: "bg-red-500",
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
const MIN_FONT_PX = 6;
// Per-character/padding multipliers mirroring the actual badge CSS below
// (fontSize * 0.35 horizontal padding, roughly 0.6em per character) — used
// to estimate each badge's on-screen half-width for collision checking.
// Approximate on purpose: real text metrics aren't worth measuring here,
// this just has to be close enough that two badges stop fully overlapping.
const CHAR_WIDTH_EM = 0.6;
const PAD_X_EM = 0.35;
const CROWD_SHRINK_STEP_PX = 1;
// How many shrink rounds to run — since a badge's own estimated size
// feeds back into the next round's collision test, one pass isn't enough
// for a tight cluster of 3+ units (a mobile-width map with a dense row of
// townhomes easily has that). Five rounds converges well before it'd
// matter that this isn't a real physics solver.
const CROWD_SHRINK_ROUNDS = 5;

// `centerOnInit` fits the *entire* site plan into whatever width the
// container has at scale 1 — on a ~360-430px phone viewport that squeezes
// every unit down to a fraction of its desktop on-screen size before the
// collision pass even runs, which is what actually made numbers vanish
// under one another. Starting mobile viewports pre-zoomed in gives every
// badge real room; a visitor can still pinch/tap "-" out to the full plan.
const MOBILE_BREAKPOINT_PX = 640; // matches Tailwind's `sm`
const MOBILE_INITIAL_SCALE = 1.6;

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
    "flex h-9 w-9 items-center justify-center rounded-xs border border-primary/10 bg-white text-primary shadow-card transition-colors hover:bg-primary/5";

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

/**
 * Available / Reserved / Sold + the WhatsApp CTA — the map's replacement
 * for the old unit-chip list. Renders on its own (no map, no tabs, no
 * pills) when the project has no master plan photo yet, and underneath
 * the map otherwise; either way its counts come from whichever units the
 * caller hands it, already narrowed to the selected phase.
 */
function SummaryBar({
  units,
  labels,
  whatsappUrl,
  attached,
}: {
  units: ProjectUnitSummary[];
  labels: Labels;
  whatsappUrl: string;
  /** True when rendered directly under the map frame — drops its own top
   *  corners/border so the two read as one continuous card. */
  attached: boolean;
}) {
  const t = useTranslations("projects");

  const total = units.length;
  const counts = units.reduce(
    (acc, u) => {
      acc[u.status] += 1;
      return acc;
    },
    { AVAILABLE: 0, RESERVED: 0, SOLD: 0 } as Record<UnitStatus, number>,
  );

  const cells: { status: UnitStatus; label: string }[] = [
    { status: "AVAILABLE", label: labels.available },
    { status: "RESERVED", label: labels.reserved },
    { status: "SOLD", label: labels.sold },
  ];

  return (
    <div
      className={`grid grid-cols-1 border border-primary/10 bg-white sm:grid-cols-4 ${
        attached ? "rounded-b-xs border-t-0" : "rounded-xs shadow-card"
      }`}
    >
      {cells.map(({ status, label }) => {
        const count = counts[status];
        const share = total > 0 ? Math.round((count / total) * 100) : 0;

        return (
          <div
            key={status}
            className="border-b border-primary/10 p-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"
          >
            <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink/60">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[status]}`} aria-hidden />
              {label}
            </span>
            <p className="mt-2 flex items-baseline gap-1.5">
              <span className="text-2xl font-light text-primary">{count}</span>
              <span className="text-xs text-ink/50">
                / {total} {labels.unitsSuffix}
              </span>
            </p>
            <span className="mt-2.5 block h-1 w-full overflow-hidden rounded-full bg-primary/8">
              <span
                className={`block h-full rounded-full ${STATUS_BAR_FILL[status]}`}
                style={{ width: `${share}%` }}
              />
            </span>
          </div>
        );
      })}

      <div className="flex flex-col justify-center gap-3 bg-primary p-4 text-white">
        <p className="text-sm leading-snug">
          {t("sitePlanRemaining", { count: counts.AVAILABLE })}
        </p>
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 rounded-xs bg-[#25D366] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#1DA851]"
        >
          <WhatsAppGlyph size={15} />
          {labels.askDetails}
        </a>
      </div>
    </div>
  );
}

export default function SitePlanMap({
  projectName,
  masterPlanImageUrl,
  units,
  labels,
  phases,
  updated,
  whatsappUrl,
}: Props) {
  const [statusFilter, setStatusFilter] = useState<FilterValue>("ALL");
  const [phaseFilter, setPhaseFilter] = useState<PhaseValue>("ALL");
  const containerRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState<Transform>({ scale: 1, positionX: 0, positionY: 0 });
  const [size, setSize] = useState({ width: 0, height: 0 });

  // Lazy initializer so this only ever reads window.innerWidth once, at
  // mount — it feeds TransformWrapper's `initialScale`, which is itself a
  // one-time starting value, so there's nothing to keep in sync on resize
  // (a phone rotated mid-session keeps its original zoom, same as any
  // other "initial" prop would).
  const [initialScale] = useState(() =>
    typeof window !== "undefined" && window.innerWidth < MOBILE_BREAKPOINT_PX
      ? MOBILE_INITIAL_SCALE
      : 1,
  );

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

  // Phase always narrows first — the summary bar's counts, the map's
  // dimming, and the status pills' own counts all read from this rather
  // than the raw `units` prop, so "5 available" and the map's dimmed-out
  // units can never disagree about which phase they're describing.
  const phaseUnits = useMemo(
    () => (phaseFilter === "ALL" ? units : units.filter((u) => u.phase === phaseFilter)),
    [units, phaseFilter],
  );

  const counts = phaseUnits.reduce(
    (acc, u) => {
      acc[u.status] += 1;
      return acc;
    },
    { AVAILABLE: 0, RESERVED: 0, SOLD: 0 } as Record<UnitStatus, number>,
  );

  const statusPills: { value: FilterValue; label: string; count: number }[] = [
    { value: "ALL", label: labels.all, count: phaseUnits.length },
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
    const geo = new Map<
      string,
      { fontPx: number; anchorXPx: number; anchorYPx: number; chars: number }
    >();

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
        chars: unit.unitNumber.length,
      });
    }

    // Collision fallback: each badge's on-screen half-width is estimated
    // from its *current* fontPx (see CHAR_WIDTH_EM/PAD_X_EM above, mirroring
    // the real badge CSS), and two labels whose anchors are closer together
    // than their combined half-widths both drop a step. Run in several
    // rounds rather than one pass — as a badge shrinks its estimated half-
    // width shrinks too, which can resolve a pair the first round's larger
    // estimate still flagged, and a unit sitting between two crowded
    // neighbours needs more than one round to settle. This is what a mobile-
    // width map needs that a single flat-distance pass didn't give: dense
    // rows of small units (adjacent townhomes) sit close enough on a narrow
    // screen that solid-background badges — unlike the old plain outlined
    // text — will otherwise fully paint over one another rather than just
    // visually blend, which is what made numbers look like they'd vanished.
    const ids = [...geo.keys()];
    for (let round = 0; round < CROWD_SHRINK_ROUNDS; round += 1) {
      let shrankAny = false;

      for (let i = 0; i < ids.length; i += 1) {
        for (let j = i + 1; j < ids.length; j += 1) {
          const a = geo.get(ids[i])!;
          const b = geo.get(ids[j])!;

          const dx = a.anchorXPx - b.anchorXPx;
          const dy = a.anchorYPx - b.anchorYPx;
          const distance = Math.sqrt(dx * dx + dy * dy);

          const halfWidth = (g: typeof a) =>
            (g.fontPx * CHAR_WIDTH_EM * g.chars) / 2 + g.fontPx * PAD_X_EM;
          const safeDistance = halfWidth(a) + halfWidth(b);

          if (distance < safeDistance && (a.fontPx > MIN_FONT_PX || b.fontPx > MIN_FONT_PX)) {
            a.fontPx = Math.max(MIN_FONT_PX, a.fontPx - CROWD_SHRINK_STEP_PX);
            b.fontPx = Math.max(MIN_FONT_PX, b.fontPx - CROWD_SHRINK_STEP_PX);
            shrankAny = true;
          }
        }
      }

      if (!shrankAny) break;
    }

    return geo;
  }, [units, size, transform.scale]);

  // No photo yet: the map, its zoom controls and the "updated" chip all
  // have nothing to sit on top of, and phase/status filtering would be
  // controls with no visual to act on — so none of it renders, just the
  // plain counts. See the file header's "Full-width layout" section.
  if (!masterPlanImageUrl) {
    return <SummaryBar units={units} labels={labels} whatsappUrl={whatsappUrl} attached={false} />;
  }

  return (
    <div>
      {/* ── Phase tabs ──────────────────────────────────────────────── */}
      {phases.length > 1 && (
        <div
          role="tablist"
          aria-label={labels.allPhases}
          className="mb-4 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] scrollbar-none [&::-webkit-scrollbar]:hidden"
        >
          {[{ value: "ALL" as PhaseValue, label: labels.allPhases }, ...phases].map((tab) => {
            const active = phaseFilter === tab.value;
            const count =
              tab.value === "ALL" ? units.length : units.filter((u) => u.phase === tab.value).length;

            return (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setPhaseFilter(tab.value)}
                className={`shrink-0 rounded-full border px-4 py-1.5 text-xs font-medium uppercase tracking-wide transition-colors ${
                  active
                    ? "border-primary bg-primary text-white"
                    : "border-primary/15 text-ink/70 hover:border-primary/40 hover:text-primary"
                }`}
              >
                {tab.label} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* ── Status filter pills ─────────────────────────────────────── */}
      {/* Same solid-navy-when-active chip language as ProjectFilterBar's
          chip() on /projects, rather than the old colour-coded-border
          treatment — a status dot inside each pill still carries the
          colour meaning, so nothing is lost switching to the shared
          convention. */}
      <div className="mb-5 flex flex-wrap gap-2.5">
        {statusPills.map((pill) => {
          const active = statusFilter === pill.value;
          return (
            <button
              key={pill.value}
              type="button"
              onClick={() => setStatusFilter(pill.value)}
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

      {/* ── Map + summary bar, one continuous card ───────────────────── */}
      <div className="overflow-hidden rounded-xs border border-primary/10 shadow-card">
        <div
          ref={containerRef}
          className="relative aspect-1754/1241 w-full overflow-hidden bg-white"
        >
          <TransformWrapper minScale={1} maxScale={6} initialScale={initialScale} centerOnInit>
            <TransformSync onChange={setTransform} />
            <ZoomControls labels={labels} onFullscreen={handleFullscreen} />

            <TransformComponent wrapperClass="w-full! h-full!" contentClass="w-full! h-full!">
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
                    const dimmed =
                      (statusFilter !== "ALL" && unit.status !== statusFilter) ||
                      (phaseFilter !== "ALL" && unit.phase !== phaseFilter);
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
                    const dimmed =
                      (statusFilter !== "ALL" && unit.status !== statusFilter) ||
                      (phaseFilter !== "ALL" && unit.phase !== phaseFilter);

                    return (
                      <span
                        key={unit.id}
                        className="absolute whitespace-nowrap rounded-xs border border-primary/10 bg-white/95 font-sans font-semibold leading-none text-primary shadow-xs"
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

          {/* ── "Updated" chip ──────────────────────────────────────── */}
          {/* Outside <TransformComponent> — it has to sit still while the
              plan zooms and pans underneath it, not travel with it — but
              still inside this `relative` frame, so it stays pinned to the
              frame's own corner rather than the viewport's. bottom-right
              is where the zoom controls live, hence top-right here. */}
          {updated && (
            <div className="absolute right-3 top-3 z-10 flex items-center gap-2 border border-primary/10 bg-white/90 px-3 py-2 text-xs text-ink/70 shadow-sm backdrop-blur-sm sm:px-2.5 sm:py-1.5 sm:text-[11px]">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden />
              <span className="hidden sm:inline">{updated.full}</span>
              <span className="font-medium text-primary sm:hidden">{updated.date}</span>
            </div>
          )}
        </div>

        <SummaryBar units={phaseUnits} labels={labels} whatsappUrl={whatsappUrl} attached />
      </div>
    </div>
  );
}
