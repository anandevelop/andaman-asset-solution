"use client";

/**
 * components/admin/LeadViewToggle.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Board / table switch for the leads page — a plain link pair rather than
 * a stateful tab, so the choice survives a refresh and is shareable the
 * same way the status/sort filters already are (see LeadFilters.tsx).
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { LayoutGrid, List } from "lucide-react";

type View = "board" | "table";

type Props = {
  locale: string;
  active: View;
  labels: { board: string; table: string };
};

export default function LeadViewToggle({ locale, active, labels }: Props) {
  const searchParams = useSearchParams();

  function hrefFor(view: View) {
    const params = new URLSearchParams(searchParams.toString());
    // "board" is the default, matching the page's own fallback — keep the
    // URL bare when landing back on it.
    if (view === "board") params.delete("view");
    else params.set("view", view);
    const query = params.toString();
    return `/${locale}/admin/leads${query ? `?${query}` : ""}`;
  }

  const item = (view: View, label: string, Icon: typeof LayoutGrid) => (
    <Link
      href={hrefFor(view)}
      aria-current={active === view ? "page" : undefined}
      className={[
        "flex items-center gap-1.5 rounded-xs px-3 py-2 text-xs font-medium transition-colors",
        active === view
          ? "bg-primary text-white"
          : "text-ink-muted hover:bg-surface-muted hover:text-primary",
      ].join(" ")}
    >
      <Icon size={14} aria-hidden />
      {label}
    </Link>
  );

  return (
    <div className="flex shrink-0 items-center gap-0.5 rounded-xs border border-primary/15 bg-surface-raised p-0.5">
      {item("board", labels.board, LayoutGrid)}
      {item("table", labels.table, List)}
    </div>
  );
}
