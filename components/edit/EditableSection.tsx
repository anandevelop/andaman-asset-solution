"use client";

/**
 * components/edit/EditableSection.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * One band of a public page, with an "Edit" pill for editors.
 *
 * The wrapper <div> is rendered for everyone, always, rather than only
 * once the visitor turns out to be an editor. Swapping a Fragment for a
 * <div> after hydration changes the element type at that position, so
 * React would unmount and remount the whole band — restarting the hero
 * carousel and replaying every <Reveal> animation on the page the moment
 * the session check came back. A plain relative <div> costs nothing.
 *
 * The pill is shown on hover (and keyboard focus) on devices that hover,
 * and permanently on touch screens, which have no hover to reveal it with.
 * It is a sibling of the band's content, never inside it, so it can sit
 * over cards that are themselves links without nesting one <a> in another.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Pencil } from "lucide-react";
import type { EditLink } from "@/lib/edit-mode";
import { useEditMode } from "./EditModeProvider";

export default function EditableSection({
  links,
  children,
}: {
  /** First is the primary editor; any others are shown beside it. */
  links: readonly EditLink[];
  children: ReactNode;
}) {
  const t = useTranslations("editMode");
  const mode = useEditMode();
  const active = Boolean(mode?.editing) && links.length > 0;

  return (
    <div
      className={
        active
          ? "group/edit relative hover:outline-2 hover:-outline-offset-2 hover:outline-dashed hover:outline-blue-600 focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-dashed focus-within:outline-blue-600"
          : "relative"
      }
    >
      {children}

      {active && (
        <div
          className="pointer-events-none absolute right-3 top-3 z-40 flex flex-wrap justify-end gap-1.5 opacity-0 transition-opacity group-hover/edit:pointer-events-auto group-hover/edit:opacity-100 group-focus-within/edit:pointer-events-auto group-focus-within/edit:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100 print:hidden sm:right-4 sm:top-4"
        >
          {links.map((link) => (
            <a
              key={link.href}
              href={`${mode!.adminBase}${link.href}`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-[12.5px] font-medium text-white shadow-lg shadow-blue-600/30 hover:bg-blue-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              <Pencil size={13} aria-hidden />
              {t("editLabel", { name: t(`editors.${link.labelKey}` as never) })}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
