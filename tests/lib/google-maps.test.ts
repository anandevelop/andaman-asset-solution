/**
 * tests/lib/google-maps.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * resolveMapEmbedSrc — turning an admin-pasted Maps link into a URL that
 * will actually frame.
 *
 * The case that motivated this file is the first one: a /maps/place/ URL
 * carries both the pin (`!3d…!4d…`) and the camera (`@lat,lng`), they are
 * not the same point, and the code used to take the camera. For The
 * Residence Prime's share link the two are ~200 m apart — and because the
 * map draws its own marker at the centre of the frame, the error is a pin
 * standing in the road rather than a slightly-off viewport.
 *
 * Only short links hit the network (a HEAD to resolve the redirect), so
 * every case below is offline.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it } from "vitest";

import { resolveMapEmbedSrc } from "@/lib/google-maps";

/** The `q=` value of whatever embed came back. */
function embeddedQuery(src: string | null): string | null {
  if (src === null) return null;
  return new URL(src).searchParams.get("q");
}

describe("resolveMapEmbedSrc", () => {
  it("prefers the pin over the map's centre", async () => {
    // Both present, ~200 m apart. !3d/!4d is the place; @ is the camera.
    const url =
      "https://www.google.com/maps/place/The+Residence+Prime/@8.0175,98.3230,17z/" +
      "data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d8.0190325!4d98.3241176";

    expect(embeddedQuery(await resolveMapEmbedSrc(url))).toBe("8.0190325,98.3241176");
  });

  it("falls back to the camera when there is no pin", async () => {
    const url = "https://www.google.com/maps/place/Somewhere/@8.0175,98.3230,17z";

    // Passed through as written, not reparsed as a number — the trailing
    // zero survives, and Google reads it the same either way.
    expect(embeddedQuery(await resolveMapEmbedSrc(url))).toBe("8.0175,98.3230");
  });

  it("finds a pin in a data query parameter, not just in the path", async () => {
    const url = "https://www.google.com/maps?data=!3m1!4b1!8m2!3d7.999478!4d98.3101671";

    expect(embeddedQuery(await resolveMapEmbedSrc(url))).toBe("7.999478,98.3101671");
  });

  it("still reads a plain q= search and a bare place name", async () => {
    expect(embeddedQuery(await resolveMapEmbedSrc("https://www.google.com/maps?q=Layan+Beach")))
      .toBe("Layan Beach");
    expect(
      embeddedQuery(await resolveMapEmbedSrc("https://www.google.com/maps/place/Boat+Avenue/")),
    ).toBe("Boat Avenue");
  });

  it("builds a framable search embed, never the pasted URL itself", async () => {
    // A /maps/place/ page refuses to be framed whatever you append to it,
    // so the output must always be the ?q=…&output=embed shape.
    const src = await resolveMapEmbedSrc(
      "https://www.google.com/maps/place/X/@8.01,98.32,17z/data=!8m2!3d8.019!4d98.324",
    );

    expect(src).toBe("https://www.google.com/maps?q=8.019%2C98.324&z=15&output=embed");
  });

  it("returns null for anything it cannot place", async () => {
    expect(await resolveMapEmbedSrc(null)).toBeNull();
    expect(await resolveMapEmbedSrc("")).toBeNull();
    expect(await resolveMapEmbedSrc("not a url")).toBeNull();
    expect(await resolveMapEmbedSrc("https://example.com/maps?q=8.01,98.32")).toBeNull();
    expect(await resolveMapEmbedSrc("https://www.google.com/maps")).toBeNull();
  });
});
