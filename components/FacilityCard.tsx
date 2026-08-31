/**
 * components/FacilityCard.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * One full-bleed photo card in the project page's "Facilities" section —
 * pulled out of app/[locale]/(site)/projects/[slug]/page.tsx into its own
 * file for readability, now that the icon+placeholder fallback it used to
 * need is gone (see FACILITY_NAME_IMAGE below).
 *
 * No icon, ever. A facility with no admin-uploaded photo yet (imageUrl
 * null) falls back to a themed Unsplash placeholder keyed by `nameEn`
 * instead — the same dozen names the ProjectFacility migration backfilled
 * from the old `facilities` string array (see FACILITY_NAME_ICON's old
 * comment in page.tsx's git history) — so the section always reads as a
 * photo gallery, never as a grid of grey boxes, even before every project
 * has real photography uploaded.
 * ─────────────────────────────────────────────────────────────────────────
 */

import ImageWithSkeleton from "@/components/ImageWithSkeleton";
import type { ProjectFacilitySummary } from "@/lib/projects";

// Same URLs as FACILITY_IMAGE in prisma/seed.ts (keyed there by the
// internal i18n key, e.g. "clubhouse"; keyed here by the display name,
// e.g. "Clubhouse", since that's all a ProjectFacilitySummary carries) —
// duplicated rather than shared because one lives in a Node seed script
// and the other in a Next.js component, with no common module between
// them that isn't itself overkill for twelve URL strings.
const FACILITY_NAME_IMAGE: Record<string, string> = {
  Clubhouse: "https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=900&q=80",
  "Fitness Center": "https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=900&q=80",
  "24-hr Security": "https://images.unsplash.com/photo-1485230405346-71acb9518d9c?w=900&q=80",
  "Communal Pool": "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=900&q=80",
  "Landscaped Garden": "https://images.unsplash.com/photo-1602343168117-bb8ffe3e2e9f?w=900&q=80",
  Concierge: "https://images.unsplash.com/photo-1613977257363-707ba9348227?w=900&q=80",
  "Co-working Space": "https://images.unsplash.com/photo-1541888946425-d81bb19240f5?w=900&q=80",
  Reception: "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=900&q=80",
  Restaurant: "https://images.unsplash.com/photo-1486325212027-8081e485255e?w=900&q=80",
  Spa: "https://images.unsplash.com/photo-1523294587484-bae6cc870010?w=900&q=80",
  Lounge: "https://images.unsplash.com/photo-1541976590-713941681591?w=900&q=80",
  "Jogging Track": "https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=900&q=80",
};

// Last-resort fallback for a facility name an admin typed by hand that
// isn't one of the twelve above (e.g. a new one added fresh, not from the
// migration) — still a real photo, never a blank/grey box.
const GENERIC_FACILITY_IMAGE =
  "https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=900&q=80";

export default function FacilityCard({ facility }: { facility: ProjectFacilitySummary }) {
  const src = facility.imageUrl ?? FACILITY_NAME_IMAGE[facility.nameEn] ?? GENERIC_FACILITY_IMAGE;

  return (
    // No rounded-sm, no border — cards butt up edge-to-edge in the
    // full-bleed grid (see the section comment in page.tsx), so any
    // per-card framing would just show as a seam between neighbours.
    <div className="relative aspect-[3/4] w-full overflow-hidden">
      <ImageWithSkeleton
        src={src}
        alt={facility.name}
        fill
        sizes="(max-width: 640px) 50vw, 25vw"
        className="object-cover"
      />

      <div className="absolute inset-0 bg-gradient-to-t from-primary-900/80 via-transparent to-transparent" />

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
