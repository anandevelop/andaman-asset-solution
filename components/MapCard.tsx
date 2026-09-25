"use client";

/**
 * components/MapCard.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The map on the project page and on /contact: a recoloured Google embed
 * beside a navy panel of places you can route to, and a two-link action
 * bar underneath.
 *
 * One component, two pages. The only thing that differs is what goes in
 * the panel — a project page lists the Sale Kit's nearby attractions under
 * category tabs, /contact lists the airport and our own developments as
 * stacked groups — so the caller passes `groups` and picks `groupLayout`.
 * Everything else (the pin, the route card, the geolocation button, the
 * copy button) is identical, and was identical in the two mockups too.
 *
 * NO PAID MAPS API, STILL
 *
 * Google's key-free `output=embed` endpoint is the whole map surface here,
 * as it was before. It takes no styling, so the recolour is the same CSS
 * trick: desaturate the tiles, then lay navy over them in
 * `mix-blend-color`, which keeps the map's light/dark structure but
 * replaces its hue. Routes are drawn by swapping the iframe's `src` for a
 * `saddr`/`daddr` embed — Google renders the line, we never ask for or pay
 * for the Directions API, and there is no map library in the bundle.
 *
 * WHY THE PIN DISAPPEARS
 *
 * Google's own marker is inside the iframe, unstylable, and greyed out by
 * the recolour, so the pin you see is ours, drawn at the dead centre of
 * the frame — which is where the place is, because the embed opens
 * centred on it. That holds only until the visitor moves the map, and a
 * cross-origin iframe tells us nothing about its zoom or centre. It had
 * already been reported as "the pin doesn't follow the map".
 *
 * So the pin hides the moment we can no longer vouch for it: on
 * `mouseenter` (wheel-zoom never moves focus, so this is the only warning
 * we get for it), on the window blur that means focus went into the frame
 * (a tap, on a phone), and whenever a route is showing. It comes back with
 * the route card's ✕, which reloads the embed centred on the place again.
 *
 * STRINGS COME FROM useTranslations, NOT FROM PROPS
 *
 * Same reason EBrochureViewer's header gives: `map.fromYou` and
 * `map.byCar` interpolate a number computed in the browser, and a
 * formatting function cannot cross the server/client boundary. The
 * provider is mounted in app/[locale]/layout.tsx. The two action-bar
 * labels stay props because each page words them differently
 * (`projects.mapViewOnMaps` vs `contact.directions`).
 *
 * The visitor's own coordinate, when they offer it, is used to draw a line
 * and then forgotten. It is not sent to our server and not stored.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ExternalLink, Home, MapPin, Navigation, Plane, X } from "lucide-react";
import {
  coordinatePair,
  embedRouteUrl,
  formatCoordinates,
  formatKm,
  haversineKm,
  openingStatus,
  routeLinkUrl,
  routeParam,
  type LatLng,
  type OpeningWindow,
  type RouteTarget,
} from "@/lib/map-places";

export type MapListItem = {
  id: string;
  name: string;
  /** Second line under the name — "3 km", or a sub-location. */
  meta?: string;
  distanceKm: number | null;
  /** Real drive time from the Sale Kit. Absent means we do not know one,
   *  and nothing here will invent it from the straight-line distance. */
  durationMin: number | null;
  distanceKind: "drive" | "straight";
  target: RouteTarget;
  /** The route runs item → origin rather than origin → item. What you
   *  want for "getting here from the airport". */
  towardOrigin?: boolean;
  icon?: "home" | "plane";
};

export type MapListGroup = {
  id: string;
  label: string;
  items: MapListItem[];
};

