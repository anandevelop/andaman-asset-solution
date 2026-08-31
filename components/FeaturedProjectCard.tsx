/**
 * components/FeaturedProjectCard.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The project card, extracted from the /projects listing so the homepage
 * and the listing cannot drift apart. One card, one set of hover states,
 * one status badge palette.
 *
 * Server component: it renders no interactivity, so shipping it to the
 * client would cost bundle size for nothing. The labels it cannot resolve
 * itself — status, property type, the CTA — are passed in already
 * translated, which keeps it usable from either a server page or a future
 * client context without dragging next-intl in.
 *
 * `variant` trades detail for density. "full" is the listing: specs table,
 * unit count. "compact" is the homepage, where three cards sit inside a
 * longer page and the job is to invite a click, not to inform.
 *
 * No price anywhere on this card (or the rest of the public site) — the
 * business no longer wants prices shown to visitors. `priceFromTHB` still
 * exists on the Project model in the database, just unused here on purpose.
 * ─────────────────────────────────────────────────────────────────────────
 */

import ImageWithSkeleton from "@/components/ImageWithSkeleton";
import Link from "next/link";
import { ArrowRight, MapPin } from "lucide-react";
import type { ProjectCard } from "@/lib/projects";
import { formatNumber } from "@/lib/format";

/**
 * Status colour carries the stage before the label is read.
 *
 * Solid, opaque fills rather than the previous tinted/translucent ones
 * (bg-accent/15 etc.) — the badge sits on top of whatever photo the project
 * happens to have, and a 10-15% tint over a bright sky or dark render is
 * nearly unreadable either way, with mid-tone text on top of it faring
 * even worse. An opaque background reads the same regardless of what's
 * behind it; white text on each of these clears 5:1 contrast at minimum.
 */
const STATUS_TONE: Record<string, string> = {
  UPCOMING: "bg-primary-600 text-white",
  UNDER_CONSTRUCTION: "bg-primary-800 text-white",
  READY_TO_MOVE_IN: "bg-emerald-700 text-white",
  SOLD_OUT: "bg-ink text-white",
};

export type FeaturedProjectCardProps = {
  project: ProjectCard;
  locale: string;
  variant?: "full" | "compact";
  /** Pre-translated labels — see the note on server/client above. */
  labels: {
    status: string;
    propertyType: string;
    cta: string;
    /** Only read by the "full" variant. */
    specType?: string;
    specUnits?: string;
  };
  /** Set on the first card above the fold so it is not lazy-loaded. */
  priority?: boolean;
  /** Position in the grid, used to stagger the parent's Reveal. */
  sizes?: string;
};

export default function FeaturedProjectCard({
  project,
  locale,
  variant = "full",
  labels,
  priority = false,
  sizes = "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw",
}: FeaturedProjectCardProps) {
  const isCompact = variant === "compact";

  return (
    <Link
      href={`/${locale}/projects/${project.slug}`}
      className="group flex h-full flex-col overflow-hidden rounded-sm border border-primary/10 bg-white shadow-card transition-shadow hover:shadow-lg"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-primary/5">
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
          className={`absolute left-4 top-4 rounded-full px-3 py-1 text-[10px] font-medium uppercase tracking-wide shadow-sm ${
            STATUS_TONE[project.status] ?? "bg-white text-ink"
          }`}
        >
          {labels.status}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-6">
        <p className="flex items-center gap-1.5 text-xs text-ink/65">
          <MapPin size={12} aria-hidden /> {project.location}
        </p>

        <h3 className="mt-2 text-xl font-light text-primary">{project.name}</h3>

        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-ink/70">
          {project.tagline}
        </p>

        {!isCompact && (
          <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-primary/10 pt-5 text-xs">
            <div>
              <dt className="text-ink/65">{labels.specType}</dt>
              <dd className="mt-0.5 font-medium text-primary">{labels.propertyType}</dd>
            </div>
            <div>
              <dt className="text-ink/65">{labels.specUnits}</dt>
              <dd className="mt-0.5 font-medium text-primary">
                {formatNumber(locale, project.totalUnits)}
              </dd>
            </div>
          </dl>
        )}

        <span className="mt-auto pt-6 inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-accent-700">
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
