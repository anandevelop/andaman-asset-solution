/**
 * components/Breadcrumb.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The trail at the top of every public page except the home page — which
 * is where the trail starts, and so has nowhere to point.
 *
 * Built from the same array as the page's JSON-LD BreadcrumbList (see
 * trailFor in lib/seo.ts). That is the whole reason this takes items
 * rather than deriving them from the path: the trail a person reads and
 * the trail Google reads are one list, and a component that worked the
 * route out for itself would be a second, drifting answer.
 *
 * The last item is the current page and is not a link — a link to where
 * you already are is a control that appears to do something and does not.
 * It carries aria-current="page" so a screen reader says so.
 *
 * It fetches its own landmark name. Fourteen pages render this, and
 * threading one translated word through every one of them — several of
 * which have no `common` translator otherwise — is fourteen chances to
 * pass the wrong string. An async Server Component can ask for it itself.
 *
 * `tone="onImage"` is for the two detail pages whose hero is a full-bleed
 * photograph. The type turns white and picks up the same drop shadow the
 * carousel's arrows use, rather than a scrim, which would put a visible
 * box in the corner of the picture.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { getTranslations } from "next-intl/server";

export type BreadcrumbTrailItem = { name: string; href: string };

export default async function Breadcrumb({
  items,
  tone = "default",
  className = "",
}: {
  items: BreadcrumbTrailItem[];
  tone?: "default" | "onImage";
  className?: string;
}) {
  // One item is the home page alone, which is the page this never renders
  // on. Nothing to show rather than a lone word pretending to be a trail.
  if (items.length < 2) return null;

  const t = await getTranslations("common");

  const onImage = tone === "onImage";

  /* On a photograph the shadow is doing the work a scrim would, and a
     villa hero is usually sky at the top — the lightest thing white type
     ever has to sit on. Measured against that, /80 with a soft shadow was
     marginal, so this runs a step brighter and a step darker underneath. */
  /* text-ink/65, not /55: on the surface background this is the site's own
     floor for subdued text that still has to pass 4.5:1 (Navbar's inactive
     links and ProjectFilterBar's labels use the same value) — /55 measures
     3.6:1, which an axe run on the e-brochure page's breadcrumb caught. */
  const base = onImage
    ? "text-white/90 [text-shadow:0_1px_6px_rgba(0,0,0,0.75)]"
    : "text-ink/65";
  const linkTone = onImage ? "hover:text-white" : "hover:text-primary";
  const currentTone = onImage ? "text-white" : "text-primary";
  const dividerTone = onImage ? "text-white/60" : "text-ink/30";

  return (
    <nav aria-label={t("breadcrumb")} className={`text-xs ${base} ${className}`}>
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;

          return (
            <li key={`${item.href}-${index}`} className="flex items-center gap-1.5">
              {index > 0 && (
                <span aria-hidden className={dividerTone}>
                  /
                </span>
              )}

              {isLast ? (
                // `truncate` with a cap: the last crumb is an article
                // headline or a project name, and a long one would push
                // the whole trail onto three lines of a phone.
                <span aria-current="page" className={`max-w-[16rem] truncate ${currentTone}`}>
                  {item.name}
                </span>
              ) : (
                <Link href={item.href} className={`transition-colors ${linkTone}`}>
                  {item.name}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
