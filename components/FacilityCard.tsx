/**
 * components/FacilityCard.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * One full-bleed photo card in the project page's "Facilities" section —
 * pulled out of app/[locale]/(site)/projects/[slug]/page.tsx into its own
 * file for readability, now that the icon+placeholder fallback it used to
 * need is gone (see FACILITY_NAME_IMAGE below).
 *
 * No icon, ever. A facility with no admin-uploaded photo yet (imageUrl
 * null) falls back to one of this repository's own photographs, so the
 * section always reads as a photo gallery, never as a grid of grey boxes,
 * even before every project has real photography uploaded.
 * ─────────────────────────────────────────────────────────────────────────
 */

import ImageWithSkeleton from "@/components/ImageWithSkeleton";
import type { ProjectFacilitySummary } from "@/lib/projects";

/*
  Keyed by display name, which is all a ProjectFacilitySummary carries —
  the same dozen names the ProjectFacility migration backfilled from the
  old `facilities` string array.

  This used to hold twelve Unsplash URLs, one per name, and it is now nine
  local files. The three that went are the ones this repository has no
  honest photograph for: "Fitness Center", "Concierge" and "Co-working
  Space". A stock gym is not this development's gym, and presenting one on
  a developer's own site is a claim the photography does not support — so
  they take the house photo below instead, which claims nothing. Replace
  the entries here as real facility photography arrives.
*/
const FACILITY_NAME_IMAGE: Record<string, string> = {
  Clubhouse: "/gallery/residence-prime/living-double-height.webp",
  "24-hr Security": "/gallery/residence-prime/exterior-street.webp",
  "Communal Pool": "/gallery/residence-prime/pool-terrace.webp",
  "Landscaped Garden": "/gallery/trinity-village/pool-garden.webp",
  Reception: "/gallery/residence-prime/staircase.webp",
  Restaurant: "/gallery/residence-prime/dining-table.webp",
  Spa: "/gallery/residence-prime/bathroom-tub.webp",
  Lounge: "/gallery/residence-prime/living-pool-view.webp",
  "Jogging Track": "/gallery/residence-prime/exterior-facade.webp",
};

/*
  For a facility with no upload and no honest match — the three above, plus
  anything an admin types by hand.

  Four photographs rather than one, picked by name, so a project listing
  several unmatched facilities gets a varied grid instead of the same image
  four times, and so a given facility always shows the same photo across
  reloads and across pages.
*/
const HOUSE_PHOTOS = [
  "/corporate/development-exterior.webp",
  "/corporate/living-aerial.webp",
  "/corporate/pool-lap.webp",
  "/corporate/design-double-height.webp",
];

function housePhoto(name: string): string {
  const sum = [...name].reduce((total, char) => total + char.charCodeAt(0), 0);
  return HOUSE_PHOTOS[sum % HOUSE_PHOTOS.length];
}

export default function FacilityCard({ facility }: { facility: ProjectFacilitySummary }) {
  const src =
    facility.imageUrl ?? FACILITY_NAME_IMAGE[facility.nameEn] ?? housePhoto(facility.nameEn);

  return (
    // No rounded-sm, no border — cards butt up edge-to-edge in the
    // full-bleed grid (see the section comment in page.tsx), so any
    // per-card framing would just show as a seam between neighbours.
    <div className="relative aspect-3/4 w-full overflow-hidden">
      <ImageWithSkeleton
        src={src}
        alt={facility.name}
        fill
        sizes="(max-width: 640px) 50vw, 25vw"
        className="object-cover"
      />

      <div className="absolute inset-0 bg-linear-to-t from-primary-900/80 via-transparent to-transparent" />

      {/* text-sm on mobile — these cards run as narrow as ~2.2-across on a
          phone (see FacilityScroller's card-width math), and the previous
          text-lg bold routinely wrapped a two-word name like "Communal
          Pool" into a cramped two-liner that ate most of the card. */}
      <span className="absolute bottom-0 left-0 p-3 text-sm font-bold uppercase leading-snug tracking-wide text-white sm:p-5 sm:text-lg">
        {facility.name}
      </span>
    </div>
  );
}