type Props = {
  /** lat/lng are null for a project an administrator has not geocoded yet:
   *  the panel still works, the pin and the coordinate row do not appear,
   *  and routes start from the address instead. */
  origin: { name: string; address: string; lat: number | null; lng: number | null };
  /** null when there is no location at all — placeholder, as before. */
  embedSrc: string | null;
  /** iframe title, and the placeholder's label. */
  title: string;
  viewUrl: string;
  directionsUrl: string;
  groups: MapListGroup[];
  /** "tabs" — one category at a time (project page).
   *  "stacked" — every group under its own heading (/contact). */
  groupLayout: "tabs" | "stacked";
  /** Renders the open/closed badge. /contact only; a project has no hours. */
  openingHours?: OpeningWindow;
  /** Footnote under the list, naming what the numbers mean. */
  note: string;
  labels: { viewOnMaps: string; getDirections: string };
};

/** The route currently drawn on the map. */
type ActiveRoute = {
  /** The list item's id, or YOU for the geolocation route. */
  key: string;
  from: string;
  to: string;
  /** The big number and the line under it. */
  headline: string;
  detail: string;
  href: string;
};

const YOU = "__your-location__";

type GeoState =
  | { status: "idle" | "locating" | "denied" | "unsupported" }
  | { status: "ready"; coords: LatLng; km: number };

