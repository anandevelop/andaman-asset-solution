/**
 * lib/map-places.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The arithmetic and URL shapes behind the map's route explorer
 * (components/MapCard.tsx, and the two pages that feed it).
 *
 * NOT `server-only`, deliberately. Most of this runs on the server — the
 * contact page precomputes every office→project distance during its ISR
 * render so no browser does trigonometry — but `haversineKm` and the two
 * URL builders are also what the visitor's own "how far is it from you?"
 * needs, and that coordinate never leaves their device. One module, both
 * sides; tests/client-server-only.test.ts enforces the absence of the
 * import.
 *
 * WHY THESE EXACT URL SHAPES
 *
 * Google serves two different things and only one of them frames:
 *
 *  - `maps.google.com/maps?saddr=…&daddr=…&output=embed` renders a route
 *    inside an <iframe> with no API key. This is the one that works.
 *  - `google.com/maps/dir/?api=1&origin=…&destination=…` is the real Maps
 *    page for a new tab. It refuses to be framed (X-Frame-Options), same
 *    as every /maps/place/ and /maps/dir/ URL — see lib/google-maps.ts's
 *    header for the longer version of that discovery.
 *
 * So the card that shows a route in place and the link that opens it in
 * Maps are built from two different hosts on purpose. Swapping either for
 * the other's shape produces a blank frame or a refused navigation, not a
 * near miss, and neither fails at build time.
 *
 * Distances here are straight-line, and every label that shows one says
 * so. The driving distances on a project page come from the Sale Kit
 * (content/nearby-attractions.ts) and are real; inventing a drive time by
 * multiplying a crow-flies kilometre by some fudge factor would put a
 * fabricated number next to a measured one in the same list.
 * ─────────────────────────────────────────────────────────────────────────
 */

export type LatLng = { lat: number; lng: number };

/** Where a route ends: a precise pin, or a name for Google to search. */
export type RouteTarget = LatLng | { query: string };

export type OpeningWindow = {
  /** "09:00" */
  open: string;
  /** "18:00" */
  close: string;
  /** IANA zone the two times are stated in, e.g. "Asia/Bangkok". */
  timeZone: string;
};

const EARTH_RADIUS_KM = 6371;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Great-circle distance in kilometres. Straight-line, never a drive. */
export function haversineKm(from: LatLng, to: LatLng): number {
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

/**
 * A distance a person reads rather than a measurement: at most one decimal
 * under 10 km, whole kilometres above it. "12.4 km to the airport" implies
 * a precision a straight line between two pins does not have.
 *
 * "At most", not `toFixed(1)`: the drive distances on a project page come
 * from the Sale Kit as whole numbers, and a row reading "3 km" beside a
 * route card reading "3.0 km by car" looks like two different figures for
 * the same trip.
 *
 * Returns the number alone — the unit is a translated string, so the
 * caller composes it (`map.km`, `map.byCar`).
 */
export function formatKm(km: number): string {
  return String(km < 10 ? Math.round(km * 10) / 10 : Math.round(km));
}

/** "8.0190° N, 98.3241° E" — the coordinate line above the Copy button. */
export function formatCoordinates({ lat, lng }: LatLng): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lng >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(4)}° ${ns}, ${Math.abs(lng).toFixed(4)}° ${ew}`;
}

/** What gets pasted by the Copy button: full precision, no degree signs. */
export function coordinatePair({ lat, lng }: LatLng): string {
  return `${lat}, ${lng}`;
}

/**
 * One end of a route, as Google's `saddr`/`daddr` want it.
 *
 * A `query` is passed through verbatim (encoded, not rewritten). Narrowing
 * it — appending ", Phuket", say — belongs to the caller that knows the
 * place: the nearby-attraction names on a project page genuinely need it
 * to disambiguate a "Surin Beach" that exists in three countries, and a
 * sales office's own street address already carries its province.
 */
export function routeParam(target: RouteTarget): string {
  return "lat" in target ? `${target.lat},${target.lng}` : encodeURIComponent(target.query);
}

/** The framed map: a route drawn in place, no API key. */
export function embedRouteUrl(from: string, to: string): string {
  return `https://maps.google.com/maps?saddr=${from}&daddr=${to}&output=embed`;
}

/** The new tab: the real Maps directions page. Never framed. */
export function routeLinkUrl(from: string, to: string): string {
  return `https://www.google.com/maps/dir/?api=1&origin=${from}&destination=${to}`;
}

/**
 * The framed map centred on one place.
 *
 * Centred is load-bearing: MapCard draws its own pin at the dead centre of
 * the frame, because Google's marker lives inside the iframe and cannot be
 * styled (and our navy recolour greys it out). A `q=` of anything but a
 * coordinate pair — an address, a place name — lands the pin wherever
 * Google's geocoder decides, which is not necessarily the centre and, for
 * this office, was a couple of hundred metres off.
 */
export function placeEmbedUrl({ lat, lng }: LatLng, locale?: string): string {
  const hl = locale ? `&hl=${encodeURIComponent(locale)}` : "";
  return `https://www.google.com/maps?q=${lat},${lng}&z=15&output=embed${hl}`;
}

/** "09:00" → 540. null for anything that is not HH:MM. */
function minutesOfDay(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;

  return hours * 60 + minutes;
}

export type OpeningState = {
  isOpen: boolean;
  /** Only meaningful while closed: today's opening has already passed. */
  opensTomorrow: boolean;
};

/**
 * Open or closed *in the office's own time zone*, not the visitor's.
 *
 * A buyer in Moscow looking at a Phuket sales office wants to know whether
 * anyone is there now, and `new Date().getHours()` would answer for
 * Moscow. Intl is what reads the wall clock in another zone without
 * pulling in a date library.
 *
 * Returns null when the window cannot be parsed, which is the caller's
 * signal to render no badge at all — a status pill that has guessed is
 * worse than no pill.
 *
 * The caller must also only render the result after mount. These pages are
 * ISR-cached, so "now" at render time is whenever the page was last built,
 * and a server-rendered "Open now" would both be stale and mismatch the
 * client's first paint.
 */
export function openingStatus(
  window: OpeningWindow,
  now: Date = new Date(),
): OpeningState | null {
  const opensAt = minutesOfDay(window.open);
  const closesAt = minutesOfDay(window.close);
  if (opensAt === null || closesAt === null) return null;

  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: window.timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
  } catch {
    // An unknown IANA zone throws rather than falling back to UTC.
    return null;
  }

  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? NaN);
  const hour = read("hour");
  const minute = read("minute");
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;

  const nowMinutes = hour * 60 + minute;

  // A window that ends before it starts crosses midnight (22:00–02:00).
  // Not how this office works, but the check is one expression and the
  // alternative is a badge that says "closed" all evening.
  const isOpen =
    closesAt > opensAt
      ? nowMinutes >= opensAt && nowMinutes < closesAt
      : nowMinutes >= opensAt || nowMinutes < closesAt;

  return { isOpen, opensTomorrow: !isOpen && nowMinutes >= opensAt };
}
