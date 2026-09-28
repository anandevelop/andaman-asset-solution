"use client";

/**
 * components/unit-types/UnitTypesElevator.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Unit types, presented as a ride up through the house.
 *
 * The houses these plans describe have their own lifts, and the section
 * borrows that: a panel of floor buttons, a display that counts as it
 * travels, and the plan sliding in from the direction a lift would have
 * come from. It replaces a stack of flat images that gave no sense that the
 * floors belonged to one another.
 *
 * WHAT THIS COMPONENT OWNS
 *
 * Which type is showing, which floor, whether the car is moving, and which
 * room photo is open. Nothing else: every figure arrives formatted and
 * every label arrives finished — see types.ts for why that is not an
 * accident.
 *
 * `busy` is a real constraint rather than a nicety. A second press during
 * the 900ms travel would start a new transition from a car that has not
 * arrived, and the plan would draw itself in over a floor the display has
 * already left.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import FloorCar from "./FloorCar";
import LiftPanel from "./LiftPanel";
import RoomPhotoCard from "./RoomPhotoCard";
import type { ElevatorLabels, ElevatorRoom, ElevatorType } from "./types";

/** Matches the CSS transition on the car. */
const TRAVEL_MS = 900;
/** Below this the board stacks and the plans stand up — see FloorCar. */
const PORTRAIT_MAX = 1000;

type Props = {
  projectName: string;
  types: ElevatorType[];
  labels: ElevatorLabels;
  /**
   * Preview mode for the admin screen: skips the travel animation so an
   * editor adjusting a pin sees the result immediately rather than waiting
   * out a lift ride on every keystroke.
   */
  variant?: "site" | "preview";
};

