import { ExternalLink, MapPin, Navigation } from "lucide-react";

/**
 * components/MapCard.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The Google Maps embed both the project detail page and /contact use,
 * dressed in this site's own colours: a floating info card over the map
 * (name, address, two icon actions) and a two-link action bar underneath,
 * navy-and-gold instead of Google's stock red-pin-and-blue-button look.
 *
 * NO CUSTOM MAP TILES — A CSS TRICK, NOT THE PAID API
 *
 * Google's key-free `?output=embed` endpoint (what both callers pass as
 * `embedSrc`) takes no styling at all; real custom tile colours need the
 * billed Maps JavaScript API, a new dependency, and a CSP change this
 * project doesn't carry. So the whole map recolours in CSS instead:
 * desaturate the tile imagery, then lay a navy overlay over it in
 * `mix-blend-color` — that blend mode keeps the map's own light/dark
 * structure (roads, water, buildings, even the default pin) but replaces
 * its hue with the overlay's, landing on a monochrome navy map rather
 * than Google's palette. `pointer-events-none` on that overlay (and on
 * the info card's own positioning wrapper) keeps the map itself
 * draggable/zoomable underneath both.
 *
 * No rating shown in the card, unlike a typical Google Maps place card —
 * this site has no real ratings data source for a project or the sales
 * office, and showing a number here would be inventing one.
 * ─────────────────────────────────────────────────────────────────────────
 */

type Props = {
  /** null when neither coordinates nor a Google Maps URL were ever set —
   *  renders a plain placeholder instead of an empty iframe. */
  embedSrc: string | null;
  /** iframe title / placeholder icon label. */
  title: string;
  /** The place name shown in the floating card — a project's own name, or
   *  the company name for the sales office. */
  name: string;
  address: string;
  /** Opens the place itself on Google Maps (the card's outline icon and
   *  the footer's left link). */
  viewUrl: string;
  /** Opens turn-by-turn directions (the card's filled accent icon and the
   *  footer's right link). */
  directionsUrl: string;
  labels: { viewOnMaps: string; getDirections: string };
  /** Defaults match the project page's existing map height; /contact
   *  passes its own aspect-ratio-driven sizing instead. */
  className?: string;
};

export default function MapCard({
  embedSrc,
  title,
  name,
  address,
  viewUrl,
  directionsUrl,
  labels,
  className = "h-[360px] sm:h-[440px]",
}: Props) {
  return (
    <div className="overflow-hidden rounded-xs border border-primary/10 bg-surface-muted shadow-card">
      {embedSrc ? (
        <div className={`relative w-full ${className}`}>
          <iframe
            src={embedSrc}
            title={title}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            className="h-full w-full grayscale contrast-125 saturate-0"
          />
          <div className="pointer-events-none absolute inset-0 bg-primary-800/40 mix-blend-color" />

          {/* Floating info card — the one element here with its own
              colours rather than a recolour of Google's, since it is
              plain HTML sitting on top of the iframe, not part of it. */}
          <div className="pointer-events-none absolute left-4 top-4 max-w-[calc(100%-2rem)] sm:max-w-xs">
            <div className="pointer-events-auto flex items-start gap-3 rounded-xs bg-white p-4 shadow-cardHover">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-primary">{name}</p>
                <p className="mt-1 text-xs leading-relaxed text-ink/70">{address}</p>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <a
                  href={viewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={labels.viewOnMaps}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-primary/15 text-primary transition-colors hover:bg-surface-muted"
                >
                  <ExternalLink size={14} aria-hidden />
                </a>
                <a
                  href={directionsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={labels.getDirections}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-600 text-white transition-colors hover:bg-accent-700"
                >
                  <Navigation size={14} aria-hidden />
                </a>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex h-[280px] w-full items-center justify-center bg-primary-900/4 text-sm text-ink/50 sm:h-[360px]">
          <MapPin size={20} className="mr-2 shrink-0" aria-hidden />
          {name}
        </div>
      )}

      <div className="grid grid-cols-2 divide-x divide-white/15 bg-primary text-white">
        <a
          href={viewUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 px-4 py-4 text-xs font-medium uppercase tracking-wide transition-colors hover:bg-primary-700 sm:text-sm"
        >
          <MapPin size={16} aria-hidden />
          {labels.viewOnMaps}
        </a>
        <a
          href={directionsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 px-4 py-4 text-xs font-medium uppercase tracking-wide transition-colors hover:bg-primary-700 sm:text-sm"
        >
          <Navigation size={16} aria-hidden />
          {labels.getDirections}
        </a>
      </div>
    </div>
  );
}
