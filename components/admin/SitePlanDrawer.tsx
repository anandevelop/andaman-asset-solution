"use client";

/**
 * components/admin/SitePlanDrawer.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Polygon tracing tool for /admin/projects/[id]/site-plan. Click the
 * master plan image to add vertices, close the shape, pick which unit
 * they belong to, save — the server action computes the centroid into
 * positionXPercent/Y (see ./actions.ts).
 *
 * Coordinate system matches components/SitePlanMap.tsx: the image sits
 * in an aspect-[1754/1241] box (the actual site-plan artwork's
 * dimensions — see that component's header comment for why), and every
 * point is stored as a 0-100 percentage of that box.
 *
 * Zoom/pan (react-zoom-pan-pinch) means a raw click position is no
 * longer a direct percentage of the box — it also has to be corrected
 * for the current pan offset and zoom scale first. `outerRef` points at
 * the un-transformed viewport box (react-zoom-pan-pinch only ever scales
 * its *content*, never its wrapper), so its bounding rect is a stable
 * reference regardless of zoom level. `screenToPercent()` below:
 *   1. finds the click position relative to that stable box (pixels),
 *   2. subtracts the current pan offset and divides by the current
 *      scale to land back in "as if scale were 1" content pixels,
 *   3. divides by the box's width/height to get a 0-100 percentage.
 * `transform` (scale/positionX/positionY) is kept in sync via
 * useTransformEffect inside <TransformSync>, a required child of
 * TransformWrapper — the hook isn't callable from this component's own
 * body since that body sits *outside* the provider.
 *
 * Double-click used to close the shape (an old behaviour from before
 * zoom/pan existed). It now zooms to the clicked point instead, via
 * react-zoom-pan-pinch's built-in doubleClick handling — "Close Shape"
 * is the one reliable way to close a shape. The click handler still
 * ignores the second click of a double-click (MouseEvent.detail >= 2)
 * so a double-click-to-zoom never also drops a stray vertex.
 *
 * Existing vertices — whether mid-draw or belonging to an already-saved,
 * closed shape loaded for editing — can all be dragged to a new position
 * via pointer events (not click), so the same code path drives both
 * mouse dragging and touch dragging on a tablet on site.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import {
  TransformWrapper,
  TransformComponent,
  useControls,
  useTransformEffect,
} from "react-zoom-pan-pinch";
import { AlertCircle, CheckCircle2, Loader2, Minus, PenLine, Plus, RotateCcw, Undo2 } from "lucide-react";
import type { UnitShapeFormState } from "@/app/[locale]/admin/projects/[id]/site-plan/actions";
import SaveToast from "@/components/admin/SaveToast";

type ShapePoint = { x: number; y: number };

export type DrawerUnit = {
  id: string;
  unitNumber: string;
  status: "AVAILABLE" | "RESERVED" | "SOLD";
  shapePoints: ShapePoint[] | null;
};

type Labels = {
  progress: string; // pre-formatted "{mapped}/{total} units mapped"
  selectUnit: string;
  notMappedGroup: string;
  mappedGroup: string;
  clickHint: string;
  closeShape: string;
  redraw: string;
  undo: string;
  edit: string;
  save: string;
  saving: string;
  saved: string;
  error: string;
  minPointsError: string;
  selectUnitError: string;
  allMapped: string;
  zoomIn: string;
  zoomOut: string;
  resetView: string;
};

type Props = {
  masterPlanImageUrl: string;
  units: DrawerUnit[];
  preselectedUnitId: string | null;
  mappedCount: number;
  totalCount: number;
  action: (state: UnitShapeFormState, formData: FormData) => Promise<UnitShapeFormState>;
  labels: Labels;
};

type Transform = { scale: number; positionX: number; positionY: number };

const STATUS_DOT: Record<DrawerUnit["status"], string> = {
  AVAILABLE: "bg-emerald-500",
  RESERVED: "bg-amber-500",
  SOLD: "bg-ink/30",
};

const clamp = (n: number) => Math.min(100, Math.max(0, n));

/** Screen (viewport) pixel position → percentage of the un-zoomed content
 *  box, given react-zoom-pan-pinch's current pan/scale. See the header
 *  comment for the derivation. */
