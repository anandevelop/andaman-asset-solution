"use client";

/**
 * components/SitePlanMap.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The whole "Site Plan + Unit Status" section body: view toggle (map/unit
 * list), the status filter chips, the interactive master plan, and the
 * summary column beside it.
 *
 * Ported from Claude outputs/siteplan-canvas-mockup.html — that file is the
 * design source of truth (CSS tokens, the canvas engine's math, every
 * animation timing) and every constant/comment below traces back to a
 * specific decision explained there. This is not a reinterpretation of it.
 *
 * WHY A HAND-ROLLED <canvas>, NOT SVG + react-zoom-pan-pinch (the previous
 * version)
 *
 * The previous map layered an SVG polygon overlay over a plain <img>, with
 * react-zoom-pan-pinch driving pan/zoom via CSS transforms and a parallel
 * HTML layer for unit-number badges (SVG <text> can't carry a literal-pixel
 * font-size inside a viewBox). That is three coordinate systems agreeing
 * with each other by convention. A canvas is one surface, one coordinate
 * system, and draws markers, ripples, the fly-to tween and the crowd-safe
 * label sizing in a single pass — see PlanMapEngine.draw() below.
 *
 * MARKERS ONLY, NOT POLYGONS
 *
 * The previous version filled each unit's drawn shapePoints as a coloured
 * polygon. This one plots a single round marker per unit at
 * positionXPercent/Y — which the schema already derives as the centroid of
 * shapePoints when they exist, so no shape data is lost, just not painted.
 * shapePoints stays in the DB and the admin drawing tool untouched.
 *
 * NO PHASES, NO "UPDATED" CHIP, NO PRICE
 *
 * All three were deliberately cut from this section (not from the schema —
 * ProjectUnit.phase and the admin tooling that reads it are untouched).
 * Phase tabs added a second filter axis on top of status that doubled the
 * combinations to reason about for one number's worth of value; the
 * "updated {date}" chip read as evidence the map might be stale more often
 * than it reassured anyone it was fresh; and this site does not show prices
 * anywhere, this section included — priceFromTHB stays unused here on
 * purpose, same as every other public page.
 * ─────────────────────────────────────────────────────────────────────────
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useTranslations } from "next-intl";
import { LayoutGrid, Map as MapIcon, Maximize, Minus, Plus, RotateCcw } from "lucide-react";
import type { ProjectUnitSummary, UnitStatus } from "@/lib/projects";

type Labels = {
  all: string;
  available: string;
  reserved: string;
  sold: string;
  zoomIn: string;
  zoomOut: string;
  fullscreen: string;
  resetView: string;
  viewMap: string;
  viewList: string;
  hint: string;
  canvasLabel: string;
  statusTitle: string;
  totalUnitsLabel: string;
  unitsSuffix: string;
  detailTitle: string;
  detailEmpty: string;
  detailType: string;
  detailLand: string;
  detailLiving: string;
  detailNote: string;
  bookViewing: string;
};

type Props = {
  projectName: string;
  /** Null when no master plan photo has been uploaded yet — the map, view
   *  toggle and filter chips are skipped entirely in that case, and only
   *  the status/total blocks of the summary column render. */
  masterPlanImageUrl: string | null;
  units: ProjectUnitSummary[];
  labels: Labels;
};

type FilterValue = "ALL" | UnitStatus;
type View = "map" | "list";

// ── Status visual language — Claude outputs/siteplan-canvas-mockup.html §2 ──
// Solid dot/marker colour + a separate, deliberately lighter text colour for
// the same status: SOLD's near-neutral grey reads fine as a small map
// marker (where it is meant to recede) but is close to illegible as 26px
// figures in the summary column — the two contexts need different values
// from the same status, not one colour doing both jobs.
//
// Red/green are cut entirely — no colour outside the navy/sand brand
// palette. AVAILABLE and RESERVED reuse this app's own design tokens
// (primary-500, accent-600 in app/globals.css); SOLD's neutral grey has no
// existing token to reuse, since nothing else in this app needed a
// deliberately-receding neutral before this map did.
const STATUS_TONE: Record<UnitStatus, { dot: string; soft: string; text: string }> = {
  AVAILABLE: { dot: "#296682", soft: "#DFE9EF", text: "#20536B" },
  RESERVED: { dot: "#C47B3A", soft: "#FAEEDF", text: "#9C602C" },
  SOLD: { dot: "#B6BDC1", soft: "#F3F4F5", text: "#77838A" },
};
const STATUS_ORDER: UnitStatus[] = ["AVAILABLE", "RESERVED", "SOLD"];
/** The selection ring — sand, so it contrasts against every marker colour
 *  above rather than just the navy one. */
const SELECTION_RING = "#e8b384";

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}
/** Overshoots past 1 then settles — the marker "drop" on load. c=1.9 is the
 *  mockup's own tuned constant, not the textbook 1.70158 default; higher c
 *  means more overshoot. */
