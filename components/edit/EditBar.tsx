"use client";

/**
 * components/edit/EditBar.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The dark strip above the navbar that only editors see.
 *
 * In normal flow above the sticky <header>, not sticky itself: two sticky
 * bars at top-0 would overlap, and this one only needs to be reachable
 * from the top of the page — the pills on each band carry the rest.
 * print:hidden like the rest of the site chrome.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowUpRight, ListOrdered, Pencil, Type } from "lucide-react";
import { pageEditLink, withReturnTo } from "@/lib/edit-mode";
import { stripLocale } from "@/lib/public-paths";
import { useEditMode } from "./EditModeProvider";

export default function EditBar() {
  const t = useTranslations("editMode");
  const pathname = usePathname();
  const mode = useEditMode();
  if (!mode?.canEdit) return null;

  const isHome = stripLocale(pathname) === "/";
  // On the home page "edit this page" and "reorder sections" are the same
  // screen (/admin/pages/home); one button, under the more specific name.
  const target = isHome ? null : (mode.pageTarget ?? pageEditLink(pathname));

  return (
    <div
      role="region"
      data-edit-ui
      aria-label={t("bar.label")}
      className="relative z-60 bg-gray-900 text-[13px] text-gray-200 print:hidden"
    >
      <div className="container-luxe flex min-h-10 flex-wrap items-center gap-x-4 gap-y-1.5 py-1.5">
        <p className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-emerald-500" aria-hidden />
          {t.rich("bar.viewingAs", {
            // In the page's language, not the enum: "EDITOR" read as code.
            role: mode.role ? t(`roles.${mode.role}` as never) : "",
            b: (chunks) => <b className="font-semibold text-white">{chunks}</b>,
          })}
        </p>

        <div className="flex-1" />

        <label className="flex cursor-pointer select-none items-center gap-2">
          <input
            type="checkbox"
            className="peer sr-only"
            checked={mode.editing}
            onChange={(event) => mode.setEditing(event.target.checked)}
          />
          <span
            aria-hidden
            className="relative h-[18px] w-[34px] rounded-full bg-gray-600 transition-colors peer-checked:bg-blue-600 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-400 after:absolute after:left-0.5 after:top-0.5 after:size-3.5 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4"
          />
          {t("bar.toggle")}
        </label>

        <button
          type="button"
          data-edit-ui
          aria-pressed={mode.picking}
          onClick={() => mode.setPicking(!mode.picking)}
          title={t("bar.pickTextHint")}
          className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium ${
            mode.picking
              ? "bg-amber-300 text-gray-900 hover:bg-amber-200"
              : "border border-gray-700 bg-gray-800 hover:bg-gray-700"
          }`}
        >
          <Type size={13} aria-hidden />
          {mode.picking ? t("bar.pickTextOn") : t("bar.pickText")}
        </button>

        {target && (
          <a
            href={withReturnTo(`${mode.adminBase}${target.href}`, pathname)}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-2.5 py-1 font-medium text-white hover:bg-blue-500"
          >
            <Pencil size={13} aria-hidden />
            {t("bar.editPage")}
          </a>
        )}

        {isHome && (
          <a
            href={withReturnTo(`${mode.adminBase}/pages/home`, pathname)}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-700 bg-gray-800 px-2.5 py-1 hover:bg-gray-700"
          >
            <ListOrdered size={13} aria-hidden />
            {t("bar.reorder")}
          </a>
        )}

        <a
          href={mode.adminBase}
          className="inline-flex items-center gap-1 rounded-md border border-gray-700 bg-gray-800 px-2.5 py-1 hover:bg-gray-700"
        >
          {t("bar.dashboard")}
          <ArrowUpRight size={13} aria-hidden />
        </a>
      </div>
    </div>
  );
}
