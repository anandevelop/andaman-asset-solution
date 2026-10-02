/**
 * components/admin/ui/CollectionGrid.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * A content list as cards — awards, FAQs, hero slides, why-us points — each
 * one a link that opens its form in a drawer (`?edit=<id>`).
 *
 * These screens used to put an "add" form at the top and every existing
 * record's full form under it, so the awards page was 6,500px of inputs
 * and finding one award meant scrolling past all the others' fields. The
 * v4 rule is a list to find things in and a drawer to change one; the
 * form components themselves are unchanged, only where they render.
 *
 * Server component, plain data in: the cards are links, the drawer is the
 * page's (see AdminDrawer and collectionHref).
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { LOCALE_DISPLAY_ORDER } from "@/i18n";
import type { CompletenessMap } from "@/lib/admin/translated-form";
import AdminImage from "@/components/admin/ui/AdminImage";
import LocaleFlags from "@/components/admin/ui/LocaleFlags";

export type CollectionItem = {
  id: string;
  href: string;
  title: string;
  subtitle?: string | null;
  /** A thumbnail; omit for text-only collections (FAQ, principles). */
  imageUrl?: string | null;
  /** The small pill above the title — an organisation, a category. */
  tag?: string | null;
  /** Mono, beside the tag — a year, "#3". */
  meta?: string | null;
  visible: boolean;
  completeness: CompletenessMap;
};

export default function CollectionGrid({
  items,
  columns = 3,
  hasImages = false,
  labels,
}: {
  items: CollectionItem[];
  columns?: 2 | 3;
  /** Reserve the thumbnail slot on every card, so a missing image shows
   *  the fallback instead of a card of a different shape. */
  hasImages?: boolean;
  labels: { visible: string; hidden: string; missingThai: string; empty: string };
}) {
  if (items.length === 0) {
    return <div className="admin-card text-center text-sm text-adm-muted">{labels.empty}</div>;
  }

  return (
    <ul className={`grid gap-3 sm:grid-cols-2 ${columns === 3 ? "xl:grid-cols-3" : ""}`}>
      {items.map((item) => (
        <li key={item.id}>
          <Link
            href={item.href}
            scroll={false}
            data-spot
            className={["admin-card admin-card-lift flex h-full gap-3 p-4!", item.visible ? "" : "opacity-70"].join(" ")}
          >
            {hasImages && (
              <AdminImage
                src={item.imageUrl}
                iconSize={16}
                className="h-14 w-14 shrink-0 rounded-[10px] object-cover"
              />
            )}
            <span className="flex min-w-0 flex-1 flex-col">
              {(item.tag || item.meta) && (
                <span className="flex flex-wrap items-center gap-1.5">
                  {item.tag && (
                    <span className="rounded-full bg-adm-status-info-bg px-2 py-0.5 text-[10.5px] font-medium text-adm-status-info">
                      {item.tag}
                    </span>
                  )}
                  {item.meta && <span className="admin-mono text-xs text-adm-accent-ink">{item.meta}</span>}
                </span>
              )}
              <span className="mt-1 line-clamp-2 text-sm font-medium leading-snug text-adm-text">{item.title}</span>
              {item.subtitle && <span className="mt-0.5 line-clamp-2 text-xs text-adm-muted">{item.subtitle}</span>}

              <span className="mt-auto flex flex-wrap items-center gap-1.5 pt-3">
                <span
                  className={[
                    "rounded-full px-2 py-0.5 text-[11px] font-medium",
                    item.visible ? "bg-adm-success-bg text-adm-success" : "bg-adm-neutral-bg text-adm-neutral",
                  ].join(" ")}
                >
                  {item.visible ? labels.visible : labels.hidden}
                </span>
                {!item.completeness.th && (
                  <span className="rounded-full bg-adm-warning-bg px-2 py-0.5 text-[11px] font-medium text-adm-warning">
                    {labels.missingThai}
                  </span>
                )}
                <span className="ml-auto">
                  <LocaleFlags
                    locales={LOCALE_DISPLAY_ORDER.map((code) => ({
                      locale: code,
                      state: item.completeness[code] ? "complete" : "missing",
                    }))}
                  />
                </span>
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** `?lang=` kept, `edit=` set (or dropped when null) — the cards' links,
 *  the drawer's close, and the header's "+ add". */
export function collectionHref(base: string, lang: string | undefined, edit: string | null): string {
  const params = new URLSearchParams();
  if (lang) params.set("lang", lang);
  if (edit) params.set("edit", edit);
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}