export default function MapCard({
  origin,
  embedSrc,
  title,
  viewUrl,
  directionsUrl,
  groups,
  groupLayout,
  openingHours,
  note,
  labels,
}: Props) {
  const t = useTranslations("map");

  const point = useMemo<LatLng | null>(
    () => (origin.lat !== null && origin.lng !== null ? { lat: origin.lat, lng: origin.lng } : null),
    [origin.lat, origin.lng],
  );

  /** Where a route starts when it starts from us: the pin if we have it,
   *  the printed address otherwise. */
  const originParam = point
    ? `${point.lat},${point.lng}`
    : encodeURIComponent(origin.address);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [src, setSrc] = useState(embedSrc);
  const [loading, setLoading] = useState(false);
  const [pinHidden, setPinHidden] = useState(false);
  const [route, setRoute] = useState<ActiveRoute | null>(null);
  const [activeGroupId, setActiveGroupId] = useState(groups[0]?.id ?? "");
  const [geo, setGeo] = useState<GeoState>({ status: "idle" });
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  /* The shimmer starts off, not on. The iframe is lazy, so on a page where
     the map is below the fold `onLoad` does not fire until it scrolls into
     view — starting "loading" would shimmer over an empty frame until
     then. It is a swap indicator, not a first-paint one. */
  const loadMap = useCallback((next: string) => {
    setLoading(true);
    setSrc(next);
  }, []);

  /* Focus moving into the frame means a tap or a keyboard entry we cannot
     follow. `blur` on window is the only event that reports it from out
     here — the iframe itself never tells us. */
  useEffect(() => {
    const onWindowBlur = () => {
      if (document.activeElement === iframeRef.current) setPinHidden(true);
    };
    window.addEventListener("blur", onWindowBlur);
    return () => window.removeEventListener("blur", onWindowBlur);
  }, []);

  // ── Open / closed ──────────────────────────────────────────────────
  /* Mount-gated, and it has to be: both pages are ISR-cached, so a
     server-rendered "Open now" states the office's status at build time
     and mismatches whatever the browser computes on hydration. */
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    if (!openingHours) return;
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, [openingHours]);

  const status = openingHours && now ? openingStatus(openingHours, now) : null;

  // ── Routes ─────────────────────────────────────────────────────────
  const showRoute = useCallback(
    (item: MapListItem) => {
      const itemParam = routeParam(item.target);
      const [from, to] = item.towardOrigin
        ? [itemParam, originParam]
        : [originParam, itemParam];

      const km = item.distanceKm;
      const headline =
        item.durationMin !== null
          ? `${item.durationMin} ${t("min")}`
          : km !== null
            ? `${formatKm(km)} ${t("km")}`
            : "—";
      const detail =
        item.durationMin !== null && km !== null
          ? t("byCar", { km: formatKm(km) })
          : km === null
            ? t("seeRoute")
            : item.distanceKind === "drive"
              ? t("byCar", { km: formatKm(km) })
              : t("straightLine");

      setRoute({
        key: item.id,
        from: item.towardOrigin ? item.name : origin.name,
        to: item.towardOrigin ? origin.name : item.name,
        headline,
        detail,
        href: routeLinkUrl(from, to),
      });
      setPinHidden(true);
      loadMap(embedRouteUrl(from, to));
    },
    [loadMap, origin.name, originParam, t],
  );

  const clearRoute = useCallback(() => {
    setRoute(null);
    setPinHidden(false);
    if (embedSrc) loadMap(embedSrc);
  }, [embedSrc, loadMap]);

  // ── "How far is it from you?" ──────────────────────────────────────
  const locate = useCallback(() => {
    if (geo.status === "ready" && point) {
      const from = `${geo.coords.lat},${geo.coords.lng}`;
      const to = `${point.lat},${point.lng}`;
      setRoute({
        key: YOU,
        from: t("yourLocation"),
        to: origin.name,
        headline: `${formatKm(geo.km)} ${t("km")}`,
        detail: t("straightLine"),
        href: routeLinkUrl(from, to),
      });
      setPinHidden(true);
      loadMap(embedRouteUrl(from, to));
      return;
    }

    if (!navigator.geolocation) {
      setGeo({ status: "unsupported" });
      return;
    }

    setGeo({ status: "locating" });
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!point) return;
        const coords = { lat: position.coords.latitude, lng: position.coords.longitude };
        setGeo({ status: "ready", coords, km: haversineKm(coords, point) });
      },
      () => setGeo({ status: "denied" }),
      { timeout: 8000 },
    );
  }, [geo, loadMap, origin.name, point, t]);

  const geoTitle =
    geo.status === "locating"
      ? t("locating")
      : geo.status === "ready"
        ? t("fromYou", { km: formatKm(geo.km) })
        : t("howFar");
  const geoHint =
    geo.status === "ready"
      ? t("straightTapRoute")
      : geo.status === "denied"
        ? t("declined")
        : geo.status === "unsupported"
          ? t("unavailable")
          : t("useLocation");

  // ── Copy ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (copyState === "idle") return;
    const timer = setTimeout(() => setCopyState("idle"), 1600);
    return () => clearTimeout(timer);
  }, [copyState]);

  const copy = useCallback(async () => {
    if (!point) return;
    try {
      await navigator.clipboard.writeText(coordinatePair(point));
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }, [point]);

  // ── Category tabs ──────────────────────────────────────────────────
  const visibleGroups =
    groupLayout === "tabs"
      ? groups.filter((group) => group.id === activeGroupId)
      : groups;

  /* The duration bars grow from nothing on every tab switch. Two frames,
     because one is not enough: the row has to be in the DOM at width 0
     before the transition to its real width can be observed. */
  const [barsIn, setBarsIn] = useState(false);
  useEffect(() => {
    setBarsIn(false);
    const outer = requestAnimationFrame(() => requestAnimationFrame(() => setBarsIn(true)));
    return () => cancelAnimationFrame(outer);
  }, [activeGroupId]);

  return (
    <div className="overflow-hidden rounded-xs border border-primary/10 bg-white shadow-card">
      <div className="grid grid-cols-1 lg:grid-cols-[1.45fr_1fr]">
        {/* ── Map ─────────────────────────────────────────────────── */}
        <div className="relative min-h-[clamp(400px,62vh,500px)] min-w-0 sm:min-h-[420px] lg:min-h-[600px]">
          {embedSrc && src ? (
            <>
              {/* A faint grid shows through until the tiles arrive, so the
                  frame never sits as a blank white rectangle. */}
              <div className="absolute inset-0 bg-[#eef1f4] bg-[linear-gradient(rgba(8,53,81,.05)_1px,transparent_1px),linear-gradient(90deg,rgba(8,53,81,.05)_1px,transparent_1px)] bg-[length:40px_40px]">
                <iframe
                  ref={iframeRef}
                  src={src}
                  title={title}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  onLoad={() => setLoading(false)}
                  onMouseEnter={() => setPinHidden(true)}
                  className="absolute inset-0 h-full w-full border-0 grayscale contrast-125"
                />
                <div className="pointer-events-none absolute inset-0 bg-primary/40 mix-blend-color" />
              </div>

              {/* Our pin, over Google's. Tip at the exact centre of the
                  frame — see the header for why it vanishes. */}
              {point && (
                <div
                  aria-hidden
                  className={`pointer-events-none absolute left-1/2 top-1/2 z-[2] h-0 w-0 transition-opacity duration-500 ${
                    pinHidden ? "opacity-0" : "opacity-100"
                  }`}
                >
                  <span className="map-pin-ring absolute -left-[34px] -top-[34px] h-[68px] w-[68px] rounded-full border-2 border-accent-600 opacity-0" />
                  <span className="map-pin-ring map-pin-ring-delayed absolute -left-[34px] -top-[34px] h-[68px] w-[68px] rounded-full border-2 border-accent-600 opacity-0" />
                  <span className="absolute -left-3 -top-1 h-2 w-6 rounded-[50%] bg-primary-900/35 blur-[2px]" />
                  <span className="map-pin-body absolute -left-[23px] -top-[60px] h-[60px] w-[46px] origin-bottom">
                    <svg viewBox="0 0 46 60" className="block h-full w-full drop-shadow-[0_6px_10px_rgba(4,29,44,0.35)]">
                      <path
                        d="M23 59C23 59 3 36.5 3 22.5A20 20 0 0 1 43 22.5C43 36.5 23 59 23 59Z"
                        fill="#083551"
                        stroke="#fff"
                        strokeWidth="2.5"
                      />
                      <circle cx="23" cy="22.5" r="12" fill="#c47b3a" />
                      <path
                        d="M16.5 25.5l6.5-6.5 6.5 6.5M19.5 25.5l3.5-3.5 3.5 3.5"
                        fill="none"
                        stroke="#fff"
                        strokeWidth="1.8"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  {/* Above the pin on a phone, beside it from sm up: the
                      company name is long enough to run off a 390px screen
                      when it sits to the right. */}
                  <span className="map-pin-tag absolute left-0 top-[-94px] -translate-x-1/2 whitespace-nowrap rounded-xs bg-primary px-[9px] py-1.5 text-[9.5px] font-medium uppercase tracking-[0.12em] text-white shadow-[0_8px_20px_-6px_rgba(4,29,44,0.5)] sm:left-8 sm:top-[-54px] sm:translate-x-0 sm:px-3 sm:py-[7px] sm:text-[11px]">
                    {origin.name}
                  </span>
                </div>
              )}

              <div
                aria-hidden
                className={`map-shimmer pointer-events-none absolute inset-0 z-[2] transition-opacity duration-300 ${
                  loading ? "map-shimmer-on opacity-100" : "opacity-0"
                }`}
              />

              {/* Route card — slides down from the top edge of the map. */}
              <div
                className={`absolute inset-x-2.5 top-2.5 z-[3] flex max-w-[560px] flex-wrap items-center gap-2.5 gap-y-2.5 bg-white/96 px-3 py-2.5 shadow-[0_20px_60px_-16px_rgba(8,53,81,0.35)] transition-all duration-[600ms] ease-[cubic-bezier(0.16,1,0.3,1)] sm:inset-x-4 sm:top-4 sm:flex-nowrap sm:gap-3.5 sm:px-4 sm:py-3.5 ${
                  route ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-[130%] opacity-0"
                }`}
                aria-hidden={route === null}
              >
                <span className="absolute left-4 top-5 h-[14px] border-l border-dashed border-[#9aa7b0] sm:left-5 sm:top-[26px] sm:h-[18px]" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2.5 overflow-hidden text-ellipsis whitespace-nowrap text-xs text-ink sm:text-[13px]">
                    <i className="h-[9px] w-[9px] flex-none rounded-full border-2 border-primary" />
                    <span className="truncate">{route?.from}</span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2.5 overflow-hidden text-ellipsis whitespace-nowrap text-xs text-ink sm:mt-2 sm:text-[13px]">
                    <i className="h-[9px] w-[9px] flex-none rounded-full border-2 border-accent-600 bg-accent-600" />
                    <span className="truncate">{route?.to}</span>
                  </div>
                </div>
                <div className="border-l border-primary/12 pl-2.5 text-right sm:pl-3.5">
                  <b className="block text-xl font-light leading-none text-primary sm:text-[28px]">
                    {route?.headline}
                  </b>
                  <span className="text-[10px] text-ink-muted sm:text-[11px]">{route?.detail}</span>
                </div>
                {/* `contents` on a phone so the two controls become direct
                    flex children of the card and can be ordered into a
                    second row of their own. */}
                <div className="contents sm:flex sm:flex-col sm:items-end sm:gap-2">
                  {/* Disabled rather than merely invisible while no route
                      is showing: the card stays mounted so it can animate,
                      and a focusable control inside an aria-hidden subtree
                      is a keyboard trap axe reports. */}
                  <button
                    type="button"
                    onClick={clearRoute}
                    disabled={route === null}
                    aria-label={t("back")}
                    className="order-3 grid h-[34px] w-[34px] flex-none cursor-pointer place-items-center self-start rounded-full border border-primary/12 text-ink-muted transition-colors hover:border-primary/30 hover:text-primary sm:order-none sm:h-8 sm:w-8 sm:self-auto"
                  >
                    <X size={14} aria-hidden />
                  </button>
                  {/* Full-width and 44px tall on a phone — it was the one
                      control on this card people actually reached for. */}
                  <a
                    href={route?.href ?? viewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    tabIndex={route ? undefined : -1}
                    className="order-4 inline-flex min-h-[44px] flex-[1_1_100%] items-center justify-center gap-1.5 rounded-xs bg-accent-600 px-3.5 text-[11px] font-medium uppercase tracking-[0.14em] text-white transition-colors hover:bg-accent-700 sm:order-none sm:min-h-[34px] sm:flex-none sm:rounded-full sm:text-[10px]"
                  >
                    {t("openRoute")}
                    <span aria-hidden>↗</span>
                  </a>
                </div>
              </div>
            </>
          ) : (
            <div className="flex h-full min-h-[280px] w-full items-center justify-center bg-primary-900/4 px-6 text-center text-sm text-ink/50">
              <MapPin size={20} className="mr-2 shrink-0" aria-hidden />
              {origin.name}
            </div>
          )}
        </div>

        {/* ── Panel ───────────────────────────────────────────────── */}
        <aside className="flex min-w-0 flex-col gap-3.5 bg-primary px-4 pb-3.5 pt-[18px] text-white sm:gap-5 sm:px-[26px] sm:pb-[22px] sm:pt-7">
          <div>
            {/* text-white explicitly: the base layer in app/globals.css
                gives every h1–h4 `text-primary`, which on this navy panel
                is the panel. The heading rendered invisible without it. */}
            <h3 className="text-[15px] font-medium tracking-[0.02em] text-white sm:text-lg">
              {origin.name}
            </h3>
            <p className="mt-1 text-xs leading-[1.5] text-white/70 sm:mt-1.5 sm:text-sm">
              {origin.address}
            </p>

            {point && (
              <div className="mt-2 flex flex-wrap items-center gap-2 font-mono text-[10.5px] text-accent-200 sm:mt-3 sm:gap-2.5 sm:text-xs">
                <span>{formatCoordinates(point)}</span>
                <button
                  type="button"
                  onClick={copy}
                  className="cursor-pointer rounded-full border border-white/20 px-[7px] py-1 text-[9px] font-medium uppercase tracking-[0.14em] text-white/70 transition-colors hover:border-accent sm:px-[9px] sm:py-[5px] sm:text-[10px]"
                >
                  {copyState === "copied"
                    ? t("copied")
                    : copyState === "failed"
                      ? t("copyFailed")
                      : t("copy")}
                </button>
              </div>
            )}

            {status && (
              <span
                className={`mt-2 inline-flex items-center gap-2 rounded-full bg-white/6 px-[11px] py-1.5 text-[11px] font-medium tracking-[0.06em] sm:mt-3 ${
                  status.isOpen ? "" : "text-white/85"
                }`}
              >
                <i
                  className={`h-[7px] w-[7px] flex-none rounded-full ${
                    status.isOpen ? "map-status-dot" : "map-status-dot map-status-dot-closed"
                  }`}
                />
                <OpeningLabel
                  text={
                    status.isOpen
                      ? t("openNow", { time: openingHours!.close })
                      : status.opensTomorrow
                        ? t("closedTomorrow", { time: openingHours!.open })
                        : t("closedToday", { time: openingHours!.open })
                  }
                />
              </span>
            )}
          </div>

          {point && (
            <button
              type="button"
              onClick={locate}
              className="flex w-full cursor-pointer items-center gap-2.5 border border-white/16 px-3 py-2.5 text-left transition-colors hover:border-accent hover:bg-white/4 sm:gap-3 sm:px-4 sm:py-3.5"
            >
              <span className="grid h-[30px] w-[30px] flex-none place-items-center rounded-full bg-accent text-primary-900 sm:h-[38px] sm:w-[38px]">
                <Navigation size={14} aria-hidden />
              </span>
              <span className="min-w-0">
                <b className="block text-xs font-medium tracking-[0.04em] sm:text-[13px]">
                  {geoTitle}
                </b>
                <span className="mt-0.5 block text-[11px] text-white/60 sm:mt-[3px] sm:text-xs">
                  {geoHint}
                </span>
              </span>
            </button>
          )}

          {groupLayout === "tabs" && groups.length > 1 && (
            <div
              role="group"
              aria-label={t("categories")}
              className="map-tabs flex gap-1 overflow-x-auto border-b border-white/12"
            >
              {groups.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  aria-pressed={group.id === activeGroupId}
                  onClick={() => setActiveGroupId(group.id)}
                  className={`-mb-px cursor-pointer whitespace-nowrap border-b-2 px-2 pb-2.5 pt-2 text-[9.5px] font-medium uppercase tracking-[0.1em] transition-colors sm:px-2.5 sm:pb-3 sm:pt-2.5 sm:text-[11px] sm:tracking-[0.12em] ${
                    group.id === activeGroupId
                      ? "border-accent text-white"
                      : "border-transparent text-white/55 hover:text-white/80"
                  }`}
                >
                  {group.label}
                </button>
              ))}
            </div>
          )}

          {visibleGroups.map((group) => (
            <div key={group.id} className="min-w-0">
              {groupLayout === "stacked" && (
                <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.22em] text-accent-200">
                  {group.label}
                </p>
              )}
              <ul className="m-0 flex max-h-[260px] list-none flex-col overflow-y-auto p-0 sm:max-h-[330px] sm:gap-1">
                {group.items.map((item) => {
                  const active = route?.key === item.id;
                  const hasIcon = item.icon !== undefined;

                  return (
                    <li key={item.id} className="min-w-0">
                      <button
                        type="button"
                        onClick={() => showRoute(item)}
                        className={`grid w-full cursor-pointer gap-x-2.5 gap-y-1 rounded-xs px-1 py-2.5 text-left transition-colors sm:gap-x-3.5 sm:gap-y-1.5 sm:px-2.5 sm:py-3 ${
                          hasIcon
                            ? "grid-cols-[auto_1fr_auto] items-center"
                            : "grid-cols-[1fr_auto]"
                        } ${active ? "bg-[rgba(232,179,132,0.14)]" : "hover:bg-white/5"}`}
                      >
                        {hasIcon && (
                          <span className="grid h-11 w-11 flex-none place-items-center rounded-xs bg-white/8 text-accent">
                            {item.icon === "plane" ? (
                              <Plane size={18} aria-hidden />
                            ) : (
                              <Home size={18} aria-hidden />
                            )}
                          </span>
                        )}

                        <span className="min-w-0">
                          <span className="block truncate text-[13px] sm:text-sm">{item.name}</span>
                          {item.meta && (
                            <span className="mt-px block truncate text-[10px] text-white/50 sm:mt-[3px] sm:text-[11px]">
                              {item.meta}
                            </span>
                          )}
                        </span>

                        <span className="text-right text-[15px] font-light leading-none sm:text-lg">
                          {item.durationMin !== null ? (
                            <>
                              {item.durationMin}
                              <small className="text-[10px] font-normal text-white/60 sm:text-[11px]">
                                {" "}
                                {t("min")}
                              </small>
                            </>
                          ) : item.distanceKm !== null ? (
                            <>
                              {formatKm(item.distanceKm)}
                              <small className="text-[10px] font-normal text-white/60 sm:text-[11px]">
                                {" "}
                                {t("km")}
                              </small>
                            </>
                          ) : (
                            <small className="text-[10px] font-normal text-white/60 sm:text-[11px]">
                              {t("route")} ↗
                            </small>
                          )}
                        </span>

                        {/* Drive time as a bar, scaled against 35 minutes —
                            the point is the comparison between rows, not an
                            absolute reading, so the longest trip in the list
                            simply fills it. */}
                        {item.durationMin !== null && (
                          <span
                            className={`h-0.5 overflow-hidden rounded-[3px] bg-white/8 sm:h-[3px] ${
                              hasIcon ? "col-start-2 col-span-2" : "col-span-full"
                            }`}
                          >
                            <b
                              className="block h-full bg-gradient-to-r from-accent to-accent-600 transition-[width] duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)]"
                              style={{
                                width: barsIn
                                  ? `${Math.min(item.durationMin / 35, 1) * 100}%`
                                  : "0%",
                              }}
                            />
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

          <p className="text-[10px] tracking-[0.06em] text-white/45 sm:text-[11px]">{note}</p>
        </aside>
      </div>

      <div className="grid grid-cols-2 divide-x divide-white/15 bg-primary text-white">
        <a
          href={viewUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-[7px] px-2 py-3.5 text-[10.5px] font-medium uppercase tracking-[0.1em] transition-colors hover:bg-primary-700 sm:gap-2.5 sm:px-3 sm:py-[19px] sm:text-[13px] sm:tracking-[0.14em]"
        >
          <MapPin size={13} className="text-accent sm:hidden" aria-hidden />
          <MapPin size={16} className="hidden text-accent sm:block" aria-hidden />
          {labels.viewOnMaps}
        </a>
        <a
          href={directionsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-[7px] px-2 py-3.5 text-[10.5px] font-medium uppercase tracking-[0.1em] transition-colors hover:bg-primary-700 sm:gap-2.5 sm:px-3 sm:py-[19px] sm:text-[13px] sm:tracking-[0.14em]"
        >
          <Navigation size={13} className="text-accent sm:hidden" aria-hidden />
          <Navigation size={16} className="hidden text-accent sm:block" aria-hidden />
          {labels.getDirections}
        </a>
      </div>
    </div>
  );
}

/**
 * "Open now · closes 18:00" with the tail dimmed.
 *
 * Split on the separator rather than carried as two message keys or as
 * rich text: every locale's string in messages/*.json is written with the
 * same "·", and a locale that ever drops it renders the whole sentence at
 * full strength instead of breaking. One string per state also keeps the
 * sentence translatable as a sentence.
 */
function OpeningLabel({ text }: { text: string }) {
  const at = text.indexOf("·");
  if (at === -1) return <>{text}</>;

  return (
    <>
      {text.slice(0, at).trimEnd()}{" "}
      <small className="font-normal text-white/55">{text.slice(at)}</small>
    </>
  );
}
