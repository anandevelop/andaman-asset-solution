"use client";

/**
 * components/unit-types/UnitModel3D.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The "3D" view of the unit-types section: one project's house models
 * (components/unit-types/model3d), shown at the type and floor the section
 * already has selected.
 *
 * three.js (~150 KB gzipped) and the plan data are imported only once the
 * section nears the viewport (useNearViewport) — never with the page, and
 * not at all for a visitor who does not scroll that far.
 * The scene is built once per project; switching type or floor only moves
 * it. Floors are matched by their short label ("G", "1", "2"), falling
 * back to position when a label is not found (both run ground up).
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef, useState } from "react";
import type { RoomInfo, UnitScene } from "./model3d/scene";
import type { ViewName } from "./model3d/types";
import { useNearViewport } from "@/components/useNearViewport";
import { Minus, Plus, RotateCcw } from "lucide-react";

export type Model3dRoom = RoomInfo;

export type Model3dLabels = {
  top: string;
  overview: string;
  street: string;
  walls: string;
  wallModes: [string, string, string];
  hint: string;
  loading: string;
  zoomIn: string;
  zoomOut: string;
  resetView: string;
};

const VIEWS: ViewName[] = ["plan", "overview", "street"];

export default function UnitModel3D({
  projectSlug,
  typeCode,
  floorIndex,
  floorShort,
  labels,
  onRoom,
}: {
  projectSlug: string;
  typeCode: string;
  floorIndex: number;
  floorShort: string;
  labels: Model3dLabels;
  onRoom: (room: Model3dRoom | null) => void;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const scene = useRef<UnitScene | null>(null);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<ViewName | null>("plan");
  const [wallMode, setWallMode] = useState(0);
  const near = useNearViewport(stage);

  // The latest callback and position, read by the scene's async setup and
  // its event handlers without rebuilding the scene when they change.
  const onRoomRef = useRef(onRoom);
  const want = useRef({ typeCode, floorIndex, floorShort });
  useEffect(() => {
    onRoomRef.current = onRoom;
    want.current = { typeCode, floorIndex, floorShort };
  });

  useEffect(() => {
    if (!near) return;
    let disposed = false;
    let instance: UnitScene | null = null;

    Promise.all([import("./model3d/scene"), import("./model3d")]).then(
      async ([{ UnitScene: Scene }, { loadModel3d }]) => {
        const project = await loadModel3d(projectSlug);
        if (disposed || !project || !stage.current) return;
        instance = new Scene(
          stage.current,
          project,
          (room) => onRoomRef.current(room),
          (next) => setView(next),
        );
        const { typeCode: code, floorIndex: index, floorShort: short } = want.current;
        instance.setType(code, false);
        instance.setFloor(instance.floorFor(short, index), false);
        scene.current = instance;
        setReady(true);
      },
    );

    return () => {
      disposed = true;
      instance?.dispose();
      scene.current = null;
      setReady(false);
    };
  }, [projectSlug, near]);

  // Type and floor follow the section. setType resets the floor to the top
  // one, so the section's floor is applied after it.
  const lastType = useRef<string | null>(null);
  useEffect(() => {
    const current = scene.current;
    if (!ready || !current) return;
    if (lastType.current !== typeCode) {
      if (lastType.current !== null) current.setType(typeCode);
      lastType.current = typeCode;
    }
    current.setFloor(current.floorFor(floorShort, floorIndex));
    onRoomRef.current(null);
  }, [ready, typeCode, floorIndex, floorShort]);

  return (
    <div ref={stage} className="relative h-full min-h-[inherit] w-full overflow-hidden">
      {!ready && (
        <p className="absolute inset-0 grid place-items-center font-mono text-[11px] uppercase tracking-[0.16em] text-[#c3d3dd]/55">
          {labels.loading}
        </p>
      )}

      <div
        role="toolbar"
        className="absolute inset-x-3 bottom-3 z-[2] flex flex-wrap gap-1.5 @min-[1000px]:inset-x-auto @min-[1000px]:bottom-4 @min-[1000px]:left-4"
      >
        {VIEWS.map((id) => (
          <Control key={id} on={view === id} onClick={() => scene.current?.setView(id)}>
            {id === "plan" ? labels.top : id === "overview" ? labels.overview : labels.street}
          </Control>
        ))}
        <Control on={wallMode > 0} onClick={() => setWallMode(scene.current?.cycleWalls() ?? wallMode)}>
          {labels.walls} · {labels.wallModes[wallMode]}
        </Control>
      </div>

      {/* Top right: the bottom edge belongs to the view buttons and the
          hint, and the lift panel is to the left of the stage. */}
      <div className="absolute right-3 top-3 z-[2] flex flex-col gap-1.5 @min-[1000px]:right-4 @min-[1000px]:top-4">
        {(
          [
            { id: "in", label: labels.zoomIn, icon: <Plus size={16} aria-hidden /> },
            { id: "out", label: labels.zoomOut, icon: <Minus size={16} aria-hidden /> },
            { id: "reset", label: labels.resetView, icon: <RotateCcw size={15} aria-hidden /> },
          ] as const
        ).map((b) => (
          <button
            key={b.id}
            type="button"
            aria-label={b.label}
            title={b.label}
            disabled={!ready}
            onClick={() => {
              if (b.id === "reset") scene.current?.reset();
              else scene.current?.zoom(b.id === "in" ? 0.75 : 1 / 0.75);
            }}
            className="grid h-9 w-9 place-items-center rounded-xs border border-[#c3d3dd]/25 bg-[#062a41]/85 text-white/75 transition-colors hover:border-accent/60 hover:text-accent disabled:opacity-40"
          >
            {b.icon}
          </button>
        ))}
      </div>

      <p className="pointer-events-none absolute bottom-4 right-4 z-[2] hidden font-mono text-[9px] uppercase tracking-[0.14em] text-[#c3d3dd]/40 @min-[1000px]:block">
        {labels.hint}
      </p>
    </div>
  );
}

function Control({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`rounded-xs border bg-[#062a41]/85 px-2 py-1 text-[11px] transition-colors ${
        on ? "border-accent/60 text-accent" : "border-[#c3d3dd]/25 text-white/65 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}