function easeOutBack(t: number): number {
  const c = 1.9;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
}
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
/** '#rrggbb' + alpha -> 'rgba(r,g,b,a)', for the ripple stroke's fade. */
function hexToRgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha.toFixed(3)})`;
}

// ── Zoom range, in multiples of the "fit the whole plan" scale ─────────────
const MIN_ZOOM_FACTOR = 0.92;
const MAX_ZOOM_FACTOR = 7;
/** Below this container width, the fly-to-a-plot zoom goes in further — a
 *  narrow map has much less on-screen room per plot to begin with. */
const NARROW_BOX_PX = 560;

type EngineUnit = {
  id: string;
  code: string;
  status: UnitStatus;
  land: number | null;
  xPct: number;
  yPct: number;
  /** Stable per-unit integer used only to offset the ripple animation's
   *  phase (see draw()) — any stable distinct number per unit works; this
   *  is the unit's index when the engine was built. */
  n: number;
  // Animation state, mutated every frame by draw() — not React state, so a
  // marker's bounce/ripple/fade doesn't cost a re-render per frame.
  appear: number;
  visible: number;
  targetVisible: number;
};

type Tween = { t0: number; duration: number; k0: number; x0: number; y0: number; k1: number; x1: number; y1: number };

/**
 * Owns the canvas surface end to end — image draw, pan/zoom, hit-testing,
 * every animation — in one requestAnimationFrame loop. Deliberately not a
 * React component: none of this (a mutable transform, 60fps marker easing,
 * imperative pointer capture) benefits from a virtual-DOM diff, and routing
 * it through React state would mean a re-render on every animation frame.
 *
 * The two things React *does* need to know about — which unit is selected,
 * and what the hover/selection tooltip should say — arrive through
 * onSelect/onTooltipChange, fired only when they actually change rather
 * than every frame. The tooltip's on-screen *position* stays imperative
 * (written straight to tipEl.style in draw(), see the note in the
 * constructor) since that does change every frame during pan/zoom/fly-to.
 */
class PlanMapEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private box: HTMLElement;
  private tipEl: HTMLDivElement;
  private img: HTMLImageElement;
  private imgReady = false;
  private reduced: boolean;

  units: EngineUnit[];
  k = 1;
  x = 0;
  y = 0;
  fitK = 1;
  private dpr = 1;
  private w = 0;
  private h = 0;
  private fitted = false;

  sel: string | null = null;
  private hov: string | null = null;
  private tipId: string | null = null;
  private filter: FilterValue = "ALL";

  private started = 0;
  private live = false;
  private playing = false;
  private tween: Tween | null = null;

  private pointers = new Map<number, { x: number; y: number; startX: number; startY: number }>();
  private pinch: { distance: number; k: number } | null = null;
  private dragged = false;

  private resizeObserver: ResizeObserver;
  private rafId: number | null = null;

  onSelect: ((unit: EngineUnit | null) => void) | null = null;
  onTooltipChange: ((unit: EngineUnit | null) => void) | null = null;
  onFirstInteract: (() => void) | null = null;
  onDragStateChange: ((dragging: boolean) => void) | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    box: HTMLElement,
    tipEl: HTMLDivElement,
    imageUrl: string,
    units: ProjectUnitSummary[],
    reduced: boolean,
  ) {
    this.canvas = canvas;
    this.box = box;
    this.tipEl = tipEl;
    this.reduced = reduced;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable");
    this.ctx = ctx;

    this.units = units
      .filter((u) => u.positionXPercent !== null && u.positionYPercent !== null)
      .map((u, index) => ({
        id: u.id,
        code: u.unitNumber,
        status: u.status,
        land: u.landAreaSqm,
        xPct: u.positionXPercent!,
        yPct: u.positionYPercent!,
        n: index,
        appear: 0,
        visible: 1,
        targetVisible: 1,
      }));

    this.img = new Image();
    this.img.onload = () => {
      this.imgReady = true;
      this.fit();
      this.kick();
    };
    this.img.src = imageUrl;

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(box);
    this.resize();

    this.bindInput();
  }

  private bindInput() {
    const cv = this.canvas;

    cv.addEventListener("pointerdown", (e) => {
      this.onFirstInteract?.();
      cv.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY });
      this.dragged = false;
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y), k: this.k };
      }
    });

    cv.addEventListener("pointermove", (e) => {
      const p = this.pointers.get(e.pointerId);
      if (p) {
        const dx = e.clientX - p.x;
        const dy = e.clientY - p.y;
        p.x = e.clientX;
        p.y = e.clientY;
        // 5px slop separates a tap from a drag — without it, the pointerup
        // that ends a pan also selects whatever plot happened to be under
        // the cursor when the finger lifted.
        if (Math.abs(e.clientX - p.startX) + Math.abs(e.clientY - p.startY) > 5 && !this.dragged) {
          this.dragged = true;
          this.onDragStateChange?.(true);
        }
        if (this.pointers.size === 2 && this.pinch) {
          const [a, b] = [...this.pointers.values()];
          const distance = Math.hypot(a.x - b.x, a.y - b.y);
          const r = this.box.getBoundingClientRect();
          this.zoomAt(
            (a.x + b.x) / 2 - r.left,
            (a.y + b.y) / 2 - r.top,
            ((distance / this.pinch.distance) * this.pinch.k) / this.k,
          );
        } else if (this.pointers.size === 1) {
          this.tween = null;
          this.x += dx;
          this.y += dy;
          this.clampPan();
          this.kick();
        }
        return;
      }
      const r = this.box.getBoundingClientRect();
      this.setHover(this.hit(e.clientX - r.left, e.clientY - r.top));
    });

    const up = (e: PointerEvent) => {
      const had = this.pointers.has(e.pointerId);
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinch = null;
      if (this.pointers.size === 0 && this.dragged) this.onDragStateChange?.(false);
      if (had && !this.dragged) {
        const r = this.box.getBoundingClientRect();
        const u = this.hit(e.clientX - r.left, e.clientY - r.top);
        this.select(u ? u.id : null);
      }
    };
    cv.addEventListener("pointerup", up);
    cv.addEventListener("pointercancel", up);
    cv.addEventListener("pointerleave", () => this.setHover(null));

    cv.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const r = this.box.getBoundingClientRect();
        this.zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0016));
      },
      { passive: false },
    );

    cv.addEventListener("dblclick", (e) => {
      const r = this.box.getBoundingClientRect();
      this.zoomAt(e.clientX - r.left, e.clientY - r.top, 1.7);
    });
  }

  private nx(u: EngineUnit): number {
    return u.xPct / 100;
  }
  private ny(u: EngineUnit): number {
    return u.yPct / 100;
  }
  private sx(u: EngineUnit): number {
    return this.nx(u) * this.img.naturalWidth * this.k + this.x;
  }
  private sy(u: EngineUnit): number {
    return this.ny(u) * this.img.naturalHeight * this.k + this.y;
  }

  resize() {
    const r = this.box.getBoundingClientRect();
    if (!r.width) return;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.w = r.width;
    this.h = r.height;
    this.canvas.width = Math.round(r.width * this.dpr);
    this.canvas.height = Math.round(r.height * this.dpr);
    if (!this.fitted) this.fit();
    else this.clampPan();
    this.kick();
  }

  fit() {
    if (!this.img.naturalWidth || !this.w) return;
    // Opens on the whole plan, every time — never pre-zoomed, not even on a
    // narrow viewport. A plan that's cropped from the first frame can't be
    // read as "what does this development look like," which is this
    // section's one job before anyone touches it.
    this.k = this.fitK = Math.min(this.w / this.img.naturalWidth, this.h / this.img.naturalHeight);
    this.x = (this.w - this.img.naturalWidth * this.k) / 2;
    this.y = (this.h - this.img.naturalHeight * this.k) / 2;
    this.fitted = true;
    this.clampPan();
    this.kick();
  }

  private clampPan() {
    const iw = this.img.naturalWidth * this.k;
    const ih = this.img.naturalHeight * this.k;
    const margin = 40;
    this.x = iw <= this.w ? (this.w - iw) / 2 : clamp(this.x, this.w - iw - margin, margin);
    this.y = ih <= this.h ? (this.h - ih) / 2 : clamp(this.y, this.h - ih - margin, margin);
  }

  zoomAt(cx: number, cy: number, factor: number) {
    this.tween = null;
    const nk = clamp(this.k * factor, this.fitK * MIN_ZOOM_FACTOR, this.fitK * MAX_ZOOM_FACTOR);
    const f = nk / this.k;
    this.x = cx - (cx - this.x) * f;
    this.y = cy - (cy - this.y) * f;
    this.k = nk;
    this.clampPan();
    this.kick();
  }
  zoomCenter(factor: number) {
    this.zoomAt(this.w / 2, this.h / 2, factor);
  }
  resetView() {
    this.fit();
    this.select(null);
  }

  /** Zooms and pans to a plot at once — used both when a marker is tapped
   *  directly (kept at whatever zoom the visitor is already at) and from
   *  the unit list ("fly to that marker"). */
  flyTo(unit: EngineUnit, zoomFactor: number) {
    if (!this.img.naturalWidth) return;
    const targetK = clamp(this.fitK * zoomFactor, this.fitK, this.fitK * MAX_ZOOM_FACTOR);
    const targetX = this.w / 2 - this.nx(unit) * this.img.naturalWidth * targetK;
    const targetY = this.h / 2 - this.ny(unit) * this.img.naturalHeight * targetK;
    if (this.reduced) {
      this.k = targetK;
      this.x = targetX;
      this.y = targetY;
      this.clampPan();
      this.kick();
      return;
    }
    this.tween = {
      t0: performance.now(),
      duration: 720,
      k0: this.k,
      x0: this.x,
      y0: this.y,
      k1: targetK,
      x1: targetX,
      y1: targetY,
    };
    this.kick();
  }

  byId(id: string): EngineUnit | null {
    return this.units.find((u) => u.id === id) ?? null;
  }
  private isVisible(u: EngineUnit): boolean {
    return this.filter === "ALL" || u.status === this.filter;
  }
  setFilter(filter: FilterValue) {
    this.filter = filter;
    for (const u of this.units) u.targetVisible = this.isVisible(u) ? 1 : 0.18;
    if (this.sel) {
      const selected = this.byId(this.sel);
      if (selected && !this.isVisible(selected)) this.select(null);
    }
    this.kick();
  }

  private markerRadius(): number {
    // Bound to both the zoom level *and* the container's own width — on a
    // phone the plan itself renders roughly a third the size, and a marker
    // sized only for zoom would crowd into a string of beads there.
    const zoomRatio = this.k / this.fitK;
    const sizeScale = clamp(this.w / 900, 0.6, 1.12);
    return clamp((6.2 + (zoomRatio - 1) * 6.4) * sizeScale, 5.2, 15);
  }
  private hitPadding(): number {
    return this.w < NARROW_BOX_PX ? 11 : 7;
  }

  private hit(cx: number, cy: number): EngineUnit | null {
    if (!this.img.naturalWidth) return null;
    const r = this.markerRadius() + this.hitPadding();
    let best: EngineUnit | null = null;
    let bestDistSq = Infinity;
    for (const u of this.units) {
      if (u.targetVisible < 0.5) continue;
      const dx = this.sx(u) - cx;
      const dy = this.sy(u) - cy;
      const distSq = dx * dx + dy * dy;
      if (distSq < r * r && distSq < bestDistSq) {
        bestDistSq = distSq;
        best = u;
      }
    }
    return best;
  }

  private showTip(u: EngineUnit | null) {
    this.tipId = u ? u.id : null;
    this.onTooltipChange?.(u);
    this.kick();
  }
  private setHover(u: EngineUnit | null) {
    const id = u ? u.id : null;
    if (id === this.hov) return;
    this.hov = id;
    this.canvas.style.cursor = id ? "pointer" : "grab";
    // Desktop only: no hover on touch, so showing a tap-revealed tooltip
    // here too would make it vanish the instant a finger lifts.
    if (this.w > 520) this.showTip(u ?? (this.sel ? this.byId(this.sel) : null));
    this.kick();
  }
  select(id: string | null) {
    if (id) {
      const u = this.byId(id);
      if (!u || !this.isVisible(u)) return;
    }
    this.sel = id;
    this.showTip(id ? this.byId(id) : null);
    this.onSelect?.(id ? this.byId(id) : null);
    this.kick();
  }

  private kick() {
    if (this.live && !this.playing) {
      this.playing = true;
      this.loop();
    }
  }
  /** First call also stamps `started` — the bounce-in stagger's epoch —
   *  and only that first call does, so pausing/resuming via the
   *  IntersectionObserver never replays it. */
  start() {
    this.live = true;
    if (!this.started) this.started = performance.now();
    this.kick();
  }
  pause() {
    this.live = false;
  }
  private loop() {
    if (!this.live) {
      this.playing = false;
      return;
    }
    this.draw();
    this.rafId = requestAnimationFrame(() => this.loop());
  }

  destroy() {
    this.live = false;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.resizeObserver.disconnect();
  }

  private draw() {
    const ctx = this.ctx;
    const t = performance.now();
    if (!this.img.naturalWidth || !this.w) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);

    if (this.tween) {
      const p = clamp((t - this.tween.t0) / this.tween.duration, 0, 1);
      const e = easeInOutCubic(p);
      this.k = this.tween.k0 + (this.tween.k1 - this.tween.k0) * e;
      this.x = this.tween.x0 + (this.tween.x1 - this.tween.x0) * e;
      this.y = this.tween.y0 + (this.tween.y1 - this.tween.y0) * e;
      this.clampPan();
      if (p >= 1) this.tween = null;
    }

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(this.img, this.x, this.y, this.img.naturalWidth * this.k, this.img.naturalHeight * this.k);

    const radius = this.markerRadius();
    const showText = radius >= 10.5;
    const since = t - (this.started || t);

    for (const u of this.units) {
      // Markers bounce in one at a time, staggered by index.
      const want = this.reduced ? 1 : clamp((since - 120 - u.n * 14) / 420, 0, 1);
      u.appear = want;
      // Eases toward its filtered/unfiltered target rather than snapping,
      // so toggling a status chip fades markers rather than popping them.
      if (Math.abs(u.visible - u.targetVisible) > 0.004) u.visible += (u.targetVisible - u.visible) * 0.16;
      else u.visible = u.targetVisible;
      if (u.appear <= 0.001) continue;

      const px = this.sx(u);
      const py = this.sy(u);
      if (px < -60 || px > this.w + 60 || py < -60 || py > this.h + 60) continue;

      const isSelected = this.sel === u.id;
      const isHovered = this.hov === u.id;
      const r = radius * (isSelected ? 1.55 : isHovered ? 1.3 : 1) * (this.reduced ? 1 : easeOutBack(u.appear));
      const alpha = u.visible * clamp(u.appear * 1.4, 0, 1);
      if (r <= 0.4) continue;

      const tone = STATUS_TONE[u.status];

      // Ripple — selected plot always, an AVAILABLE plot on a slow,
      // low-opacity cycle. Phase-offset by `u.n` so dozens of AVAILABLE
      // ripples don't flash in lockstep across the whole plan.
      if (!this.reduced && u.visible > 0.9 && (isSelected || u.status === "AVAILABLE")) {
        const period = isSelected ? 1500 : 3400;
        const window = isSelected ? 1 : 0.3;
        const phase = ((t + u.n * 211) % period) / period;
        if (phase < window) {
          ctx.beginPath();
          ctx.arc(px, py, r * (1 + (phase / window) * 1.5), 0, Math.PI * 2);
          ctx.strokeStyle = hexToRgba(tone.dot, (1 - phase / window) * (isSelected ? 0.55 : 0.3) * alpha);
          ctx.lineWidth = isSelected ? 2 : 1.3;
          ctx.stroke();
        }
      }

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.shadowColor = "rgba(4,29,44,.35)";
      ctx.shadowBlur = isSelected || isHovered ? 12 : 5;
      ctx.shadowOffsetY = 1.5;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fillStyle = tone.dot;
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.lineWidth = clamp(r * 0.17, 1, 2.4);
      ctx.strokeStyle = isSelected ? "#ffffff" : "rgba(255,255,255,.88)";
      ctx.stroke();
      if (isSelected) {
        ctx.beginPath();
        ctx.arc(px, py, r + 4.5, 0, Math.PI * 2);
        ctx.strokeStyle = SELECTION_RING;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      if ((showText || isSelected || isHovered) && r > 7.5) {
        const fontSize = clamp(r * 0.92, 8, 13);
        ctx.font = `600 ${fontSize.toFixed(1)}px Roboto, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#fff";
        ctx.fillText(u.code, px, py + fontSize * 0.06);
      }
      ctx.restore();
    }

    // Tooltip position — imperative, every frame, since it has to track its
    // marker through pan/zoom/fly-to. Content is React's job (onTooltipChange).
    if (this.tipId) {
      const u = this.byId(this.tipId);
      if (u) {
        const tx = this.sx(u);
        const ty = this.sy(u);
        const halfWidth = this.tipEl.offsetWidth / 2;
        const tipHeight = this.tipEl.offsetHeight;
        // Flips below the marker when there's no room above — otherwise
        // the frame's own overflow:hidden clips it away entirely.
        this.tipEl.classList.toggle("site-plan-tip-below", ty - tipHeight - 18 < 0);
        const left = clamp(tx, halfWidth + 8, Math.max(halfWidth + 8, this.w - halfWidth - 8));
        this.tipEl.style.left = `${left}px`;
        this.tipEl.style.top = `${ty}px`;
        this.tipEl.style.setProperty(
          "--tip-arrow-left",
          `${clamp(tx - left + halfWidth, 12, Math.max(12, halfWidth * 2 - 12))}px`,
        );
        this.tipEl.classList.add("site-plan-tip-on");
      }
    } else {
      this.tipEl.classList.remove("site-plan-tip-on");
    }
  }
}

