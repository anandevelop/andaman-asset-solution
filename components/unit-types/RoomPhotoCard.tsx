"use client";

/**
 * components/unit-types/RoomPhotoCard.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The show-home photo for one room, floating over its pin.
 *
 * Positioned `fixed` and re-placed on scroll, because it is anchored to a
 * pin on a drawing that scrolls: a card that stays put while its pin moves
 * stops being a label for anything. The placement itself is
 * geometry.ts's placeCard, which has its own tests — the only thing done
 * here is measuring the pin and the card and handing over the numbers.
 *
 * On a phone it stops being a floating card at all and becomes a sheet
 * along the bottom edge. A 320px card pinned to a 390px-wide screen is
 * almost the whole viewport anyway, and it would cover the drawing it is
 * supposed to be explaining.
 *
 * The photos are of the project's show home, not of that particular unit
 * type's rooms — matched by room name during seeding. The badge says so on
 * every one of them rather than in a footnote, because the difference
 * matters to somebody choosing between two types.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { placeCard } from "./geometry";
import type { ElevatorLabels, ElevatorRoom } from "./types";

/** Below this the card becomes a bottom sheet — see the header. */
const SHEET_BREAKPOINT = 600;

type Props = {
  room: ElevatorRoom;
  /** "The Victory · 1st Floor" — already assembled by the caller. */
  context: string;
  /** Position in the floor's photo-bearing rooms, for "2 / 8". */
  index: number;
  total: number;
  /** The pin or schedule row this card belongs to. */
  anchorEl: HTMLElement | null;
  labels: ElevatorLabels;
  onClose: () => void;
  onStep: (delta: number) => void;
};

