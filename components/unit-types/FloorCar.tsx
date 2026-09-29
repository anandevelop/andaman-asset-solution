"use client";

/**
 * components/unit-types/FloorCar.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * One floor's drawing inside the shaft, with its room labels.
 *
 * THE BOX IS RESERVED FROM DATA, NOT MEASURED FROM THE IMAGE
 *
 * The plan's real proportions come from the database (FloorPlan.imageWidth /
 * imageHeight) and go straight into `aspect-ratio`. The mockup measured
 * `naturalWidth` on load and sized the box in JavaScript, which is a layout
 * that only becomes correct once the image has arrived — so every floor
 * change flashed a differently-shaped frame, and the room pins, positioned
 * in percentages of that frame, slid into place afterwards.
 *
 * PORTRAIT IS THE SAME FILE, TURNED
 *
 * One drawing is stored, in landscape, and rotated with CSS on a narrow
 * screen — not a second portrait file. The pins rotate with it via
 * geometry.ts's toPortrait, so the two cannot disagree. Which direction a
 * floor turns is stored per floor: turning the wrong way puts the front
 * door at the top of the screen.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Image from "next/image";
import { labelAnchor, toPortrait } from "./geometry";
import type { ElevatorFloor, ElevatorRoom } from "./types";

type Props = {
  floor: ElevatorFloor;
  /** Where this floor sits relative to the one on screen. */
  offset: "above" | "current" | "below";
  /** True once the car has arrived and the plan may draw itself in. */
  drawn: boolean;
  portrait: boolean;
  /** Only the current floor's images are worth fetching eagerly. */
  priority: boolean;
  openRoomId: string | null;
  onOpenRoom: (room: ElevatorRoom, element: HTMLElement) => void;
};

const ANCHOR_CLASS = {
  start: "translate-x-0 -translate-y-1/2",
  center: "-translate-x-1/2 -translate-y-1/2",
  end: "-translate-x-full -translate-y-1/2",
} as const;

export default function FloorCar({
  floor,
  offset,
  drawn,
  portrait,
  priority,
  openRoomId,
  onOpenRoom,
}: Props) {
  const translate =
    offset === "current" ? "translateY(0)" : offset === "above" ? "translateY(-110%)" : "translateY(110%)";

  return (
    <div
      className="absolute inset-5 transition-transform duration-[900ms] ease-[cubic-bezier(.65,0,.35,1)] motion-reduce:transition-none @min-[1000px]:inset-[34px]"
      style={{ transform: translate }}
      aria-hidden={offset !== "current"}
    >
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{
          // In portrait the shaft itself is already 1 : aspect (see
          // UnitTypesElevator), so the box fills it. Shrinking it again by
          // 1/aspect here drew the plan at a third of the shaft's width.
          width: "100%",
          aspectRatio: portrait ? `1 / ${floor.aspect}` : `${floor.aspect}`,
        }}
      >
        <div
          className="relative h-full w-full transition-[clip-path] duration-[1300ms] ease-[cubic-bezier(.65,0,.35,1)] motion-reduce:transition-none"
          style={{ clipPath: drawn ? "inset(0 0 0 0)" : "inset(0 100% 0 0)" }}
        >
          {/*
            The drawing is rotated inside a square-swapped box: at 90° its
            own width runs down the screen, so the element is sized to the
            box's *height* before turning.
          */}
          <div
            className="absolute left-1/2 top-1/2 origin-center"
            style={
              portrait
                ? {
                    width: `${floor.aspect * 100}%`,
                    height: `${100 / floor.aspect}%`,
                    transform: `translate(-50%, -50%) rotate(${
                      floor.rotation === "CCW" ? -90 : 90
                    }deg)`,
                  }
                : { width: "100%", height: "100%", transform: "translate(-50%, -50%)" }
            }
          >
            <Image
              src={floor.imageUrl}
              alt={floor.name}
              fill
              priority={priority}
              loading={priority ? undefined : "lazy"}
              sizes="(min-width: 1000px) 60vw, 100vw"
              className="object-fill drop-shadow-[0_0_6px_rgba(160,200,225,.25)]"
            />
          </div>
        </div>

        {/* Labels fade in after the plan has finished drawing itself. */}
        <div
          className={`absolute inset-0 transition-opacity duration-500 motion-reduce:transition-none ${
            drawn ? "opacity-100 delay-[900ms]" : "opacity-0"
          }`}
        >
          {floor.rooms.map((room) => {
            const point = portrait
              ? toPortrait({ x: room.x, y: room.y }, floor.rotation)
              : { x: room.x, y: room.y };
            const anchor = labelAnchor(point.x);
            const open = openRoomId === room.id;

            const base =
              "absolute whitespace-nowrap border px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.06em] text-[#ffd9a8]";
            const position = `${ANCHOR_CLASS[anchor]}`;

            if (!room.photoUrl) {
              return (
                <span
                  key={room.id}
                  style={{ left: `${point.x}%`, top: `${point.y}%` }}
                  className={`${base} ${position} pointer-events-none border-accent/45 bg-[#041d2c]/75`}
                >
                  {room.name}
                </span>
              );
            }

            return (
              <button
                key={room.id}
                type="button"
                data-room-pin
                // The card's ‹ › steps find the next pin by this, so it has
                // to match the id used in the schedule rows.
                data-room-id={room.id}
                aria-expanded={open}
                onClick={(event) => onOpenRoom(room, event.currentTarget)}
                style={{ left: `${point.x}%`, top: `${point.y}%` }}
                className={`${base} ${position} inline-flex items-center transition-colors ${
                  open
                    ? "border-accent bg-accent/15"
                    : "border-accent/45 bg-[#041d2c]/75 hover:border-accent hover:bg-accent/15"
                }`}
              >
                {room.name}
                <CameraIcon />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Outline camera, marking a label that has a photo behind it. */
function CameraIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      className="ml-1.5 h-2.5 w-2.5 shrink-0 opacity-75"
    >
      <path d="M4 7h3l2-3h6l2 3h3v13H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}
