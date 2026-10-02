"use client";

/**
 * components/admin/ui/Segmented.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The mockup's `.seg`: a tinted track with 26px items and the active one
 * raised on the solid surface. Used for saved views, table/board, the
 * inbox filter, the locale switch.
 *
 * Items are links when they change the URL (a server page can pass hrefs
 * without any handler) or buttons when the parent is a client component
 * that owns the state and passes onSelect.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import type { LucideIcon } from "lucide-react";

export type SegmentedItem = {
  key: string;
  label: string;
  icon?: LucideIcon;
  /** Muted count after the label. */
  count?: number;
  /** Set for link items. */
  href?: string;
  /** A small dot after the label — a locale with gaps, say. */
  dot?: "warning" | "danger";
};

export default function Segmented({
  items,
  active,
  label,
  onSelect,
  className = "",
}: {
  items: SegmentedItem[];
  active: string | null;
  /** Accessible name of the group. */
  label: string;
  onSelect?: (key: string) => void;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={`inline-flex rounded-[10px] border border-adm-line bg-adm-text/5 p-[3px] ${className}`}
    >
      {items.map((item) => {
        const selected = item.key === active;
        const Icon = item.icon;
        const cls = [
          "inline-flex h-[26px] items-center gap-1.5 whitespace-nowrap rounded-[7px] px-[11px] text-xs transition-colors",
          selected ? "bg-adm-solid text-adm-text shadow-[0_1px_3px_rgba(0,0,0,0.12)]" : "text-adm-muted hover:text-adm-text",
        ].join(" ");
        const body = (
          <>
            {Icon && <Icon size={13} aria-hidden />}
            {item.label}
            {item.count !== undefined && <span className="tabular-nums text-adm-muted">{item.count}</span>}
            {item.dot && (
              <span
                aria-hidden
                className={`h-1.5 w-1.5 rounded-full ${item.dot === "danger" ? "bg-adm-danger" : "bg-adm-warning"}`}
              />
            )}
          </>
        );
        return item.href ? (
          <Link
            key={item.key}
            href={item.href}
            scroll={false}
            aria-current={selected ? "page" : undefined}
            className={cls}
          >
            {body}
          </Link>
        ) : (
          <button
            key={item.key}
            type="button"
            aria-pressed={selected}
            onClick={() => onSelect?.(item.key)}
            className={cls}
          >
            {body}
          </button>
        );
      })}
    </div>
  );
}
