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
 * THE 3D VIEW
 *
 * A type with a house model (components/unit-types/model3d) gets a
 * แปลน | 3D switch, and opens on 3D: the model takes the shaft's place,
 * the lift panel picks its floor (no ride — the model moves itself), and a
 * tapped room shows in the title block under its name from the admin,
 * matched by English name (./match-room.ts). Only on the site: the admin
 * preview has no project to load.
 *
 * `busy` is a real constraint rather than a nicety. A second press during
 * the 900ms travel would start a new transition from a car that has not
 * arrived, and the plan would draw itself in over a floor the display has
 * already left.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image as ImageIcon } from "lucide-react";
import FloorCar from "./FloorCar";
import LiftPanel from "./LiftPanel";
import RoomPhotoCard from "./RoomPhotoCard";
import UnitModel3D, { type Model3dRoom } from "./UnitModel3D";
import { matchRoom } from "./match-room";
import type { ElevatorLabels, ElevatorRoom, ElevatorType } from "./types";

/** Matches the CSS transition on the car. */
const TRAVEL_MS = 900;
/**
 * Below this *container* width the board stacks and the plans stand up —
 * see FloorCar. It must be the same number as the `@min-[1000px]:` variants
 * in this folder, and both are measured on the same element (`host` below).
 *
 * It used to be `window.innerWidth < 1000` in JS against Tailwind's `lg:`
 * (1024px, viewport) in CSS. Between 1000 and 1023px the script said
 * "landscape" while the stylesheet had already stacked the board, so the
 * shaft got neither its portrait aspect-ratio nor its landscape min-height
 * and collapsed to a strip with every room label piled on top of each other.
 * Measuring the component's own box also makes the admin preview's
 * 380px "mobile" frame turn portrait, which a viewport query never could.
 */
const PORTRAIT_MAX = 1000;

