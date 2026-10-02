/**
 * components/admin/ui/AdminPageHeader.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Every admin page's title block, one shape (v4 round two, R5).
 *
 * There were 36 hand-written copies — eyebrow <p>, an h1, a description —
 * each with its own margins, so the title sat at a different height on
 * every screen and none matched the mockup. This is the mockup's `.ph`:
 *
 *   eyebrow   11.5px, accent ink, .08em tracking, 13px icon, 6px below
 *   title     25px / 600 / 1.2, -.01em
 *   lede      14px muted, 4px below the title
 *   actions   right-aligned, bottom-aligned with the title block
 *
 * The eyebrow is the nav zone the page lives in, with the page's own nav
 * icon (zoneEyebrow in lib/admin/nav.ts) — not the repeated "Back office"
 * label most pages carried, which told nobody anything.
 *
 * Presentational and hook-free, so server and client pages can both use it.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, type LucideIcon } from "lucide-react";

export type Eyebrow = { icon?: LucideIcon; label: string };

export default function AdminPageHeader({
  eyebrow,
  title,
  titleAddon,
  description,
  actions,
  back,
  className = "",
}: {
  eyebrow?: Eyebrow | null;
  title: ReactNode;
  /** Beside the title, inside the h1's row — a status pill, a live dot. */
  titleAddon?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** A back link above the eyebrow, for create/edit screens. */
  back?: { href: string; label: string };
  className?: string;
}) {
  const Icon = eyebrow?.icon;
  return (
    <header className={`mb-5 flex flex-wrap items-end gap-4 ${className}`}>
      <div className="min-w-0 flex-1">
        {back && (
          <Link
            href={back.href}
            className="mb-2 inline-flex items-center gap-1.5 text-[13px] text-adm-muted transition-colors hover:text-adm-text"
          >
            <ArrowLeft size={14} aria-hidden />
            {back.label}
          </Link>
        )}
        {eyebrow && (
          <p className="mb-1.5 flex items-center gap-1.5 text-[11.5px] tracking-[0.08em] text-adm-accent-ink">
            {Icon && <Icon size={13} aria-hidden />}
            {eyebrow.label}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-[25px] font-semibold leading-[1.2] tracking-[-0.01em] text-adm-text">{title}</h1>
          {titleAddon}
        </div>
        {description && <p className="mt-1 max-w-3xl text-sm text-adm-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-end gap-2">{actions}</div>}
    </header>
  );
}
