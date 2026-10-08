/*
 * public/club-sw.js — ANDAMAN CLUB offline card.
 * ─────────────────────────────────────────────────────────────────────────
 * Network first for every portal page; a copy of each successful page is
 * kept on the device so the card (and, marked "may not be the latest",
 * the other tabs) still opens without signal. A copy older than 7 days is
 * never served — the card then asks to reconnect.
 *
 * Only portal URLs are touched: everything on member.andamanassetsolution.com,
 * and /<locale>/club/... elsewhere (localhost). Card-scan links
 * (/rp|tv|vc/<token>, /c/...) and the OTP screens are never cached, and a
 * page that comes back as the sign-in screen (signed out, device revoked,
 * card reissued) wipes the cache at once.
 * ─────────────────────────────────────────────────────────────────────────
 */
const CACHE = "club-card-v1";
const OFFLINE_DAYS = 7;
const DAY = 86400000;
const STAMP = "x-club-cached-at";

const onMemberHost = self.location.hostname.startsWith("member.");
const CLUB_PREFIX = /^\/(th|en|zh|ru)\/club(?=\/|$)/;
const NEVER = /^\/(c|rp|tv|vc|r|verify|code)(\/|$)/;
// Dev servers rebuild chunks under the same names; caching them would serve stale code.
const DEV = /^(localhost|127\.0\.0\.1)$/.test(self.location.hostname);
const STATIC = /^\/(_next\/static\/|flags\/|logo-white\.png|icon-)/;

/** The portal-relative path ("/card"), or null when the URL is not the portal. */
function portalPath(url) {
  if (url.origin !== self.location.origin) return null;
  if (onMemberHost) return url.pathname;
  const match = url.pathname.match(CLUB_PREFIX);
  return match ? url.pathname.slice(match[0].length) || "/" : null;
}

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("club-") && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "club:clear") event.waitUntil(caches.delete(CACHE));
});

async function stamp(response) {
  const headers = new Headers(response.headers);
  headers.set(STAMP, String(Date.now()));
  return new Response(await response.clone().blob(), { status: response.status, statusText: response.statusText, headers });
}

function fresh(response) {
  const at = Number(response && response.headers.get(STAMP));
  return Boolean(at) && Date.now() - at < OFFLINE_DAYS * DAY;
}

/** The cached card page that stands in for a page this phone never opened. */
function cardUrlFor(url) {
  if (onMemberHost) return `${url.origin}/card`;
  const match = url.pathname.match(CLUB_PREFIX);
  return `${url.origin}${match ? match[0] : ""}/card`;
}

async function page(request, path) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    // Navigations do not follow redirects inside the SW: a portal page that
    // redirects was bounced to sign-in (signed out, device revoked, card
    // reissued), so the card must not stay on the phone.
    if (response.type === "opaqueredirect" || response.redirected) {
      if (path !== "/") await caches.delete(CACHE);
    } else if (response.ok && response.type === "basic") {
      await cache.put(request.url, await stamp(response));
    }
    return response;
  } catch (error) {
    const url = new URL(request.url);
    for (const key of [request.url, cardUrlFor(url)]) {
      const cached = await cache.match(key);
      if (fresh(cached)) return cached;
    }
    throw error;
  }
}

async function asset(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (request.mode === "navigate") {
    const path = portalPath(url);
    if (path === null || NEVER.test(path)) return;
    event.respondWith(page(request, path));
    return;
  }
  // Fonts, CSS, JS (content-hashed, immutable), flags and the logo the cached pages need.
  if (!DEV && url.origin === self.location.origin && STATIC.test(url.pathname)) event.respondWith(asset(request));
});
