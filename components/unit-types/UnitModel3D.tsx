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

export type Model3dRoom = RoomInfo;

export type Model3dLabels = {
  top: string;
  overview: string;
  street: string;
  walls: string;
  wallModes: [string, string, string];
  hint: string;
  loading: string;
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
