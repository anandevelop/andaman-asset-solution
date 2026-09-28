"use client";

/**
 * components/admin/unit-types/FloorPlanPinner.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Placing and moving room pins on a floor plan.
 *
 * Coordinates are percentages of the *line drawing*, the same 0–100 space
 * ProjectUnit.shapePoints uses for the master plan. Percentages rather than
 * pixels because the drawing is displayed at whatever width the column
 * happens to be, and on the public site at a different width again — a
 * pixel offset would be right on exactly one screen.
 *
 * That is also why the furnished view can be toggled underneath without
 * touching the pins: both images describe the same building at the same
 * crop, so one set of coordinates serves both. When the crops disagree the
 * pins drift, which is what the aspect warning upstream is for.
 *
 * Pointer Events throughout, not mouse events: the drawings get edited on
 * tablets, and `pointerdown`/`setPointerCapture` is the one API that covers
 * mouse, pen and touch without three code paths — and capture is what keeps
 * a drag alive when the pointer leaves the plan mid-move.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useRef, useState } from "react";
import { Crosshair, ImageOff } from "lucide-react";

export type PinnerRoom = {
  /** Draft-local key; a saved room's database id, or a temporary one. */
  key: string;
  label: string;
  xPercent: number;
  yPercent: number;
  hasPhoto: boolean;
};

type Props = {
  lineImageUrl: string;
  furnishedImageUrl: string | null;
  /** width / height of the line drawing, for the reserved box. */
  aspect: number;
  rooms: PinnerRoom[];
  selectedKey: string | null;
  placing: boolean;
  readOnly: boolean;
  labels: {
    lineView: string;
    furnishedView: string;
    placePin: string;
    stopPlacing: string;
    placeHint: string;
    dragHint: string;
    noPlan: string;
    noPlanHint: string;
    deleteSelected: string;
  };
  onPlace: (x: number, y: number) => void;
  onMove: (key: string, x: number, y: number) => void;
  onSelect: (key: string | null) => void;
  onTogglePlacing: () => void;
  onDeleteSelected: () => void;
};

/** Two decimals is finer than anyone can click and keeps the payload small. */
const round = (value: number) => Math.round(value * 100) / 100;
const clamp = (value: number) => Math.min(100, Math.max(0, value));

export default function FloorPlanPinner({
  lineImageUrl,
  furnishedImageUrl,
  aspect,
  rooms,
  selectedKey,
  placing,
  readOnly,
  labels,
  onPlace,
  onMove,
  onSelect,
  onTogglePlacing,
  onDeleteSelected,
}: Props) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [furnished, setFurnished] = useState(false);
  const dragging = useRef<string | null>(null);

  /** Pointer position as a percentage of the drawing. */
  const pointToPercent = useCallback((event: React.PointerEvent) => {
    const box = canvasRef.current?.getBoundingClientRect();
    if (!box || box.width === 0 || box.height === 0) return null;

    return {
      x: round(clamp(((event.clientX - box.left) / box.width) * 100)),
      y: round(clamp(((event.clientY - box.top) / box.height) * 100)),
    };
  }, []);

  const onCanvasClick = (event: React.PointerEvent) => {
    if (!placing || readOnly) return;
    const point = pointToPercent(event);
    if (point) onPlace(point.x, point.y);
  };

  const startDrag = (event: React.PointerEvent, key: string) => {
    if (readOnly) return;
    event.stopPropagation();
    onSelect(key);

    // Capture on the pin itself: without it a quick drag that leaves the
    // plan drops the pin wherever the last event landed.
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
    dragging.current = key;
  };

  const onDrag = (event: React.PointerEvent) => {
    if (!dragging.current) return;
    const point = pointToPercent(event);
    if (point) onMove(dragging.current, point.x, point.y);
  };

  const endDrag = () => {
    dragging.current = null;
  };

  if (!lineImageUrl) {
    return (
      <div className="flex min-h-56 flex-col items-center justify-center gap-2 rounded-xs border border-dashed border-primary/20 bg-surface-muted p-8 text-center">
        <ImageOff size={20} className="text-ink-muted" aria-hidden />
        <p className="text-sm font-medium text-ink">{labels.noPlan}</p>
        <p className="admin-hint max-w-sm">{labels.noPlanHint}</p>
      </div>
    );
  }

  const background = furnished && furnishedImageUrl ? furnishedImageUrl : lineImageUrl;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xs border border-primary/15 p-0.5">
          {(["line", "furnished"] as const).map((view) => {
            const active = (view === "furnished") === furnished;
            const disabled = view === "furnished" && !furnishedImageUrl;

            return (
              <button
                key={view}
                type="button"
                disabled={disabled}
                onClick={() => setFurnished(view === "furnished")}
                aria-pressed={active}
                className={`rounded-xs px-2.5 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  active ? "bg-primary font-medium text-white" : "text-ink-muted hover:text-primary"
                }`}
              >
                {view === "line" ? labels.lineView : labels.furnishedView}
              </button>
            );
          })}
        </div>

        {!readOnly && (
          <>
            <button
              type="button"
              onClick={onTogglePlacing}
              aria-pressed={placing}
              className={placing ? "admin-btn" : "admin-btn-ghost"}
            >
              <Crosshair size={14} aria-hidden />
              {placing ? labels.stopPlacing : labels.placePin}
            </button>

            {selectedKey && (
              <button type="button" onClick={onDeleteSelected} className="admin-btn-ghost">
                {labels.deleteSelected}
              </button>
            )}
          </>
        )}
      </div>

      <div
        ref={canvasRef}
        onPointerDown={onCanvasClick}
        onPointerMove={onDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        style={{ aspectRatio: `${aspect}`, backgroundImage: `url(${background})` }}
        className={`relative w-full select-none rounded-xs border border-primary/15 bg-contain bg-center bg-no-repeat ${
          placing ? "cursor-crosshair" : ""
        }`}
      >
        {rooms.map((room, index) => {
          const selected = room.key === selectedKey;

          return (
            <button
              key={room.key}
              type="button"
              onPointerDown={(event) => startDrag(event, room.key)}
              style={{ left: `${room.xPercent}%`, top: `${room.yPercent}%` }}
              className={`absolute flex -translate-x-1/2 -translate-y-1/2 touch-none items-center gap-1 whitespace-nowrap rounded-xs border px-1.5 py-0.5 text-[10px] leading-tight shadow-sm transition-colors ${
                selected
                  ? "z-10 border-accent-700 bg-accent-700 text-white"
                  : "border-primary/30 bg-white/90 text-primary hover:border-accent-700"
              } ${readOnly ? "" : "cursor-grab active:cursor-grabbing"}`}
            >
              <span className="tabular-nums opacity-70">
                {String(index + 1).padStart(2, "0")}
              </span>
              {room.label}
              {/* An unmissable mark for the one thing the team is here to
                  fix: a room with no photo cannot open a card on the site. */}
              {!room.hasPhoto && (
                <span
                  aria-hidden
                  className="ml-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
                />
              )}
            </button>
          );
        })}
      </div>

      <p className="admin-hint">{placing ? labels.placeHint : labels.dragHint}</p>
    </div>
  );
}
