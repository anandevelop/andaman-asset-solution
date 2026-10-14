/**
 * tests/map-places.test.ts — the per-place pin on the project page's
 * "Nearby" list (NearbyPlace.latitude/longitude): what the admin field
 * accepts, and what the map routes to.
 */
import { describe, expect, it } from "vitest";
import {
  formatCoordinateInput,
  nearbyTarget,
  parseCoordinates,
  routeParam,
  searchLinkUrl,
} from "@/lib/map-places";

describe("parseCoordinates", () => {
  it("accepts the shapes Google Maps copies", () => {
    for (const typed of ["7.9758, 98.2794", "7.9758,98.2794", " 7.9758 98.2794 "]) {
      expect(parseCoordinates(typed)).toEqual({ lat: 7.9758, lng: 98.2794 });
    }
    expect(parseCoordinates("-33.86, 151.2")).toEqual({ lat: -33.86, lng: 151.2 });
  });

  it("rejects anything that is not a pin", () => {
    for (const typed of ["", "หาดสุรินทร์ ภูเก็ต", "95, 98.2", "7.97, 181", "7.97", "141/4 Moo 2"]) {
      expect(parseCoordinates(typed)).toBeNull();
    }
    expect(parseCoordinates(null)).toBeNull();
  });

  it("round-trips through the editor's field", () => {
    const pin = { lat: 7.9758, lng: 98.2794 };
    expect(parseCoordinates(formatCoordinateInput(pin))).toEqual(pin);
    expect(formatCoordinateInput(null)).toBe("");
  });
});

describe("nearbyTarget", () => {
  it("routes to the pin when there is one", () => {
    expect(routeParam(nearbyTarget({ lat: 7.9758, lng: 98.2794 }, "Surin Beach"))).toBe("7.9758,98.2794");
  });

  it("routes by the name, narrowed to Phuket, without one", () => {
    expect(nearbyTarget(null, "Bangtao Beach")).toEqual({ query: "Bangtao Beach, Phuket" });
  });

  it("checks the pin itself in Google Maps", () => {
    expect(searchLinkUrl({ lat: 7.9758, lng: 98.2794 })).toBe(
      "https://www.google.com/maps/search/?api=1&query=7.9758%2C98.2794",
    );
  });
});