export default function RoomPhotoCard({
  room,
  context,
  index,
  total,
  anchorEl,
  labels,
  onClose,
  onStep,
}: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const caretRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  /*
    The card is positioned by writing to the node, not by holding its
    coordinates in state.

    It follows its pin on every scroll frame and for the whole 900ms the
    shaft is moving. Through state that is a re-render per frame of a
    component holding a full-bleed image; through the node it is two style
    assignments. React never needs to know where the card is — nothing else
    renders from it.
  */
  const reposition = useCallback(() => {
    const card = cardRef.current;
    if (!card) return;

    if (window.innerWidth <= SHEET_BREAKPOINT) {
      card.dataset.sheet = "true";
      card.style.left = card.style.top = "";
      return;
    }

    delete card.dataset.sheet;
    if (!anchorEl) return;

    const rect = anchorEl.getBoundingClientRect();
    const placed = placeCard(
      { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      { width: card.offsetWidth, height: card.offsetHeight },
      { width: window.innerWidth },
    );

    card.style.left = `${placed.left}px`;
    card.style.top = `${placed.top}px`;
    // Only revealed once it has somewhere to be — otherwise the first paint
    // puts a 320px card in the viewport's top-left corner and it visibly
    // flicks across to the pin.
    card.style.visibility = "visible";
    card.dataset.below = String(placed.below);

    if (caretRef.current) caretRef.current.style.left = `${placed.caretLeft}px`;
  }, [anchorEl]);

  useEffect(() => {
    window.addEventListener("scroll", reposition, { passive: true });
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition);
      window.removeEventListener("resize", reposition);
    };
  }, [reposition]);

  /*
    The shaft animates for 0.9s after a floor change, and the pin moves with
    it. One placement at open time would leave the card behind, so it is
    re-placed every frame until the movement has finished.
  */
  useEffect(() => {
    let raf = 0;
    const until = performance.now() + 1000;
    const tick = () => {
      reposition();
      if (performance.now() < until) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reposition]);

  // Focus moves into the card so the keyboard follows the eye, and the
  // caller returns it to the pin on close.
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
      if (total > 1 && event.key === "ArrowRight") onStep(1);
      if (total > 1 && event.key === "ArrowLeft") onStep(-1);
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onStep, total]);

  // A click anywhere that is not the card and not a pin closes it. Pins are
  // excluded so clicking a second room swaps the card rather than closing
  // and reopening it.
  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest("[data-room-photo-card]") || target.closest("[data-room-pin]")) return;
      onClose();
    };

    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [onClose]);

  if (!room.photoUrl) return null;

  return (
    <div
      ref={cardRef}
      data-room-photo-card
      role="dialog"
      aria-label={room.name}
      /*
        Starts hidden and off-screen. reposition() reveals it once it has a
        measured place to be; the sheet layout below overrides all of it
        through the data attribute the same function sets.
      */
      style={{ left: 0, top: 0, visibility: "hidden" }}
      className="fixed z-60 w-80 overflow-visible rounded-xs border border-accent/30 bg-[#062538] shadow-[0_30px_70px_-20px_rgba(0,0,0,.7)] data-[sheet=true]:inset-x-3 data-[sheet=true]:bottom-3 data-[sheet=true]:top-auto data-[sheet=true]:w-auto data-[sheet=true]:visible"
    >
      <RoomPhoto
        // Keyed by the photo, so stepping to the next room mounts a fresh
        // element and the fade starts from zero — rather than an effect
        // resetting a "loaded" flag after the new src has already painted.
        key={room.photoUrl}
        src={room.photoUrl}
        alt={room.name}
        badge={labels.showHomePhoto}
      >
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label={labels.close}
          className="absolute right-2.5 top-2.5 grid h-7 w-7 place-items-center rounded-full border border-white/25 bg-[#041d2c]/60 text-lg font-light text-white backdrop-blur-sm transition-colors hover:bg-[#041d2c]/85"
        >
          ×
        </button>
      </RoomPhoto>

      <div className="px-4 pb-3 pt-3.5">
        <p className="mb-1.5 font-mono text-[9.5px] uppercase tracking-[0.2em] text-accent">
          {context}
        </p>

        <div className="flex items-baseline justify-between gap-3">
          <b className="text-[21px] font-light leading-tight text-white">{room.name}</b>
          {room.areaLabel && (
            <span className="whitespace-nowrap text-base font-light text-white">
              {room.areaLabel}
              <small className="ml-1 text-[11px] text-white/50">{labels.sqm}</small>
            </span>
          )}
        </div>

        {total > 1 && (
          <div className="mt-3 flex items-center justify-between border-t border-[#c3d3dd]/15 pt-2.5">
            <button
              type="button"
              onClick={() => onStep(-1)}
              aria-label={labels.previousRoom}
              className="grid h-7 w-7 place-items-center rounded-full border border-[#c3d3dd]/30 text-lg font-light text-white transition-colors hover:border-accent hover:bg-accent/15"
            >
              ‹
            </button>
            <span className="font-mono text-[11px] tracking-[0.14em] text-white/50">
              {index + 1} / {total}
            </span>
            <button
              type="button"
              onClick={() => onStep(1)}
              aria-label={labels.nextRoom}
              className="grid h-7 w-7 place-items-center rounded-full border border-[#c3d3dd]/30 text-lg font-light text-white transition-colors hover:border-accent hover:bg-accent/15"
            >
              ›
            </button>
          </div>
        )}
      </div>

      {/* Points at the pin. Hidden as a sheet, which has no pin to point at;
          flipped by the data attribute reposition() sets. */}
      <i
        ref={caretRef}
        aria-hidden
        className="absolute top-full h-3 w-3 -translate-x-1/2 -translate-y-1.5 rotate-45 border border-l-0 border-t-0 border-accent/30 bg-[#062538] data-[hidden=true]:hidden [[data-below='true']_&]:bottom-full [[data-below='true']_&]:top-auto [[data-below='true']_&]:translate-y-1.5 [[data-below='true']_&]:border-l [[data-below='true']_&]:border-t [[data-below='true']_&]:border-b-0 [[data-below='true']_&]:border-r-0 [[data-sheet='true']_&]:hidden"
      />
    </div>
  );
}

/**
 * The photo itself, fading up once it has decoded.
 *
 * Its own component purely so it can be keyed: mounting is what resets the
 * fade, which is otherwise an effect that clears a flag after the browser
 * has already painted the new image at full opacity.
 */
function RoomPhoto({
  src,
  alt,
  badge,
  children,
}: {
  src: string;
  alt: string;
  badge: string;
  children: React.ReactNode;
}) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className="relative aspect-16/10 overflow-hidden rounded-t-xs bg-[#041d2c]">
      <Image
        src={src}
        alt={alt}
        fill
        sizes="(max-width: 600px) 100vw, 320px"
        onLoad={() => setLoaded(true)}
        className={`object-cover transition-[opacity,transform] duration-700 ease-out ${
          loaded ? "scale-100 opacity-100" : "scale-[1.06] opacity-0"
        }`}
      />
      {children}
      <span className="pointer-events-none absolute bottom-2.5 left-2.5 rounded-xs bg-[#041d2c]/60 px-2 py-1 text-[9px] font-medium uppercase tracking-[0.2em] text-white backdrop-blur-sm">
        {badge}
      </span>
    </div>
  );
}