// ── Small presentational pieces ─────────────────────────────────────────

/** Counts up from 0 on mount — purely decorative, so it's skipped outright
 *  under prefers-reduced-motion rather than jumping straight to the final
 *  value with no animation to reduce. */
function useCountUp(target: number, reduced: boolean): number {
  const [value, setValue] = useState(reduced ? target : 0);
  useEffect(() => {
    if (reduced) {
      setValue(target);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const duration = 850;
    const step = () => {
      const p = clamp((performance.now() - t0) / duration, 0, 1);
      setValue(Math.round(target * easeOutCubic(p)));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, reduced]);
  return value;
}

function toolButtonClass(extra = ""): string {
  return `flex h-9 w-9 items-center justify-center rounded-xs border border-primary/10 bg-white text-primary shadow-card transition-colors hover:bg-primary/5 ${extra}`;
}

function ZoomControls({
  labels,
  onZoomIn,
  onZoomOut,
  onReset,
  onFullscreen,
  isFullscreen,
  layout,
}: {
  labels: Labels;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  onFullscreen: () => void;
  isFullscreen: boolean;
  /** "floating" over the map's bottom-right corner (≥560px), or a plain
   *  toolbar row (<560px, and always while fullscreen) — see the file
   *  header's breakpoint table. */
  layout: "floating" | "row";
}) {
  const buttons: { label: string; icon: React.ReactNode; onClick: () => void; pressed?: boolean }[] = [
    { label: labels.zoomIn, icon: <Plus size={16} aria-hidden />, onClick: onZoomIn },
    { label: labels.zoomOut, icon: <Minus size={16} aria-hidden />, onClick: onZoomOut },
    { label: labels.resetView, icon: <RotateCcw size={15} aria-hidden />, onClick: onReset },
    {
      label: labels.fullscreen,
      icon: <Maximize size={15} aria-hidden />,
      onClick: onFullscreen,
      pressed: isFullscreen,
    },
  ];

  if (layout === "row") {
    return (
      <div className="flex shrink-0 overflow-hidden rounded-xs border border-primary/10">
        {buttons.map((b) => (
          <button
            key={b.label}
            type="button"
            aria-label={b.label}
            aria-pressed={b.pressed}
            onClick={b.onClick}
            className="flex h-8 w-9 items-center justify-center border-r border-primary/10 bg-white text-primary transition-colors last:border-r-0 hover:bg-primary/5"
          >
            {b.icon}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="absolute bottom-3 right-3 z-10 flex flex-col gap-2">
      {buttons.map((b) => (
        <button
          key={b.label}
          type="button"
          aria-label={b.label}
          aria-pressed={b.pressed}
          onClick={b.onClick}
          className={toolButtonClass()}
        >
          {b.icon}
        </button>
      ))}
    </div>
  );
}

function Legend({
  labels,
  layout,
}: {
  labels: Labels;
  layout: "floating" | "row";
}) {
  const items: { status: UnitStatus; label: string }[] = [
    { status: "AVAILABLE", label: labels.available },
    { status: "RESERVED", label: labels.reserved },
    { status: "SOLD", label: labels.sold },
  ];

  return (
    <div
      className={
        layout === "floating"
          ? "absolute bottom-3 left-3 z-10 flex max-w-[calc(100%-64px)] flex-wrap gap-x-3 gap-y-1 rounded-xs border border-primary/10 bg-white/90 px-2.5 py-2 text-[11px] text-ink/70 backdrop-blur-sm"
          : "flex min-w-0 flex-1 flex-wrap gap-x-3 gap-y-0.5 text-[10.5px] text-ink/70"
      }
    >
      {items.map(({ status, label }) => (
        <span key={status} className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: STATUS_TONE[status].dot }} aria-hidden />
          {label}
        </span>
      ))}
    </div>
  );
}

function StatusChips({
  labels,
  filter,
  onChange,
  counts,
}: {
  labels: Labels;
  filter: FilterValue;
  onChange: (value: FilterValue) => void;
  counts: Record<FilterValue, number>;
}) {
  const items: { value: FilterValue; label: string }[] = [
    { value: "ALL", label: labels.all },
    { value: "AVAILABLE", label: labels.available },
    { value: "RESERVED", label: labels.reserved },
    { value: "SOLD", label: labels.sold },
  ];

  return (
    <div className="flex min-w-0 flex-wrap gap-2 @max-[560px]:flex-nowrap @max-[560px]:overflow-x-auto @max-[560px]:pb-1">
      {items.map(({ value, label }) => {
        const active = filter === value;
        const dotColor = value === "ALL" ? undefined : STATUS_TONE[value].dot;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(value)}
            className={`inline-flex shrink-0 items-center gap-2 rounded-xs border px-3.5 py-2 text-xs font-medium transition-colors ${
              active
                ? "border-primary bg-primary text-white"
                : "border-primary/15 bg-white text-ink/70 hover:border-primary/35 hover:text-primary"
            }`}
          >
            {dotColor && (
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: active ? "#fff" : dotColor }}
                aria-hidden
              />
            )}
            {label}
            <span className={active ? "text-white/70" : "text-ink/40"}>{counts[value]}</span>
          </button>
        );
      })}
    </div>
  );
}

