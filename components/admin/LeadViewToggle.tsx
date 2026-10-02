"use client";

/**
 * components/admin/LeadViewToggle.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Table / board switch for the leads page, at the right of the toolbar.
 *
 * The choice goes in the URL (`view=`), so a link opens the same view, and
 * in a cookie, so the next visit without one opens where this person left
 * off. A cookie rather than the localStorage display prefs: the page is
 * rendered on the server, which has to know the view before it can decide
 * what to query — a stored preference read after hydration would draw the
 * table and then swap it for the board.
 *
 * The table is the default (v4 round two): it is the view that shows the
 * phone, the owner and the age at once, which is what a rep works from.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useRouter, useSearchParams } from "next/navigation";
import { LayoutGrid, List } from "lucide-react";
import Segmented from "@/components/admin/ui/Segmented";
import { LEADS_VIEW_COOKIE, type LeadsView } from "@/lib/admin/leads-view";

type Props = {
  locale: string;
  active: LeadsView;
  labels: { group: string; board: string; table: string };
};

export default function LeadViewToggle({ locale, active, labels }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const select = (view: LeadsView) => {
    document.cookie = `${LEADS_VIEW_COOKIE}=${view}; path=/; max-age=31536000; samesite=lax`;
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", view);
    router.push(`/${locale}/admin/leads?${params.toString()}`, { scroll: false });
  };

  return (
    <Segmented
      label={labels.group}
      active={active}
      onSelect={(key) => select(key as LeadsView)}
      items={[
        { key: "table", label: labels.table, icon: List },
        { key: "board", label: labels.board, icon: LayoutGrid },
      ]}
    />
  );
}