export default function UnitTypesElevator({
  projectName,
  types,
  labels,
  variant = "site",
}: Props) {
  const [typeIndex, setTypeIndex] = useState(0);
  const [floorIndex, setFloorIndex] = useState(0);
  const [direction, setDirection] = useState<1 | -1 | 0>(0);
  const [busy, setBusy] = useState(false);
  const [drawn, setDrawn] = useState(true);
  const [portrait, setPortrait] = useState(false);
  const [openRoom, setOpenRoom] = useState<{ room: ElevatorRoom; element: HTMLElement } | null>(
    null,
  );

  const type = types[Math.min(typeIndex, types.length - 1)];
  // Memoised because goToFloor closes over it: a fresh [] every render
  // would rebuild that callback every render, and with it every button.
  const floors = useMemo(() => type?.floors ?? [], [type]);
  const floor = floors[Math.min(floorIndex, floors.length - 1)];

  const reducedMotion = useRef(false);
  useEffect(() => {
    reducedMotion.current =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  useEffect(() => {
    const check = () => setPortrait(window.innerWidth < PORTRAIT_MAX);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  /** Rooms with a photo, in schedule order — what ‹ › steps through. */
  const photoRooms = useMemo(
    () => (floor?.rooms ?? []).filter((room) => room.photoUrl),
    [floor],
  );

  const closeRoom = useCallback(() => {
    setOpenRoom((current) => {
      // Focus goes back where it came from, or the keyboard is stranded at
      // the top of the document.
      current?.element.focus();
      return null;
    });
  }, []);

  const goToFloor = useCallback(
    (next: number) => {
      if (busy || next === floorIndex || !floors[next]) return;

      closeRoom();
      setDirection(next > floorIndex ? 1 : -1);
      setFloorIndex(next);

      if (reducedMotion.current || variant === "preview") {
        setDrawn(true);
        setDirection(0);
        return;
      }

      setBusy(true);
      setDrawn(false);
    },
    [busy, closeRoom, floorIndex, floors, variant],
  );

  // The arrival: the car has stopped, so the plan may draw itself in.
  useEffect(() => {
    if (!busy) return;

    const timer = setTimeout(() => {
      setBusy(false);
      setDirection(0);
      setDrawn(true);
    }, TRAVEL_MS);

    return () => clearTimeout(timer);
  }, [busy]);

  const selectType = useCallback(
    (index: number) => {
      if (index === typeIndex) return;
      closeRoom();
      setTypeIndex(index);
      setFloorIndex(0);
      setDirection(0);
      setBusy(false);
      setDrawn(true);
    },
    [closeRoom, typeIndex],
  );

  const stepRoom = useCallback(
    (delta: number) => {
      setOpenRoom((current) => {
        if (!current || photoRooms.length < 2) return current;

        const at = photoRooms.findIndex((room) => room.id === current.room.id);
        const next = photoRooms[(at + delta + photoRooms.length) % photoRooms.length];

        // The pin for the room being stepped to, so the card re-anchors.
        const element =
          (document.querySelector(
            `[data-room-pin][data-room-id="${next.id}"]`,
          ) as HTMLElement | null) ?? current.element;

        return { room: next, element };
      });
    },
    [photoRooms],
  );

  if (!type || !floor) return null;

  const openIndex = openRoom
    ? Math.max(
        photoRooms.findIndex((room) => room.id === openRoom.room.id),
        0,
      )
    : 0;

  return (
    <section
      id="unit-types"
      className="scroll-mt-24 bg-[#041d2c] py-16 text-white sm:py-24"
    >
      <div className="container-luxe">
        <p className="eyebrow text-accent">{labels.eyebrow}</p>
        <h2 className="mt-3 text-3xl font-light text-white sm:text-4xl">{type.title}</h2>
        <p className="mt-2.5 text-sm text-white/60">{type.subtitle}</p>

        {/* Type chips — pointless with a single type. */}
        {types.length > 1 && (
          <div className="mt-7 flex flex-wrap gap-2">
            {types.map((candidate, index) => (
              <button
                key={candidate.id}
                type="button"
                onClick={() => selectType(index)}
                aria-pressed={index === typeIndex}
                className={`rounded-xs border px-3.5 py-2 text-left transition-colors ${
                  index === typeIndex
                    ? "border-accent shadow-[inset_0_-2px_0_var(--color-accent)]"
                    : "border-[#c3d3dd]/25 hover:border-accent/60"
                }`}
              >
                <b className="block text-[13px] font-medium text-white">{candidate.name}</b>
                <span className="mt-0.5 block text-[11px] text-white/55">
                  {candidate.chipMeta}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* ── The board ───────────────────────────────────────────── */}
        <div
          className="relative mt-9 grid grid-cols-1 border border-[#c3d3dd]/20 lg:grid-cols-[92px_1fr_300px]"
          style={{
            background:
              "linear-gradient(rgba(195,211,221,.06) 1px,transparent 1px) 0 0/40px 40px," +
              "linear-gradient(90deg,rgba(195,211,221,.06) 1px,transparent 1px) 0 0/40px 40px,#062a41",
          }}
        >
          <LiftPanel
            floors={floors}
            activeIndex={floorIndex}
            direction={direction}
            moving={busy}
            labels={labels}
            onSelect={goToFloor}
          />

          {/* The shaft. In portrait it is a tall box centred in its column —
              it was flush left at around 920px before the margin. */}
          <div
            className="relative mx-auto w-full overflow-hidden p-5 lg:min-h-[clamp(420px,38vw,560px)] lg:p-[34px]"
            style={
              portrait
                ? {
                    aspectRatio: `1 / ${floor.aspect}`,
                    maxHeight: "78vh",
                    maxWidth: `calc(78vh / ${floor.aspect})`,
                  }
                : undefined
            }
          >
            {floors.map((candidate, index) => (
              <FloorCar
                key={candidate.id}
                floor={candidate}
                offset={
                  index === floorIndex ? "current" : index > floorIndex ? "above" : "below"
                }
                drawn={index === floorIndex && drawn}
                portrait={portrait}
                priority={index === floorIndex}
                openRoomId={openRoom?.room.id ?? null}
                onOpenRoom={(room, element) => setOpenRoom({ room, element })}
              />
            ))}
          </div>

          {/* ── Title block ───────────────────────────────────────── */}
          <div className="border-t border-[#c3d3dd]/15 font-mono lg:border-l lg:border-t-0">
            <Row label={labels.project} value={projectName} />

            <div className="grid grid-cols-3">
              <Cell label={labels.type} value={type.code} />
              <Cell label={labels.bed} value={type.bedrooms} bordered />
              <Cell label={labels.bath} value={type.bathrooms} bordered />
            </div>

            <Row label={labels.floor} value={floor.name} />

            <div className="border-b border-[#c3d3dd]/15 px-4.5 py-3.5">
              <Key>{labels.areaThisFloor}</Key>
              <div className="mt-1.5 text-4xl font-extralight leading-none text-white">
                {floor.areaLabel ?? "—"}
                {floor.areaLabel && (
                  <small className="ml-1 text-xs text-white/55">{labels.sqm}</small>
                )}
              </div>
            </div>

            <div className="px-4.5 py-3.5">
              <Key>{labels.areaByFloor}</Key>
              <div className="mt-2.5 flex flex-col-reverse gap-1">
                {floors.map((candidate, index) => (
                  <div
                    key={candidate.id}
                    className={`flex items-center gap-2.5 font-mono text-[11px] transition-colors ${
                      index === floorIndex ? "text-white" : "text-white/55"
                    }`}
                  >
                    <b
                      className={`h-3.5 transition-[background-color,width] duration-700 ${
                        index === floorIndex ? "bg-accent" : "bg-[#c3d3dd]/20"
                      }`}
                      style={{ width: `${Math.max(candidate.areaRatio * 150, 4)}px` }}
                    />
                    {candidate.shortLabel} · {candidate.areaLabel ?? "—"}
                  </div>
                ))}
              </div>

              {type.totalAreaLabel && (
                <>
                  <div className="mt-3.5">
                    <Key>{labels.total}</Key>
                  </div>
                  <div className="mt-1.5 text-[15px] text-white">
                    {type.totalAreaLabel} {labels.sqm}
                  </div>
                </>
              )}

              {floor.rooms.length > 0 && (
                <div className="mt-4">
                  <Key>
                    {labels.roomSchedule} · {floor.shortLabel}
                  </Key>
                  <ol className="mt-2 max-h-52 list-none overflow-auto p-0">
                    {floor.rooms.map((room, index) => (
                      <ScheduleRow
                        key={room.id}
                        room={room}
                        index={index}
                        open={openRoom?.room.id === room.id}
                        onOpen={(element) => setOpenRoom({ room, element })}
                      />
                    ))}
                  </ol>
                </div>
              )}
            </div>

            <div className="px-4.5 py-3.5 font-mono text-[10px] tracking-[0.1em] text-[#c3d3dd]/50">
              {labels.notToScale}
            </div>
          </div>
        </div>
      </div>

      {openRoom && (
        <RoomPhotoCard
          room={openRoom.room}
          context={`${projectName} · ${floor.name}`}
          index={openIndex}
          total={photoRooms.length}
          anchorEl={openRoom.element}
          labels={labels}
          onClose={closeRoom}
          onStep={stepRoom}
        />
      )}
    </section>
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-[#c3d3dd]/55">
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-[#c3d3dd]/15 px-4.5 py-3.5">
      <Key>{label}</Key>
      <div className="mt-1.5 text-[15px] text-white">{value}</div>
    </div>
  );
}

function Cell({ label, value, bordered }: { label: string; value: string; bordered?: boolean }) {
  return (
    <div
      className={`border-b border-[#c3d3dd]/15 px-4.5 py-3.5 ${
        bordered ? "border-l border-l-[#c3d3dd]/15" : ""
      }`}
    >
      <Key>{label}</Key>
      <div className="mt-1.5 text-[15px] text-white">{value}</div>
    </div>
  );
}

function ScheduleRow({
  room,
  index,
  open,
  onOpen,
}: {
  room: ElevatorRoom;
  index: number;
  open: boolean;
  onOpen: (element: HTMLElement) => void;
}) {
  const content = (
    <>
      <span className="text-accent">{String(index + 1).padStart(2, "0")}</span>
      <span className="flex items-center">{room.name}</span>
      <b className="font-normal text-white">{room.areaLabel ?? "—"}</b>
    </>
  );

  const shell =
    "grid w-full grid-cols-[24px_1fr_auto] gap-1.5 border-b border-dashed border-[#c3d3dd]/12 py-1 text-left font-mono text-[11px]";

  if (!room.photoUrl) {
    return <li className={`${shell} text-white/75`}>{content}</li>;
  }

  return (
    <li>
      <button
        type="button"
        data-room-pin
        data-room-id={room.id}
        aria-expanded={open}
        onClick={(event) => onOpen(event.currentTarget)}
        className={`${shell} transition-colors ${open ? "text-white" : "text-white/75 hover:text-white"}`}
      >
        {content}
      </button>
    </li>
  );
}