/** The selected plot's own detail block — its own component (rather than
 *  inline JSX in SummaryColumn) purely so it can be keyed by unit id at the
 *  call site: remounting on every new selection is what makes useRevealed
 *  replay its fade-up on each swap, the same way React's own key-remount
 *  idiom drives any other "restart this animation on change" case. */
function DetailPanel({
  unit,
  labels,
  t,
  reduced,
}: {
  unit: ProjectUnitSummary;
  labels: Labels;
  t: ReturnType<typeof useTranslations>;
  reduced: boolean;
}) {
  const revealed = useRevealed(reduced);

  return (
    <div className={`mt-1 transition-all duration-300 ease-out ${revealed ? "opacity-100" : "translate-y-2 opacity-0"}`}>
      <div className="flex items-start justify-between gap-3">
        <span className="font-sans text-xl font-extralight leading-none text-primary">{unit.unitNumber}</span>
        <span
          className="shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium"
          style={{ background: STATUS_TONE[unit.status].soft, color: STATUS_TONE[unit.status].text }}
        >
          {unit.status === "AVAILABLE" ? labels.available : unit.status === "RESERVED" ? labels.reserved : labels.sold}
        </span>
      </div>

      {unit.unitTypeName && (
        <>
          <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-ink/45">{labels.detailType}</p>
          <p className="mt-0.5 text-xs text-ink">
            {[
              unit.unitTypeName,
              unit.unitTypeBedrooms ? t("sitePlanBedroomsCount", { count: unit.unitTypeBedrooms }) : null,
              unit.unitTypeBathrooms ? t("sitePlanBathroomsCount", { count: unit.unitTypeBathrooms }) : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </>
      )}

      <div className="mt-2 grid grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink/45">{labels.detailLand}</p>
          <p className="mt-0.5 text-xs text-ink">
            {unit.landAreaSqm !== null ? `${unit.landAreaSqm} ${t("units.sqm")}` : "—"}
          </p>
        </div>
        {unit.unitTypeLivingAreaSqm !== null && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ink/45">{labels.detailLiving}</p>
            <p className="mt-0.5 text-xs text-ink">
              {unit.unitTypeLivingAreaSqm} {t("units.sqm")}
            </p>
          </div>
        )}
      </div>

      <p className="mt-2 border-t border-primary/10 pt-2 text-[11px] leading-relaxed text-ink/60">{labels.detailNote}</p>
    </div>
  );
}

/** The 4-block column beside (or, narrow, below) the map: the status
 *  breakdown, the total-units bar, the selected-plot detail, and the CTAs.
 *  `units` here is always the *unfiltered* set — see the file header's note
 *  on why these totals don't react to the status chips. */
function SummaryColumn({
  units,
  selected,
  labels,
  reduced,
  t,
}: {
  units: ProjectUnitSummary[];
  selected: EngineUnit | null;
  labels: Labels;
  reduced: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  const total = units.length;
  const counts = units.reduce(
    (acc, u) => {
      acc[u.status] += 1;
      return acc;
    },
    { AVAILABLE: 0, RESERVED: 0, SOLD: 0 } as Record<UnitStatus, number>,
  );
  const takenPercent = total > 0 ? Math.round(((counts.SOLD + counts.RESERVED) / total) * 100) : 0;

  const animatedTotal = useCountUp(total, reduced);
  const animatedCounts: Record<UnitStatus, number> = {
    AVAILABLE: useCountUp(counts.AVAILABLE, reduced),
    RESERVED: useCountUp(counts.RESERVED, reduced),
    SOLD: useCountUp(counts.SOLD, reduced),
  };

  // The selected unit's own full record, for its land size / unit type —
  // EngineUnit only carries what the canvas needs to draw.
  const selectedFull = selected ? (units.find((u) => u.id === selected.id) ?? null) : null;

  return (
    <aside className="flex flex-col border border-primary/10 bg-white @min-[1000px]:border-t @min-[1000px]:border-l-0">
      {/* 1 — status breakdown */}
      <div className="border-b border-primary/10 p-3.5 @min-[1000px]:p-4">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-ink/50">{labels.statusTitle}</p>
        <div className="mt-0.5">
          {STATUS_ORDER.map((status) => (
            <div key={status} className="flex items-center justify-between gap-3 border-b border-primary/10 py-1.5 last:border-b-0 last:pb-0">
              <span className="flex items-center gap-2 text-xs text-ink">
                <span className="h-1.5 w-1.5 shrink-0 rounded-sm" style={{ background: STATUS_TONE[status].dot }} aria-hidden />
                {status === "AVAILABLE" ? labels.available : status === "RESERVED" ? labels.reserved : labels.sold}
              </span>
              <b className="font-sans text-lg font-extralight leading-none" style={{ color: STATUS_TONE[status].text }}>
                {animatedCounts[status]}
              </b>
            </div>
          ))}
        </div>
      </div>

      {/* 2 — total + proportion bar */}
      <div className="border-b border-primary/10 p-3.5 @min-[1000px]:p-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-xs text-ink/60">{labels.totalUnitsLabel}</span>
          <b className="inline-flex items-baseline gap-1 font-sans text-base font-light leading-none text-primary">
            {animatedTotal}
            <em className="font-sans text-[11px] font-normal not-italic text-ink/60">{labels.unitsSuffix}</em>
          </b>
        </div>
        <div className="mt-2 flex h-1 overflow-hidden rounded-full bg-primary/8">
          {[...STATUS_ORDER].reverse().map((status) => (
            <span
              key={status}
              className="block h-full transition-[width] duration-1000 ease-out"
              style={{ background: STATUS_TONE[status].dot, width: total ? `${(counts[status] / total) * 100}%` : "0%" }}
            />
          ))}
        </div>
        <p className="mt-1.5 text-[10.5px] text-ink/60">{t("sitePlanTakenPercent", { percent: takenPercent })}</p>
      </div>

      {/* 3 — selected plot's own details, empty until something is picked */}
      <div className="flex-1 border-b border-primary/10 p-3.5 @min-[1000px]:p-4">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-ink/50">{labels.detailTitle}</p>
        {!selectedFull ? (
          <p className="mt-1.5 text-xs font-light leading-relaxed text-ink/60">{labels.detailEmpty}</p>
        ) : (
          <DetailPanel key={selectedFull.id} unit={selectedFull} labels={labels} t={t} reduced={reduced} />
        )}
      </div>

      {/* 4 — CTA */}
      <div className="p-3.5 @min-[1000px]:p-4">
        <a href="#enquire" className="btn-primary w-full">
          {labels.bookViewing}
        </a>
      </div>
    </aside>
  );
}

/** Reveals its children over a `transitionDelay` set by the caller, rather
 *  than flashing everything in at once — see ListView's own use below.
 *  Renders already-revealed under prefers-reduced-motion, matching the
 *  mockup's own reduced-motion rule of skipping straight to the end state. */
function useRevealed(reduced: boolean): boolean {
  const [revealed, setRevealed] = useState(reduced);
  useEffect(() => {
    if (reduced) return;
    // One frame late, so the browser paints the "not revealed" state first
    // — flipping the class in the same tick it mounts would skip straight
    // to "revealed" with no transition to see.
    const raf = requestAnimationFrame(() => setRevealed(true));
    return () => cancelAnimationFrame(raf);
  }, [reduced]);
  return revealed;
}

function ListView({
  units,
  onPick,
  t,
  reduced,
}: {
  units: ProjectUnitSummary[];
  onPick: (unit: ProjectUnitSummary) => void;
  t: ReturnType<typeof useTranslations>;
  reduced: boolean;
}) {
  const revealed = useRevealed(reduced);

  return (
    <div className="border border-primary/10 bg-white">
      <div className="border-b border-primary/10 px-4 py-3 text-xs text-ink/60">
        {t("sitePlanListCount", { count: units.length })}
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-2 p-3.5">
        {units.map((unit, index) => (
          <button
            key={unit.id}
            type="button"
            onClick={() => onPick(unit)}
            style={{
              background: STATUS_TONE[unit.status].soft,
              transitionDelay: reduced ? "0ms" : `${Math.min(index * 11, 600)}ms`,
            }}
            className={`rounded-xs border border-transparent p-2.5 text-left transition-all duration-300 hover:-translate-y-0.5 hover:shadow-card ${
              revealed ? "opacity-100" : "translate-y-2 opacity-0"
            }`}
          >
            <div className="font-sans text-base text-primary">{unit.unitNumber}</div>
            <div className="mt-1 flex items-center gap-1.5 text-[10.5px] text-ink/60">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: STATUS_TONE[unit.status].dot }} aria-hidden />
              {unit.status === "AVAILABLE" ? t("unitStatus.AVAILABLE") : unit.status === "RESERVED" ? t("unitStatus.RESERVED") : t("unitStatus.SOLD")}
            </div>
            {unit.landAreaSqm !== null && (
              <div className="mt-1.5 font-sans text-[11.5px] text-ink/60">
                {unit.landAreaSqm} {t("units.sqm")}
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function SitePlanMap({ projectName, masterPlanImageUrl, units, labels }: Props) {
  const t = useTranslations("projects");
  const cardRef = useRef<HTMLDivElement>(null);
  const mapboxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<PlanMapEngine | null>(null);

  const [view, setView] = useState<View>("map");
  const [statusFilter, setStatusFilter] = useState<FilterValue>("ALL");
  const [selected, setSelected] = useState<EngineUnit | null>(null);
  const [tooltipUnit, setTooltipUnit] = useState<EngineUnit | null>(null);
  const [dragging, setDragging] = useState(false);
  const [hintVisible, setHintVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const reduced =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Only a unit with a plotted position can appear on the canvas or be
  // "flown to" from the list — see the file header for why the summary
  // column's own totals (block 1/2) still count every released unit
  // regardless, while this narrower set backs the map, the list and the
  // filter chips' counts.
  const plottable = useMemo(
    () => units.filter((u) => u.positionXPercent !== null && u.positionYPercent !== null),
    [units],
  );

  const chipCounts = useMemo(() => {
    const counts: Record<FilterValue, number> = { ALL: plottable.length, AVAILABLE: 0, RESERVED: 0, SOLD: 0 };
    for (const u of plottable) counts[u.status] += 1;
    return counts;
  }, [plottable]);

  const listUnits = useMemo(
    () => plottable.filter((u) => statusFilter === "ALL" || u.status === statusFilter),
    [plottable, statusFilter],
  );

  // ── Engine lifecycle ─────────────────────────────────────────────────
  useEffect(() => {
    if (!masterPlanImageUrl || !canvasRef.current || !mapboxRef.current || !tipRef.current) return;

    const engine = new PlanMapEngine(
      canvasRef.current,
      mapboxRef.current,
      tipRef.current,
      masterPlanImageUrl,
      plottable,
      reduced,
    );
    engine.onSelect = setSelected;
    engine.onTooltipChange = setTooltipUnit;
    engine.onFirstInteract = () => setHintVisible(false);
    engine.onDragStateChange = setDragging;
    engineRef.current = engine;

    return () => {
      engine.destroy();
      engineRef.current = null;
    };
    // plottable is derived from the `units` prop, which the page never
    // changes after mount for a given project — re-keying the engine on a
    // change here would tear down mid-interaction state for no benefit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [masterPlanImageUrl]);

  useEffect(() => {
    engineRef.current?.setFilter(statusFilter);
  }, [statusFilter]);

  // Pauses the draw loop while the section is off-screen — nothing needs
  // 60fps ripple/bounce math running behind a page a visitor has scrolled
  // past or hasn't reached yet.
  useEffect(() => {
    const node = cardRef.current;
    if (!node || !masterPlanImageUrl) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) engineRef.current?.start();
        else engineRef.current?.pause();
      },
      { threshold: 0.05 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [masterPlanImageUrl]);

  useEffect(() => {
    const onHintTimeout = setTimeout(() => setHintVisible(false), 4200);
    return () => clearTimeout(onHintTimeout);
  }, []);

  useEffect(() => {
    const onFsChange = () => {
      const active = document.fullscreenElement === cardRef.current;
      setIsFullscreen(active);
      const engine = engineRef.current;
      if (!engine) return;
      // The card's own dimensions change size the instant fullscreen
      // toggles — force a fresh "fit" once the browser has actually
      // resized the element, not the frame this event fires on.
      setTimeout(() => {
        (engine as unknown as { fitted: boolean }).fitted = false;
        engine.resize();
      }, 70);
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const handleFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen();
    else cardRef.current?.requestFullscreen?.();
  }, []);

  const handleListPick = useCallback((unit: ProjectUnitSummary) => {
    setView("map");
    engineRef.current?.select(unit.id);
    setTimeout(() => {
      const engineUnit = engineRef.current?.byId(unit.id);
      if (engineUnit) engineRef.current?.flyTo(engineUnit, mapboxRef.current && mapboxRef.current.clientWidth < NARROW_BOX_PX ? 4.4 : 3.2);
    }, 60);
  }, []);

  const toolLayout: "floating" | "row" = "floating"; // narrowed to "row" below @560px via CSS, see .maptools

  // No photo yet: nothing for a map, filter chips or view toggle to act on
  // — see the file header's "!masterPlanImageUrl" note.
  if (!masterPlanImageUrl) {
    return <SummaryColumn units={units} selected={null} labels={labels} reduced={reduced} t={t} />;
  }

  return (
    // .site-plan-fullscreen-card:fullscreen lives in app/globals.css —
    // fullscreen is requested on this whole card (handleFullscreen), not
    // just the map frame, so the toolbar strip below it stays reachable.
    <div ref={cardRef} className="@container site-plan-fullscreen-card">
      {/* ── View toggle + status filter chips ───────────────────────── */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label={`${labels.viewMap} / ${labels.viewList}`} className="inline-flex gap-1 rounded-xs bg-surface-muted p-1">
          {(
            [
              { value: "map" as View, label: labels.viewMap, icon: MapIcon },
              { value: "list" as View, label: labels.viewList, icon: LayoutGrid },
            ] as const
          ).map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              aria-pressed={view === value}
              onClick={() => setView(value)}
              className={`inline-flex items-center gap-1.5 rounded-xs px-3.5 py-2 text-xs font-medium transition-colors ${
                view === value ? "bg-white text-primary shadow-card" : "text-ink/60 hover:text-primary"
              }`}
            >
              <Icon size={13} aria-hidden />
              {label}
            </button>
          ))}
        </div>

        <StatusChips labels={labels} filter={statusFilter} onChange={setStatusFilter} counts={chipCounts} />
      </div>

      {/* ── Map / list + summary column ─────────────────────────────── */}
      <div className="grid grid-cols-1 gap-0 @min-[1000px]:grid-cols-[minmax(0,1fr)_300px]">
        <div className="relative">
          {/* Map view — kept mounted (never unmounted) even while the list
              view is showing, so the canvas engine's pan/zoom/selection
              state survives switching back and forth. */}
          <div
            className={`transition-[opacity,transform] duration-300 ${
              view === "map" ? "opacity-100" : "pointer-events-none absolute inset-0 scale-[.985] opacity-0"
            }`}
          >
            <div className="relative">
              <div
                ref={mapboxRef}
                className={`relative aspect-[10/11] w-full touch-none overflow-hidden border border-primary/10 bg-white @min-[560px]:aspect-video ${
                  dragging ? "cursor-grabbing" : "cursor-grab"
                } site-plan-fullscreen-mapbox`}
              >
                <canvas ref={canvasRef} aria-label={labels.canvasLabel} className="block h-full w-full" />

                {hintVisible && (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute left-1/2 top-3.5 z-[3] -translate-x-1/2 whitespace-nowrap rounded-full bg-primary/85 px-3.5 py-1.5 text-[11.5px] text-white backdrop-blur-sm transition-opacity"
                  >
                    {labels.hint}
                  </div>
                )}

                {/* .site-plan-tip{,-on,-below} live in app/globals.css —
                    the engine toggles them directly on this node every
                    frame (see PlanMapEngine.draw()), which a Tailwind
                    className (re-rendered by React) can't do without
                    costing a re-render per frame. Content below is
                    ordinary React, driven by tooltipUnit state instead. */}
                <div
                  ref={tipRef}
                  role="status"
                  className="site-plan-tip pointer-events-none absolute z-[6] whitespace-nowrap rounded-xs bg-primary-900 px-3 py-2.5 text-xs leading-relaxed text-white shadow-lg"
                >
                  {tooltipUnit && (
                    <>
                      <b className="text-sm font-medium">{tooltipUnit.code}</b>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-white/75">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: STATUS_TONE[tooltipUnit.status].dot }} aria-hidden />
                        {tooltipUnit.status === "AVAILABLE" ? labels.available : tooltipUnit.status === "RESERVED" ? labels.reserved : labels.sold}
                        {tooltipUnit.land !== null && ` · ${labels.detailLand} ${tooltipUnit.land} ${t("units.sqm")}`}
                      </div>
                    </>
                  )}
                </div>

                {/* ≥560px: legend + zoom tools float over the map's bottom
                    corners. <560px: both move to a toolbar strip below the
                    frame instead (rendered separately, next) — see the file
                    header's breakpoint table for why: on a phone the plan
                    is already a third the size, and four floating buttons
                    plus a legend cover most of what's left of it. */}
                <div className="hidden @min-[560px]:contents">
                  <Legend labels={labels} layout="floating" />
                  <ZoomControls
                    labels={labels}
                    onZoomIn={() => engineRef.current?.zoomCenter(1.5)}
                    onZoomOut={() => engineRef.current?.zoomCenter(1 / 1.5)}
                    onReset={() => engineRef.current?.resetView()}
                    onFullscreen={handleFullscreen}
                    isFullscreen={isFullscreen}
                    layout={toolLayout}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 border border-t-0 border-primary/10 bg-white px-3 py-2 @min-[560px]:hidden">
                <Legend labels={labels} layout="row" />
                <ZoomControls
                  labels={labels}
                  onZoomIn={() => engineRef.current?.zoomCenter(1.5)}
                  onZoomOut={() => engineRef.current?.zoomCenter(1 / 1.5)}
                  onReset={() => engineRef.current?.resetView()}
                  onFullscreen={handleFullscreen}
                  isFullscreen={isFullscreen}
                  layout="row"
                />
              </div>
            </div>
          </div>

          {/* List view — a plain, always-legible fallback for canvas
              content too, per the file header's accessibility note. */}
          {view === "list" && (
            <div>
              <ListView units={listUnits} onPick={handleListPick} t={t} reduced={reduced} />
            </div>
          )}
        </div>

        <SummaryColumn units={units} selected={selected} labels={labels} reduced={reduced} t={t} />
      </div>
    </div>
  );
}