type Props = {
  projectName: string;
  /** Which project's 3D models to load. Omitted by the admin preview. */
  projectSlug?: string;
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
  projectSlug,
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

  const [mode, setMode] = useState<"3d" | "plan">("3d");
  const [room3d, setRoom3d] = useState<Model3dRoom | null>(null);

  const type = types[Math.min(typeIndex, types.length - 1)];
  const can3d = Boolean(type?.model3d && projectSlug && variant === "site");
  const show3d = can3d && mode === "3d";
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

  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    // Content box, to match what the container query measures
    // (container-luxe has side padding).
    const check = () => {
      const style = getComputedStyle(element);
      const inner =
        element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      setPortrait(inner < PORTRAIT_MAX);
    };
    check();
    const observer = new ResizeObserver(check);
    observer.observe(element);
    return () => observer.disconnect();
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
      setRoom3d(null);
      setDirection(next > floorIndex ? 1 : -1);
      setFloorIndex(next);

      // No lift ride in 3D: the model moves its own camera.
      if (reducedMotion.current || variant === "preview" || show3d) {
        setDrawn(true);
        setDirection(0);
        return;
      }

      setBusy(true);
      setDrawn(false);
    },
    [busy, closeRoom, floorIndex, floors, variant, show3d],
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
      setRoom3d(null);
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

  // The admin's room for the one tapped in the model, when there is one.
  const picked = room3d ? matchRoom(room3d.name, floor.rooms) : null;
  const pickedIndex = picked ? floor.rooms.indexOf(picked) : -1;

  const openIndex = openRoom
    ? Math.max(
        photoRooms.findIndex((room) => room.id === openRoom.room.id),
        0,
      )
    : 0;

  return (
    <section
      id="unit-types"
      className="scroll-mt-24 bg-[#041d2c] py-14 text-white sm:py-20"
    >
      <div ref={host} className="container-luxe @container">
        <p className="eyebrow text-accent">{labels.eyebrow}</p>
        <h2 className="mt-2.5 text-2xl font-light text-white sm:text-3xl">{type.title}</h2>
        <p className="mt-2 text-[13px] text-white/55">{type.subtitle}</p>

        <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
        {/* Type chips — pointless with a single type. */}
        {types.length > 1 ? (
          <div className="flex flex-wrap gap-2">
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
        ) : (
          <span />
        )}

        {can3d && (
          <div
            role="group"
            aria-label={labels.viewMode}
            className="inline-flex rounded-xs border border-[#c3d3dd]/25 p-0.5"
          >
            {(["plan", "3d"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={mode === value}
                onClick={() => {
                  setMode(value);
                  setRoom3d(null);
                  closeRoom();
                }}
                className={`rounded-xs px-3.5 py-1.5 text-[12.5px] transition-colors ${
                  mode === value ? "bg-accent font-medium text-[#062a41]" : "text-white/65 hover:text-white"
                }`}
              >
                {value === "plan" ? labels.viewPlan : labels.view3d}
              </button>
            ))}
          </div>
        )}
        </div>

        {/* ── The board ───────────────────────────────────────────── */}
        <div
          className="relative mt-6 grid grid-cols-1 border border-[#c3d3dd]/20 @min-[1000px]:grid-cols-[80px_1fr_260px]"
          style={{
            /* Two grids, not one: the 40px major lines read as a drawing
               board, and the 8px minor ones are what make it read as
               *squared paper* rather than a table. */
            background:
              "linear-gradient(rgba(195,211,221,.06) 1px,transparent 1px) 0 0/40px 40px," +
              "linear-gradient(90deg,rgba(195,211,221,.06) 1px,transparent 1px) 0 0/40px 40px," +
              "linear-gradient(rgba(195,211,221,.03) 1px,transparent 1px) 0 0/8px 8px," +
              "linear-gradient(90deg,rgba(195,211,221,.03) 1px,transparent 1px) 0 0/8px 8px,#062a41",
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

          {show3d && projectSlug ? (
            <div className="relative h-[min(70vh,520px)] @min-[1000px]:h-auto @min-[1000px]:min-h-[clamp(380px,30vw,460px)]">
              <UnitModel3D
                projectSlug={projectSlug}
                typeCode={type.code}
                floorIndex={floorIndex}
                floorShort={floor.shortLabel}
                labels={labels.model3d}
                onRoom={setRoom3d}
              />
            </div>
          ) : (
          /* The shaft. In portrait it is a tall box centred in its column —
              it was flush left at around 920px before the margin. */
          <div
            className="relative mx-auto w-full overflow-hidden p-5 @min-[1000px]:min-h-[clamp(380px,30vw,460px)] @min-[1000px]:p-7"
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
            {/* A drawing of a building carries its orientation. */}
            <span
              aria-hidden
              className="absolute right-5 top-4 z-10 grid h-8 w-8 place-items-center rounded-full border border-[#c3d3dd]/35 font-mono text-[10px] font-medium text-[#c3d3dd]/80"
            >
              N
            </span>

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
          )}

          {/* ── Title block ───────────────────────────────────────── */}
          {/* Mono for the keys and the schedule, Roboto for the values — the
              mockup's .tb .v. With the values in mono too, "Ground Floor"
              and 178.09 read as code rather than as a drawing's title block. */}
          <div className="border-t border-[#c3d3dd]/15 font-mono @min-[1000px]:border-l @min-[1000px]:border-t-0">
            <Row label={labels.project} value={projectName} />

            <div className="grid grid-cols-3">
              <Cell label={labels.type} value={type.code} />
              <Cell label={labels.bed} value={type.bedrooms} bordered />
              <Cell label={labels.bath} value={type.bathrooms} bordered />
            </div>

            <Row label={labels.floor} value={floor.name} />

            {show3d && (
              <div className="border-b border-[#c3d3dd]/15 bg-accent/5 px-4 py-2.5">
                <Key>
                  {room3d
                    ? `${labels.room} ${String(pickedIndex >= 0 ? pickedIndex + 1 : room3d.n).padStart(2, "0")}`
                    : labels.room}
                </Key>
                <div className="mt-1 font-sans text-[13.5px] text-white">
                  {/* The admin's name for the room — so all four languages —
                      and the model's own only when no room matches. */}
                  {room3d ? (picked?.name ?? room3d.name) : labels.tapRoom3d}
                </div>
                {room3d && (
                  <div className="mt-0.5 text-[10.5px] text-white/50">
                    {picked?.areaLabel ?? room3d.sqm.toFixed(2)} {labels.sqm} ·{" "}
                    {room3d.share.toFixed(1)}% {labels.ofFloor}
                  </div>
                )}
              </div>
            )}

            <div className="border-b border-[#c3d3dd]/15 px-4 py-2.5">
              <Key>{labels.areaThisFloor}</Key>
              <div className="mt-1 font-sans text-[28px] font-extralight leading-none text-white">
                {floor.areaLabel ?? "—"}
                {floor.areaLabel && (
                  <small className="ml-1 text-[11px] text-white/50">{labels.sqm}</small>
                )}
              </div>
            </div>

            <div className="px-4 py-2.5">
              <Key>{labels.areaByFloor}</Key>
              <div className="mt-2 flex flex-col-reverse gap-1">
                {floors.map((candidate, index) => (
                  <div
                    key={candidate.id}
                    className={`flex items-center gap-2 font-mono text-[10.5px] transition-colors ${
                      index === floorIndex ? "text-white" : "text-white/55"
                    }`}
                  >
                    <b
                      className={`h-2.5 transition-[background-color,width] duration-700 ${
                        index === floorIndex ? "bg-accent" : "bg-[#c3d3dd]/20"
                      }`}
                      style={{ width: `${Math.max(candidate.areaRatio * 130, 4)}px` }}
                    />
                    {candidate.shortLabel} · {candidate.areaLabel ?? "—"}
                  </div>
                ))}
              </div>

              {type.totalAreaLabel && (
                <>
                  <div className="mt-3">
                    <Key>{labels.total}</Key>
                  </div>
                  <div className="mt-1 font-sans text-[13.5px] text-white">
                    {type.totalAreaLabel} {labels.sqm}
                  </div>
                </>
              )}

              {floor.rooms.length > 0 && (
                <div className="mt-3">
                  <Key>
                    {labels.roomSchedule} · {floor.shortLabel}
                  </Key>
                  <ol className="mt-1.5 max-h-44 list-none overflow-auto p-0">
                    {floor.rooms.map((room, index) => (
                      <ScheduleRow
                        key={room.id}
                        room={room}
                        index={index}
                        open={openRoom?.room.id === room.id || (show3d && picked?.id === room.id)}
                        onOpen={(element) => setOpenRoom({ room, element })}
                      />
                    ))}
                  </ol>
                </div>
              )}
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
    <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#c3d3dd]/55">
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-[#c3d3dd]/15 px-4 py-2.5">
      <Key>{label}</Key>
      <div className="mt-1 font-sans text-[13.5px] text-white">{value}</div>
    </div>
  );
}

function Cell({ label, value, bordered }: { label: string; value: string; bordered?: boolean }) {
  return (
    <div
      className={`border-b border-[#c3d3dd]/15 px-4 py-2.5 ${
        bordered ? "border-l border-l-[#c3d3dd]/15" : ""
      }`}
    >
      <Key>{label}</Key>
      <div className="mt-1 font-sans text-[13.5px] text-white">{value}</div>
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
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="truncate">{room.name}</span>
        {/* Says "this one opens a photo" before anybody has to hover. */}
        {room.photoUrl && <ImageIcon size={11} aria-hidden className="shrink-0 text-accent/80" />}
      </span>
      <b className="font-normal text-white">{room.areaLabel ?? "—"}</b>
    </>
  );

  const shell =
    "grid w-full grid-cols-[24px_1fr_auto] gap-1.5 border-b border-dashed border-[#c3d3dd]/12 py-[3px] text-left font-mono text-[10.5px]";

  if (!room.photoUrl) {
    // `open` without a photo is the room tapped in the 3D view.
    return <li className={`${shell} ${open ? "text-accent" : "text-white/75"}`}>{content}</li>;
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