function screenToPercent(
  clientX: number,
  clientY: number,
  outerRect: DOMRect,
  transform: Transform,
): ShapePoint {
  const localX = clientX - outerRect.left;
  const localY = clientY - outerRect.top;
  const contentX = (localX - transform.positionX) / transform.scale;
  const contentY = (localY - transform.positionY) / transform.scale;
  return {
    x: clamp((contentX / outerRect.width) * 100),
    y: clamp((contentY / outerRect.height) * 100),
  };
}

const INITIAL: UnitShapeFormState = { ok: false };
const INITIAL_TRANSFORM: Transform = { scale: 1, positionX: 0, positionY: 0 };

/** Keeps `transform` (in the parent's state) in sync with
 *  react-zoom-pan-pinch's own state — renders nothing, just a hook
 *  carrier that has to live inside <TransformWrapper> to call
 *  useTransformEffect at all. */
function TransformSync({ onChange }: { onChange: (t: Transform) => void }) {
  useTransformEffect(({ state }) => {
    onChange({ scale: state.scale, positionX: state.positionX, positionY: state.positionY });
  });
  return null;
}

/** +/- / reset — a child of TransformWrapper since useControls() needs
 *  the zoom/pan context it provides. */
function ZoomControls({ labels }: { labels: Labels }) {
  const { zoomIn, zoomOut, resetTransform } = useControls();

  const buttonClass =
    "flex h-9 w-9 items-center justify-center rounded-sm border border-primary/10 bg-white text-primary shadow-card transition-colors hover:bg-primary/5";

  return (
    <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-2">
      <button type="button" aria-label={labels.zoomIn} onClick={() => zoomIn()} className={buttonClass}>
        <Plus size={16} aria-hidden />
      </button>
      <button type="button" aria-label={labels.zoomOut} onClick={() => zoomOut()} className={buttonClass}>
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
    </div>
  );
}

function SaveButton({
  label,
  savingLabel,
  disabled,
}: {
  label: string;
  savingLabel: string;
  disabled: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={disabled || pending} className="admin-btn">
      {pending ? (
        <>
          <Loader2 size={15} className="animate-spin" aria-hidden />
          {savingLabel}
        </>
      ) : (
        label
      )}
    </button>
  );
}

