/**
 * lib/google-maps.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Turns an admin-pasted Google Maps link into a URL an <iframe> can
 * actually render, for the project detail page's map preview (see its
 * usage in app/[locale]/(site)/projects/[slug]/page.tsx).
 *
 * Two problems stack here:
 *
 *  1. Google Maps' "Share" button hands out a maps.app.goo.gl short link,
 *     not the long google.com/maps/place/... page it redirects to — and
 *     the short-link *domain* itself refuses to be framed.
 *
 *  2. Even the long /maps/place/... or /maps/dir/... page it redirects to
 *     refuses to be framed (confirmed by hand: appending `output=embed`
 *     to one of those still gets a connection-refused inside an iframe).
 *     Google only actually allows framing its plain *search* embed —
 *     `https://www.google.com/maps?q=<query>&output=embed` — which is
 *     also exactly what the coordinate-only embed elsewhere on the page
 *     already uses. So this file's job isn't "append a param," it's
 *     "pull a coordinate pair or place name back out of whatever URL
 *     shape the admin pasted, then build a fresh search-embed URL from
 *     that" — never iframe the resolved URL directly.
 *
 * The project page has `revalidate = 3600`, so the short-link fetch below
 * runs at most once per project per hour under ISR, not per visitor.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";

const TIMEOUT_MS = 4000;

const GOOGLE_MAPS_HOSTS = /(^|\.)google\.[a-z.]+$/i;
const SHORT_LINK_HOSTS = /^(goo\.gl|maps\.app\.goo\.gl|g\.co)$/i;

/**
 * The pin itself, from the `!3d<lat>!4d<lng>` pair inside the `data=`
 * blob of a resolved /maps/place/ URL.
 *
 * Tried before @lat,lng below, and that ordering is the point. `@` is
 * where the *camera* was — the centre of whoever's screen produced the
 * link — and the place is only at the centre if they happened to have it
 * centred. For the share link the client sent for The Residence Prime the
 * two differ by about 200 metres, which is the difference between a pin on
 * the development and a pin on the road outside it. The map draws its own
 * marker at the centre of the embed, so that error is visible rather than
 * academic.
 *
 * Absent from a short link until it is resolved, and absent entirely from
 * a plain search URL — hence the fallback rather than a replacement.
 */
const PIN_COORDS = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/;

/** "@13.736717,100.523186,17z" segment on /maps/place/.../@lat,lng,zoom/
 *  URLs — present on almost every link copied out of Maps once you've
 *  actually opened the pin, share link or not. The viewport, not the pin:
 *  see PIN_COORDS above for why it is the second choice. */
const AT_COORDS = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/;

/** "/maps/place/<name>/" segment — the fallback for links that don't
 *  carry an @lat,lng (e.g. a plain place search with no pin opened). */
const PLACE_SEGMENT = /\/maps\/place\/([^/@]+)/;

/** Pull a `q=` value (coordinate pair or place name) out of a resolved
 *  Google Maps URL, trying the most precise source first. Returns null
 *  when the URL doesn't look like a page with an actual location on it
 *  (e.g. plain google.com/maps with no query at all). */
function extractQuery(url: URL): string | null {
  /* The whole URL, not just the pathname: Maps puts the data blob in the
     path on a /maps/place/ link but hands it over as a `data=` query
     parameter on some others, and both spell the pin the same way. */
  const pinMatch = url.href.match(PIN_COORDS);
  if (pinMatch) return `${pinMatch[1]},${pinMatch[2]}`;

  const atMatch = url.pathname.match(AT_COORDS);
  if (atMatch) return `${atMatch[1]},${atMatch[2]}`;

  const paramQuery =
    url.searchParams.get("q") ?? url.searchParams.get("query") ?? url.searchParams.get("destination");
  if (paramQuery) return paramQuery;

  const placeMatch = url.pathname.match(PLACE_SEGMENT);
  if (placeMatch) return decodeURIComponent(placeMatch[1].replace(/\+/g, " "));

  return null;
}

function buildSearchEmbed(query: string): string {
  const embed = new URL("https://www.google.com/maps");
  embed.searchParams.set("q", query);
  embed.searchParams.set("z", "15");
  embed.searchParams.set("output", "embed");
  return embed.toString();
}

/**
 * Returns a `https://www.google.com/maps?q=...&output=embed` URL built
 * from whatever the admin pasted, or null if `googleMapsUrl` is empty,
 * isn't a Google Maps link, the short-link redirect couldn't be resolved
 * (offline, timeout, unexpected host), or no location could be pulled out
 * of it — null means "fall back to the address-only placeholder," never a
 * broken frame.
 */
export async function resolveMapEmbedSrc(googleMapsUrl: string | null): Promise<string | null> {
  if (!googleMapsUrl) return null;

  let target: URL;
  try {
    target = new URL(googleMapsUrl);
  } catch {
    return null;
  }

  if (GOOGLE_MAPS_HOSTS.test(target.hostname)) {
    const query = extractQuery(target);
    return query ? buildSearchEmbed(query) : null;
  }

  if (!SHORT_LINK_HOSTS.test(target.hostname)) return null;

  try {
    const response = await fetch(target.toString(), {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const resolved = new URL(response.url);
    if (!GOOGLE_MAPS_HOSTS.test(resolved.hostname)) return null;
    const query = extractQuery(resolved);
    return query ? buildSearchEmbed(query) : null;
  } catch {
    return null;
  }
}
