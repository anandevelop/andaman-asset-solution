/**
 * tests/lib/map-places.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The map panel's arithmetic and URL shapes (lib/map-places.ts).
 *
 * Worth testing because none of it fails loudly. A swapped host still
 * renders — as a blank iframe or a refused navigation, in production,
 * once. A distance off by a factor is still a plausible-looking number
 * beside a project name. And `openingStatus` answers for Phuket from a
 * server that could be in any zone, which is exactly the class of bug that
 * only shows up between 17:00 and 01:00 UTC.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it } from "vitest";

import {
  coordinatePair,
  embedRouteUrl,
  formatCoordinates,
  formatKm,
  haversineKm,
  openingStatus,
  placeEmbedUrl,
  routeLinkUrl,
  routeParam,
} from "@/lib/map-places";

/** The real pins this site ships with — config/site.ts and prisma/seed.ts. */
const OFFICE = { lat: 7.999478, lng: 98.3101671 };
const AIRPORT = { lat: 8.1132, lng: 98.3169 };
const RESIDENCE_PRIME = { lat: 8.0190325, lng: 98.3241176 };
const TRINITY_VILLAGE = { lat: 7.9992298, lng: 98.3228863 };

describe("haversineKm", () => {
  it("measures the office to each development", () => {
    // The figures the client signed off on, to the precision the panel
    // actually prints. A regression here is a wrong number on a live page.
    expect(formatKm(haversineKm(OFFICE, RESIDENCE_PRIME))).toBe("2.7");
    expect(formatKm(haversineKm(OFFICE, TRINITY_VILLAGE))).toBe("1.4");
    expect(formatKm(haversineKm(OFFICE, AIRPORT))).toBe("13");
  });

  it("is symmetric and zero for a point against itself", () => {
    expect(haversineKm(OFFICE, AIRPORT)).toBeCloseTo(haversineKm(AIRPORT, OFFICE), 10);
    expect(haversineKm(OFFICE, OFFICE)).toBe(0);
  });

  it("does not confuse latitude with longitude", () => {
    // A degree of longitude at this latitude is shorter than a degree of
    // latitude — swapping the two arguments would make these equal.
    const north = haversineKm(OFFICE, { lat: OFFICE.lat + 1, lng: OFFICE.lng });
    const east = haversineKm(OFFICE, { lat: OFFICE.lat, lng: OFFICE.lng + 1 });
    expect(north).toBeGreaterThan(east);
  });
});

describe("formatKm", () => {
  it("keeps at most one decimal below 10 km and rounds above it", () => {
    expect(formatKm(2.66)).toBe("2.7");
    expect(formatKm(9.94)).toBe("9.9");
    expect(formatKm(10)).toBe("10");
    expect(formatKm(12.667)).toBe("13");
  });

  it("does not add a decimal the source did not have", () => {
    // The Sale Kit's drive distances are whole numbers, and the route card
    // sits next to a row printing the same figure unformatted.
    expect(formatKm(3)).toBe("3");
    expect(formatKm(7)).toBe("7");
  });
});

describe("formatCoordinates", () => {
  it("prints four decimals with a hemisphere", () => {
    expect(formatCoordinates(RESIDENCE_PRIME)).toBe("8.0190° N, 98.3241° E");
  });

  it("names the southern and western hemispheres", () => {
    expect(formatCoordinates({ lat: -33.8688, lng: -70.6693 })).toBe(
      "33.8688° S, 70.6693° W",
    );
  });

  it("copies the full precision, not the rounded display", () => {
    expect(coordinatePair(RESIDENCE_PRIME)).toBe("8.0190325, 98.3241176");
  });
});

describe("routeParam", () => {
  it("passes a coordinate through as lat,lng", () => {
    expect(routeParam(RESIDENCE_PRIME)).toBe("8.0190325,98.3241176");
  });

  it("encodes a name without rewriting it", () => {
    // The caller decides whether to narrow a place name; this only encodes.
    expect(routeParam({ query: "Layan Beach, Phuket" })).toBe("Layan%20Beach%2C%20Phuket");
  });
});