export default function SitePlanDrawer({
  masterPlanImageUrl,
  units,
  preselectedUnitId,
  mappedCount,
  totalCount,
  action,
  labels,
}: Props) {
  const router = useRouter();
  const [state, formAction] = useFormState(action, INITIAL);
  const prevStateRef = useRef(state);

  const outerRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState<Transform>(INITIAL_TRANSFORM);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);

  const firstUnmapped = units.find((u) => u.shapePoints === null)?.id ?? null;
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(
    preselectedUnitId ?? firstUnmapped ?? units[0]?.id ?? null,
  );
  const [points, setPoints] = useState<ShapePoint[]>([]);
  const [closed, setClosed] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // Loading an already-mapped unit shows its existing shape, closed, so
  // the admin can review or immediately re-save without redrawing.
  const loadUnit = (unitId: string) => {
    const unit = units.find((u) => u.id === unitId);
    setSelectedUnitId(unitId);
    setLocalError(null);
    if (unit?.shapePoints && unit.shapePoints.length >= 3) {
      setPoints(unit.shapePoints);
      setClosed(true);
    } else {
      setPoints([]);
      setClosed(false);
    }
  };

  // React to a completed save: pick the next unmapped unit and clear the
  // canvas immediately (optimistic — the tracing workflow is repetitive
  // and 62 units is a lot of round trips to wait on), then let
  // router.refresh() catch the sidebar list and progress count up in the
  // background.
  useEffect(() => {
    if (state === prevStateRef.current) return;
    prevStateRef.current = state;
    if (state.ok && state.message === "SAVED") {
      const next = units.find((u) => u.id !== selectedUnitId && u.shapePoints === null);
      if (next) loadUnit(next.id);
      else {
        setPoints([]);
        setClosed(false);
      }
      router.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // Drag an existing vertex — mouse or touch, uniformly, via the Pointer
  // Events API. Listens on window rather than the dot itself so a fast
  // drag that outruns the (deliberately tiny) hit target doesn't drop
  // the gesture.
  useEffect(() => {
    if (draggingIndex === null) return;

    const handleMove = (event: PointerEvent) => {
      const rect = outerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const point = screenToPercent(event.clientX, event.clientY, rect, transform);
      setPoints((prev) => prev.map((p, i) => (i === draggingIndex ? point : p)));
    };
    const handleUp = () => setDraggingIndex(null);

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
  }, [draggingIndex, transform]);

  const handleVertexPointerDown = (index: number) => (event: React.PointerEvent) => {
    // Stops react-zoom-pan-pinch from also starting a pan gesture from
    // this same pointerdown, and stops the outer canvas's onClick (add a
    // new point) from firing once the click resolves.
    event.stopPropagation();
    event.preventDefault();
    setDraggingIndex(index);
  };

  const handleCanvasClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (closed) return;
    setLocalError(null);

    // Second click of a double-click — leave it for
    // react-zoom-pan-pinch's own zoom-to-point handling, don't also drop
    // a vertex here.
    if (event.detail >= 2) return;

    const rect = outerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const point = screenToPercent(event.clientX, event.clientY, rect, transform);
    setPoints((prev) => [...prev, point]);
  };

  const handleCloseShape = () => {
    if (points.length < 3) {
      setLocalError(labels.minPointsError);
      return;
    }
    setLocalError(null);
    setClosed(true);
  };

  const handleUndo = () => {
    setClosed(false);
    setPoints((prev) => prev.slice(0, -1));
  };

  const handleRedraw = () => {
    setPoints([]);
    setClosed(false);
    setLocalError(null);
  };

  const canSave = closed && points.length >= 3 && !!selectedUnitId;

  const otherShapes = units.filter(
    (u) => u.id !== selectedUnitId && u.shapePoints && u.shapePoints.length >= 3,
  );

  const notMapped = units.filter((u) => u.shapePoints === null);
  const mapped = units.filter((u) => u.shapePoints !== null);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      {/* ── Canvas ────────────────────────────────────────────────────── */}
      <div className="space-y-4">
        <p className="text-sm text-ink-muted">{labels.clickHint}</p>

        <div
          ref={outerRef}
          onClick={handleCanvasClick}
          className="relative aspect-[1754/1241] w-full cursor-crosshair overflow-hidden border border-primary/10 bg-white"
        >
          <TransformWrapper minScale={1} maxScale={8} centerOnInit doubleClick={{ mode: "zoomIn" }}>
            <TransformSync onChange={setTransform} />
            <ZoomControls labels={labels} />

            <TransformComponent wrapperClass="!w-full !h-full" contentClass="!w-full !h-full">
              <div className="relative h-full w-full">
                {/* eslint-disable-next-line @next/next/no-img-element -- raw
                    pixel/percentage click math below assumes a plain <img>,
                    same reasoning as components/SitePlanMap.tsx. */}
                <img
                  src={masterPlanImageUrl}
                  alt=""
                  className="pointer-events-none h-full w-full select-none object-cover"
                  draggable={false}
                />

                <svg
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  className="pointer-events-none absolute inset-0 h-full w-full"
                >
                  {/* Other units' saved shapes, faint, for spatial reference. */}
                  {otherShapes.map((u) => (
                    <polygon
                      key={u.id}
                      points={u.shapePoints!.map((p) => `${p.x},${p.y}`).join(" ")}
                      className="fill-ink/10 stroke-ink/20"
                      strokeWidth={1}
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}

                  {/* The shape currently being drawn/edited. */}
                  {points.length > 0 &&
                    (closed ? (
                      <polygon
                        points={points.map((p) => `${p.x},${p.y}`).join(" ")}
                        className="fill-accent/40 stroke-accent"
                        strokeWidth={1.5}
                        vectorEffect="non-scaling-stroke"
                      />
                    ) : (
                      <polyline
                        points={points.map((p) => `${p.x},${p.y}`).join(" ")}
                        fill="none"
                        className="stroke-accent"
                        strokeWidth={1.5}
                        vectorEffect="non-scaling-stroke"
                      />
                    ))}
                </svg>

                {/* Vertex handles — plain positioned HTML, not SVG, so their
                    on-screen size (8px, 14px on hover) stays literal CSS
                    pixels regardless of the current zoom scale, and so they
                    can carry their own pointer-event drag handlers. */}
                {points.map((p, i) => (
                  <div
                    key={i}
                    onPointerDown={handleVertexPointerDown(i)}
                    onClick={(event) => event.stopPropagation()}
                    style={{ left: `${p.x}%`, top: `${p.y}%`, touchAction: "none" }}
                    className={`absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border border-white bg-accent shadow transition-all duration-150 hover:h-3.5 hover:w-3.5 active:cursor-grabbing ${
                      i === 0 ? "ring-2 ring-primary ring-offset-1" : ""
                    }`}
                  />
                ))}
              </div>
            </TransformComponent>
          </TransformWrapper>
        </div>

        {localError && (
          <p className="flex items-center gap-2 text-sm text-red-700">
            <AlertCircle size={15} aria-hidden />
            {localError}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleCloseShape}
            disabled={closed || points.length < 3}
            className="admin-btn-ghost"
          >
            {labels.closeShape}
          </button>
          <button
            type="button"
            onClick={handleUndo}
            disabled={points.length === 0}
            className="admin-btn-ghost"
          >
            <Undo2 size={14} aria-hidden />
            {labels.undo}
          </button>
          {(closed || points.length > 0) && (
            <button type="button" onClick={handleRedraw} className="admin-btn-ghost">
              {labels.redraw}
            </button>
          )}
        </div>

        <form action={formAction} className="space-y-4 border-t border-primary/10 pt-5">
          <input type="hidden" name="unitId" value={selectedUnitId ?? ""} />
          <input type="hidden" name="shapePoints" value={JSON.stringify(points)} />

          <div>
            <label className="admin-label">{labels.selectUnit}</label>
            <select
              value={selectedUnitId ?? ""}
              onChange={(e) => loadUnit(e.target.value)}
              className="admin-input"
            >
              {notMapped.length > 0 && (
                <optgroup label={labels.notMappedGroup}>
                  {notMapped.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.unitNumber}
                    </option>
                  ))}
                </optgroup>
              )}
              {mapped.length > 0 && (
                <optgroup label={labels.mappedGroup}>
                  {mapped.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.unitNumber}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            {!selectedUnitId && (
              <p className="mt-1.5 text-xs text-red-700">{labels.selectUnitError}</p>
            )}
          </div>

          {state.ok && (
            <SaveToast tone="success" token={state}>
              <CheckCircle2 size={15} aria-hidden />
              {labels.saved}
            </SaveToast>
          )}
          {!state.ok && state.message === "SAVE_FAILED" && (
            <SaveToast tone="error" token={state}>
              <AlertCircle size={15} aria-hidden />
              {labels.error}
            </SaveToast>
          )}

          <SaveButton label={labels.save} savingLabel={labels.saving} disabled={!canSave} />
        </form>
      </div>

      {/* ── Progress + unit list ──────────────────────────────────────── */}
      <aside className="space-y-4">
        <div className="admin-card">
          <p className="text-sm font-medium text-primary">{labels.progress}</p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-primary/10">
            <div
              className="h-full bg-accent"
              style={{ width: `${totalCount === 0 ? 0 : (mappedCount / totalCount) * 100}%` }}
            />
          </div>
        </div>

        {units.length === 0 ? null : (
          <div className="admin-card max-h-[520px] space-y-1 overflow-y-auto">
            {units.map((u) => {
              const isMapped = u.shapePoints !== null;
              const active = u.id === selectedUnitId;
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => loadUnit(u.id)}
                  className={`flex w-full items-center justify-between rounded-sm px-2.5 py-2 text-left text-sm transition-colors ${
                    active ? "bg-accent/10 text-primary" : "text-ink/70 hover:bg-primary/5"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${STATUS_DOT[u.status]}`} />
                    {u.unitNumber}
                  </span>
                  {isMapped ? (
                    <span className="flex items-center gap-1 text-xs font-medium text-emerald-700">
                      <PenLine size={12} aria-hidden />
                      {labels.edit}
                    </span>
                  ) : (
                    <span className="text-xs text-ink-muted">—</span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {mappedCount === totalCount && totalCount > 0 && (
          <p className="text-sm text-emerald-700">{labels.allMapped}</p>
        )}
      </aside>
    </div>
  );
}
