"use client";

/**
 * components/edit/EditableItem.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * A small pencil over one card (a project, an article, an event) that
 * opens that row's own edit screen.
 *
 * Same always-render-the-wrapper rule as EditableSection, for the same
 * reason. The wrapper is `h-full` because the cards it wraps fill their
 * grid cell, and a wrapper that did not would let them collapse.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Pencil } from "lucide-react";
import { useEditMode } from "./EditModeProvider";

export default function EditableItem({ href, children }: { href: string; children: ReactNode }) {
  const t = useTranslations("editMode");
  const mode = useEditMode();
  const active = Boolean(mode?.editing);

  return (
    <div className={active ? "group/item relative h-full" : "relative h-full"}>
      {children}

      {active && (
        <a
          href={`${mode!.adminBase}${href}`}
          title={t("editItem")}
          aria-label={t("editItem")}
          className="absolute right-2.5 top-2.5 z-30 inline-flex size-8 items-center justify-center rounded-lg border border-blue-600 bg-white text-blue-600 opacity-0 shadow-md transition-opacity hover:bg-blue-50 focus-visible:opacity-100 group-hover/item:opacity-100 [@media(hover:none)]:opacity-100 print:hidden"
        >
          <Pencil size={14} aria-hidden />
        </a>
      )}
    </div>
  );
}