describe("the two URL shapes", () => {
  /*
    These assert the exact hosts. The framed route has to come from
    maps.google.com/maps?…&output=embed and the new-tab link from
    google.com/maps/dir/?api=1 — the other combinations render an empty
    frame or a refused navigation, neither of which fails at build time.
  */
  it("draws a route inside the frame from the embed endpoint", () => {
    expect(embedRouteUrl("7.9,98.3", "8.1,98.3")).toBe(
      "https://maps.google.com/maps?saddr=7.9,98.3&daddr=8.1,98.3&output=embed",
    );
  });

  it("opens a route in a new tab from the directions page", () => {
    expect(routeLinkUrl("7.9,98.3", "8.1,98.3")).toBe(
      "https://www.google.com/maps/dir/?api=1&origin=7.9,98.3&destination=8.1,98.3",
    );
  });

  it("centres a place embed on the coordinate itself", () => {
    expect(placeEmbedUrl(OFFICE, "th")).toBe(
      "https://www.google.com/maps?q=7.999478,98.3101671&z=15&output=embed&hl=th",
    );
    expect(placeEmbedUrl(OFFICE)).toBe(
      "https://www.google.com/maps?q=7.999478,98.3101671&z=15&output=embed",
    );
  });
});

describe("openingStatus", () => {
  const WINDOW = { open: "09:00", close: "18:00", timeZone: "Asia/Bangkok" };

  /** A UTC instant, so the assertion states the Bangkok time it means. */
  const at = (utc: string) => new Date(utc);

  it("reads the office's own clock, not the server's", () => {
    // 03:00Z is 10:00 in Bangkok — open — and 22:00 the previous day in
    // Los Angeles, which is where a naive getHours() would land in CI.
    expect(openingStatus(WINDOW, at("2026-03-02T03:00:00Z"))).toEqual({
      isOpen: true,
      opensTomorrow: false,
    });
  });

  it("is closed before opening, and says it opens today", () => {
    // 01:00Z → 08:00 Bangkok.
    expect(openingStatus(WINDOW, at("2026-03-02T01:00:00Z"))).toEqual({
      isOpen: false,
      opensTomorrow: false,
    });
  });

  it("is closed after closing, and says it opens tomorrow", () => {
    // 14:00Z → 21:00 Bangkok.
    expect(openingStatus(WINDOW, at("2026-03-02T14:00:00Z"))).toEqual({
      isOpen: false,
      opensTomorrow: true,
    });
  });

  it("treats the closing minute as closed", () => {
    // 11:00Z → exactly 18:00 Bangkok.
    expect(openingStatus(WINDOW, at("2026-03-02T11:00:00Z"))?.isOpen).toBe(false);
    // 10:59Z → 17:59.
    expect(openingStatus(WINDOW, at("2026-03-02T10:59:00Z"))?.isOpen).toBe(true);
  });

  it("handles a window that crosses midnight", () => {
    const night = { open: "22:00", close: "02:00", timeZone: "Asia/Bangkok" };
    // 17:00Z → 00:00 Bangkok, inside the window.
    expect(openingStatus(night, at("2026-03-02T17:00:00Z"))?.isOpen).toBe(true);
    // 05:00Z → 12:00 Bangkok, outside it.
    expect(openingStatus(night, at("2026-03-02T05:00:00Z"))?.isOpen).toBe(false);
  });

  it("returns null rather than guessing at a window it cannot read", () => {
    // null is what hides the badge. Every one of these used to be a way to
    // render a confident "Open now" that nobody had checked.
    expect(openingStatus({ ...WINDOW, open: "9am" })).toBeNull();
    expect(openingStatus({ ...WINDOW, close: "" })).toBeNull();
    expect(openingStatus({ ...WINDOW, open: "25:00" })).toBeNull();
    expect(openingStatus({ ...WINDOW, timeZone: "Mars/Olympus_Mons" })).toBeNull();
  });
});
