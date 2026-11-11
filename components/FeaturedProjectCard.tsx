/**
 * components/FeaturedProjectCard.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The project card, shared by the /projects listing and the home page's
 * "Selected developments" so the two cannot drift apart. One card, one
 * status palette, one set of hover states.
 *
 * Server component: it renders no interactivity, so shipping it to the
 * client would cost bundle size for nothing. The labels it cannot resolve
 * itself — status, the spec headings, the CTA, the signal badge — arrive
 * already translated, which keeps it usable from either a server page or a
 * future client context without dragging next-intl in.
 *
 * THE SECOND BADGE IS DERIVED, AND IS OFTEN ABSENT
 *
 * Under the photograph sits one line about what has happened to this
 * development lately: an award it won, or photographs that have just gone
 * up (lib/projects.ts's signalFor). A project with neither shows nothing
 * there. That is the point — a badge on every card would be decoration,
 * and nobody reads decoration twice.
 *
 * THE CTA SAYS WHAT THE PAGE ACTUALLY OFFERS
 *
 * An upcoming development has no floor plans to walk through yet, so its
 * card says "register interest" rather than "view project". Both link to
 * the same project page, which carries an enquiry form — the label
 * describes what is worth doing there, and neither promises something the
 * page does not have.
 *
 * No price anywhere on this card (or the rest of the public site) — the
 * business no longer wants prices shown to visitors. `priceFromTHB` still
 * exists on the Project model in the database, just unused here on purpose.
 * ─────────────────────────────────────────────────────────────────────────
 */

import ImageWithSkeleton from "@/components/ImageWithSkeleton";
import Link from "next/link";
import { ArrowRight, Camera, MapPin, Trophy } from "lucide-react";
import type { ProjectListCard } from "@/lib/projects";
import { formatNumber } from "@/lib/format";

/**
 * Status colour carries the stage before the label is read.
 *
 * Solid, opaque fills rather than tinted ones — the badge sits on top of
 * whatever photo the project happens to have, and a 10-15% tint over a
 * bright sky or a dark render is nearly unreadable either way, with
 * mid-tone text on top of it faring even worse. An opaque background reads
 * the same regardless of what is behind it; white text on each of these
 * clears 5:1 contrast at minimum.
 */
const STATUS_TONE: Record<string, string> = {
  UPCOMING: "bg-white/75 text-ink ring-1 ring-white/80",
  UNDER_CONSTRUCTION: "bg-gold-100/90 text-ink ring-1 ring-gold",
  READY_TO_MOVE_IN: "bg-white/85 text-ink ring-1 ring-ink",
  SOLD_OUT: "bg-surface-muted/90 text-ink-muted ring-1 ring-ink/20 line-through",
};

const SIGNAL_ICON = {
  awards: Trophy,
  progressPhotos: Camera,
} as const;

export type FeaturedProjectCardProps = {
  project: ProjectListCard;
  locale: string;
  /** Pre-translated labels — see the note on server/client above. */
  labels: {
    status: string;
    cta: string;
    specVillas: string;
    specBedrooms: string;
    specLand: string;
    /** projects.units.sqm — "ตร.ม.", "平方米", the same unit the project page uses. */
    unitSqm: string;
    /** Already formatted with its own numbers; null when the project has
     *  no signal worth showing. */
    signal: string | null;
  };
  /** Set on the first card above the fold so it is not lazy-loaded. */
  priority?: boolean;
  sizes?: string;
};

