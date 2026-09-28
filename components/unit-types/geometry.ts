/**
 * components/unit-types/geometry.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The two pieces of arithmetic behind the unit-types section, kept out of
 * the components so they can be tested without a DOM.
 *
 * Both exist because the obvious version is wrong in a way that only shows
 * up on a real screen: a room label a few percent out reads as sloppy
 * pinning rather than as a maths error, and a photo card that opens off the
 * top of the viewport looks like it failed to open at all.
 * ─────────────────────────────────────────────────────────────────────────
 */

export type Point = { x: number; y: number };
export type Rotation = "CW" | "CCW";

/**
 * A pin's place on the plan once it has been turned upright for a phone.
 *
 * The plan is stored once, in landscape, and rotated with CSS — so the pins,
 * which are stored against the landscape drawing, have to be rotated to
 * match. Turning the image clockwise moves what was the left edge to the
 * top, so a point's old y becomes its new x measured from the right:
 *
 *   CW   (x, y) → (100 − y, x)
 *   CCW  (x, y) → (y, 100 − x)
 *
 * Which way a floor turns is a stored per-floor decision, not a constant:
 * Trinity Village's Type B reads correctly turned anti-clockwise and
 * everything else clockwise, and turning one the wrong way puts the front
 * door at the top of the screen.
 */
export function toPortrait(point: Point, rotation: Rotation): Point {
  return rotation === "CCW"
    ? { x: point.y, y: 100 - point.x }
    : { x: 100 - point.y, y: point.x };
}

/**
 * How a pin's label is anchored so it cannot hang off the drawing.
 *
 * A label is centred on its pin until the pin is near an edge, at which
 * point it is pushed inward — the plan is drawn edge to edge inside the
 * shaft, so a centred label on a pin at 97% would be half outside the frame.
 */
export function labelAnchor(xPercent: number): "start" | "center" | "end" {
  if (xPercent > 84) return "end";
  if (xPercent < 16) return "start";
  return "center";
}

export type Rect = { left: number; top: number; width: number; height: number };

export type CardPlacement = {
  left: number;
  top: number;
  /** True when the card sits under its pin, with the caret pointing up. */
  below: boolean;
  /** Caret offset from the card's own left edge. */
  caretLeft: number;
};

/** Gap between the pin and the card, and the card's minimum margin from the
 *  viewport edge. Both small enough to feel attached, big enough to read. */
const GAP = 14;
const EDGE = 10;
/** How close to the top the card may come before it flips underneath. */
const FLIP_MARGIN = 8;
/** Keeps the caret from sliding off the card's own rounded corners. */
const CARET_INSET = 18;

/**
 * Where to put the floating room-photo card, given its pin.
 *
 * Above the pin by default, because the pin sits on a drawing the reader is
 * looking at and a card below it would cover what they just clicked. It
 * flips underneath only when there is genuinely no room above — measured
 * against the viewport, not the section, since the card is positioned
 * `fixed` and the section scrolls.
 *
 * Horizontally the card is centred on the pin and then clamped into the
 * viewport, and the caret moves independently so it keeps pointing at the
 * pin even once the card itself has been pushed sideways. Without that
 * second step a pin near the right edge got a card with a caret pointing
 * into empty space several centimetres away.
 */
export function placeCard(
  anchor: Rect,
  card: { width: number; height: number },
  viewport: { width: number },
): CardPlacement {
  const centre = anchor.left + anchor.width / 2;
  const below = anchor.top - card.height - GAP - 4 < FLIP_MARGIN;

  const top = below ? anchor.top + anchor.height + GAP : anchor.top - card.height - GAP;

  const maxLeft = Math.max(EDGE, viewport.width - card.width - EDGE);
  const left = Math.min(Math.max(centre - card.width / 2, EDGE), maxLeft);

  const caretLeft = Math.min(
    Math.max(centre - left, CARET_INSET),
    Math.max(CARET_INSET, card.width - CARET_INSET),
  );

  return { left, top, below, caretLeft };
}
