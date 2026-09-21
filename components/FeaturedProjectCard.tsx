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
  UPCOMING: "bg-primary-800 text-white",
  UNDER_CONSTRUCTION: "bg-primary-800 text-white",
  READY_TO_MOVE_IN: "bg-emerald-700 text-white",
  SOLD_OUT: "bg-ink text-white",
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
    /** Already formatted with its own numbers; null when the project has
     *  no signal worth showing. */
    signal: string | null;
    /** "Construction Progress" — the row's own label, not a per-card
     *  figure, so it arrives as a single string rather than a key. */
    constructionTitle: string;
    /** Already formatted — either "Complete" or "{percent}% · updated
     *  {when}". `percent` rides along separately only because the bar's
     *  width needs the raw number; null when there is nothing to show at
     *  all, distinct from `percent: null` inside a non-null object (which
     *  means "complete", no bar). */
    construction: { text: string; percent: number | null } | null;
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
          : `${formatNumber(locale, Math.round(project.landAreaSqm))} m²`,
    },
  ].filter((spec) => spec.value !== null && spec.value !== "");

  return (
    <Link
      href={`/${locale}/projects/${project.slug}`}
      className="group flex h-full flex-col overflow-hidden rounded-xs bg-white shadow-card transition-shadow hover:shadow-lg"
    >
      <div className="relative aspect-4/3 w-full overflow-hidden bg-primary/5">
        {project.heroImageUrl && (
          <ImageWithSkeleton
            src={project.heroImageUrl}
            alt={project.name}
            fill
            priority={priority}
            sizes={sizes}
            className="object-cover transition-transform duration-700 group-hover:scale-105"
          />
        )}

        <span
          className={`absolute left-4 top-4 rounded-xs px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.12em] shadow-xs ${
            STATUS_TONE[project.status] ?? "bg-white text-ink"
          }`}
        >
          {labels.status}
        </span>

        {labels.signal && SignalIcon && (
          <span className="absolute bottom-4 left-4 inline-flex items-center gap-2 rounded-xs bg-primary-900/80 px-3 py-1.5 text-[11px] font-light text-white backdrop-blur-xs">
            <SignalIcon size={13} strokeWidth={1.5} aria-hidden />
            {labels.signal}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-6">
        <p className="flex items-center gap-1.5 text-xs text-ink/65">
          <MapPin size={12} aria-hidden /> {project.location}
        </p>

        <h3 className="mt-2 text-xl font-semibold text-primary">{project.name}</h3>

        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-ink/70">{project.tagline}</p>

        {specs.length > 0 && (
          <dl className="mt-5 grid grid-cols-3 gap-x-4 border-t border-primary/10 pt-5">
            {specs.map((spec) => (
              <div key={spec.key}>
                <dt className="text-xs text-ink/60">{spec.label}</dt>
                <dd className="mt-1 text-sm font-medium text-primary">{spec.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {labels.construction && (
          <dl className="mt-5 border-t border-primary/10 pt-5">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-xs uppercase tracking-wide text-ink/60">
                {labels.constructionTitle}
              </dt>
              <dd
                className={`text-sm font-medium ${
                  labels.construction.percent === null ? "text-emerald-700" : "text-primary"
                }`}
              >
                {labels.construction.text}
              </dd>
            </div>

            {labels.construction.percent !== null && (
              <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-primary/10">
                <div
                  className="h-full rounded-full bg-accent-700"
                  style={{ width: `${labels.construction.percent}%` }}
                />
              </div>
            )}
          </dl>
        )}

        <span className="mt-auto inline-flex items-center gap-2 border-t border-primary/10 pt-6 text-xs font-medium uppercase tracking-[0.14em] text-accent-700">
          {labels.cta}
          <ArrowRight
            size={14}
            className="transition-transform group-hover:translate-x-1"
            aria-hidden
          />
        </span>
      </div>
    </Link>
  );
}