export default function FeaturedProjectCard({
  project,
  locale,
  labels,
  priority = false,
  sizes = "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw",
}: FeaturedProjectCardProps) {
  const SignalIcon = project.signal ? SIGNAL_ICON[project.signal.kind] : null;

  const bedrooms =
    project.bedroomsMin === null || project.bedroomsMax === null
      ? null
      : project.bedroomsMin === project.bedroomsMax
        ? formatNumber(locale, project.bedroomsMin)
        : `${formatNumber(locale, project.bedroomsMin)} – ${formatNumber(locale, project.bedroomsMax)}`;

  const specs = [
    { key: "villas", label: labels.specVillas, value: formatNumber(locale, project.totalUnits) },
    { key: "bedrooms", label: labels.specBedrooms, value: bedrooms },
    {
      key: "land",
      label: labels.specLand,
      // Rounded to the square metre: the column stores two decimals and
      // "26,229.77 m²" is a surveyor's number, not a card's.
      value:
        project.landAreaSqm === null
          ? null
          : `${formatNumber(locale, Math.round(project.landAreaSqm))} ${labels.unitSqm}`,
    },
  ].filter((spec) => spec.value !== null && spec.value !== "");

  return (
    <Link
      href={`/${locale}/projects/${project.slug}`}
      className="group flex h-full flex-col overflow-hidden rounded-3xl bg-white shadow-card ring-1 ring-ink/5 transition-all duration-500 hover:-translate-y-1 hover:shadow-cardHover"
    >
      <div className="relative aspect-4/3 w-full overflow-hidden bg-primary/5">
        {project.heroImageUrl && (
          <ImageWithSkeleton
            src={project.heroImageUrl}
            alt={project.name}
            fill
            fetchPriority={priority ? "high" : undefined}
            loading={priority ? "eager" : undefined}
            sizes={sizes}
            className="object-cover transition-transform duration-700 group-hover:scale-105"
          />
        )}

        <span
          className={`absolute left-4 top-4 rounded-full px-3.5 py-1.5 text-[10px] font-medium uppercase tracking-[0.12em] shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_6px_16px_-8px_rgba(0,0,0,0.35)] backdrop-blur-md backdrop-saturate-150 ${
            STATUS_TONE[project.status] ?? "bg-white text-ink"
          }`}
        >
          {labels.status}
        </span>

        {labels.signal && SignalIcon && (
          <span className="absolute bottom-4 left-4 inline-flex items-center gap-2 rounded-full bg-white/65 px-3.5 py-1.5 text-[11px] text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_6px_16px_-8px_rgba(0,0,0,0.35)] ring-1 ring-white/70 backdrop-blur-md backdrop-saturate-150">
            <SignalIcon size={13} strokeWidth={1.5} aria-hidden />
            {labels.signal}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-6 sm:p-7">
        <p className="flex items-center gap-1.5 text-xs text-ink/65">
          <MapPin size={12} aria-hidden /> {project.location}
        </p>

        {/* Light, like every display heading on the public site — at
            semibold the name shouted over the photograph above it and read
            as a different brand from the section titles around the grid. */}
        <h3 className="mt-2 text-[22px] font-light leading-snug tracking-[0.01em] text-primary">
          {project.name}
        </h3>

        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-ink/70">{project.tagline}</p>

        {specs.length > 0 && (
          <dl className="mt-5 grid grid-cols-3 gap-x-4 border-t border-primary/10 pb-5 pt-5">
            {specs.map((spec) => (
              <div key={spec.key}>
                <dt className="text-[10px] font-medium uppercase tracking-[0.14em] text-ink-muted">{spec.label}</dt>
                <dd className="mt-1 text-base font-light text-primary">{spec.value}</dd>
              </div>
            ))}
          </dl>
        )}

        <span className="mt-auto flex items-center justify-between gap-3 border-t border-primary/10 pt-5 text-xs font-medium uppercase tracking-[0.14em] text-ink">
          {labels.cta}
          {/* The one gold mark on the card: a round arrow that slides on
              hover, echoing the gold rules elsewhere on the site. */}
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gold-100 text-ink ring-[0.75px] ring-gold/45 transition-all duration-300 group-hover:translate-x-1 group-hover:bg-gold group-hover:text-gold-100">
            <ArrowRight size={14} aria-hidden />
          </span>
        </span>
      </div>
    </Link>
  );
}
