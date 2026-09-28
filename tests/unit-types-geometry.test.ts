/**
 * tests/unit-types-geometry.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The rotation and the card placement behind the unit-types section.
 *
 * Both are the kind of arithmetic that fails quietly. A rotation that is
 * wrong by a transposition still puts every label somewhere on the drawing,
 * just not on the right room; a card that flips the wrong way still opens,
 * just off the top of the screen. Neither throws, so neither is caught by
 * anything except an assertion on the numbers.
 *
 * The corners are asserted explicitly, because a rotation that is its own
 * inverse at the centre — which this one is — passes any test that only
 * checks the middle.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it } from "vitest";
import { labelAnchor, placeCard, toPortrait } from "@/components/unit-types/geometry";

describe("toPortrait", () => {
  /*
    Turning the sheet clockwise: the left edge becomes the top edge. So the
    top-left corner ends up top-right, and the bottom-left ends up top-left.
  */
  it("maps all four corners clockwise", () => {
    expect(toPortrait({ x: 0, y: 0 }, "CW")).toEqual({ x: 100, y: 0 });
    expect(toPortrait({ x: 100, y: 0 }, "CW")).toEqual({ x: 100, y: 100 });
    expect(toPortrait({ x: 100, y: 100 }, "CW")).toEqual({ x: 0, y: 100 });
    expect(toPortrait({ x: 0, y: 100 }, "CW")).toEqual({ x: 0, y: 0 });
  });

  it("maps all four corners anti-clockwise", () => {
    expect(toPortrait({ x: 0, y: 0 }, "CCW")).toEqual({ x: 0, y: 100 });
    expect(toPortrait({ x: 100, y: 0 }, "CCW")).toEqual({ x: 0, y: 0 });
    expect(toPortrait({ x: 100, y: 100 }, "CCW")).toEqual({ x: 100, y: 0 });
    expect(toPortrait({ x: 0, y: 100 }, "CCW")).toEqual({ x: 100, y: 100 });
  });

  it("leaves the centre alone, whichever way it turns", () => {
    expect(toPortrait({ x: 50, y: 50 }, "CW")).toEqual({ x: 50, y: 50 });
    expect(toPortrait({ x: 50, y: 50 }, "CCW")).toEqual({ x: 50, y: 50 });
  });

  it("turns the two directions opposite ways round", () => {
    // The one assertion that fails if CW and CCW are swapped — every
    // symmetric check above would still pass.
    const point = { x: 20, y: 70 };
    expect(toPortrait(point, "CW")).not.toEqual(toPortrait(point, "CCW"));
    expect(toPortrait(point, "CW")).toEqual({ x: 30, y: 20 });
    expect(toPortrait(point, "CCW")).toEqual({ x: 70, y: 80 });
  });

  it("applied four times, returns the point to itself", () => {
    let point = { x: 31, y: 62 };
    for (let i = 0; i < 4; i += 1) point = toPortrait(point, "CW");

    expect(point.x).toBeCloseTo(31, 10);
    expect(point.y).toBeCloseTo(62, 10);
  });
});

describe("labelAnchor", () => {
  it("centres a label in open space", () => {
    expect(labelAnchor(50)).toBe("center");
  });

  it("pulls a label inward near either edge", () => {
    expect(labelAnchor(97)).toBe("end");
    expect(labelAnchor(3)).toBe("start");
  });

  it("keeps the thresholds where the drawing still has room", () => {
    expect(labelAnchor(84)).toBe("center");
    expect(labelAnchor(84.1)).toBe("end");
    expect(labelAnchor(16)).toBe("center");
    expect(labelAnchor(15.9)).toBe("start");
  });
});

describe("placeCard", () => {
  const card = { width: 320, height: 240 };
  const viewport = { width: 1280 };

  it("sits above its pin when there is room", () => {
    const pin = { left: 600, top: 500, width: 80, height: 20 };
    const placed = placeCard(pin, card, viewport);

    expect(placed.below).toBe(false);
    expect(placed.top).toBeLessThan(pin.top);
    expect(placed.top + card.height).toBeLessThanOrEqual(pin.top);
  });

  it("flips underneath when the pin is near the top of the viewport", () => {
    const pin = { left: 600, top: 40, width: 80, height: 20 };
    const placed = placeCard(pin, card, viewport);

    expect(placed.below).toBe(true);
    expect(placed.top).toBeGreaterThanOrEqual(pin.top + pin.height);
  });

  it("centres on the pin away from the edges", () => {
    const pin = { left: 600, top: 500, width: 80, height: 20 };
    const placed = placeCard(pin, card, viewport);

    expect(placed.left + card.width / 2).toBe(640);
  });

  it("does not overflow the right edge", () => {
    const pin = { left: 1250, top: 500, width: 20, height: 20 };
    const placed = placeCard(pin, card, viewport);

    expect(placed.left + card.width).toBeLessThanOrEqual(viewport.width);
  });

  it("does not overflow the left edge", () => {
    const pin = { left: 4, top: 500, width: 20, height: 20 };
    const placed = placeCard(pin, card, viewport);

    expect(placed.left).toBeGreaterThanOrEqual(0);
  });

  /*
    The half of the placement that is easy to forget. Once the card has been
    pushed away from an edge it is no longer centred on its pin, so a caret
    fixed at the card's midpoint points at nothing.
  */
  it("keeps the caret pointing at the pin after the card is pushed inward", () => {
    const pin = { left: 1250, top: 500, width: 20, height: 20 };
    const placed = placeCard(pin, card, viewport);

    const caretOnScreen = placed.left + placed.caretLeft;
    expect(caretOnScreen).toBeGreaterThan(pin.left - card.width / 2);
    expect(Math.abs(caretOnScreen - (pin.left + pin.width / 2))).toBeLessThanOrEqual(18);
  });

  it("keeps the caret inside the card even for a pin at the very edge", () => {
    for (const left of [0, 20, 640, 1260, 1279]) {
      const placed = placeCard({ left, top: 500, width: 10, height: 20 }, card, viewport);

      expect(placed.caretLeft).toBeGreaterThanOrEqual(0);
      expect(placed.caretLeft).toBeLessThanOrEqual(card.width);
    }
  });

  it("survives a viewport narrower than the card", () => {
    const placed = placeCard({ left: 10, top: 300, width: 20, height: 20 }, card, {
      width: 280,
    });

    expect(Number.isFinite(placed.left)).toBe(true);
    expect(placed.left).toBeGreaterThanOrEqual(0);
    expect(placed.caretLeft).toBeLessThanOrEqual(card.width);
  });
});
