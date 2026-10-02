"use client";

/**
 * components/admin/ui/AdminDrawer.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The v4 side panel for add and edit forms: floating 10px off the right
 * edge, 20px corners, the page dimmed behind it.
 *
 * Opened by a query parameter the page reads (`?edit=<id>`, `?edit=new`),
 * so Back closes it, a link can open it, and the form inside is an
 * ordinary server-rendered form with its own server action — this is only
 * the frame. Closing replaces the URL with `closeHref`.
 *
 * LeadCreateDrawer and LeadDrawer predate this and keep their own frames;
 * they carry behaviour (a hand-off to the new lead, a full-page link) that
 * a generic shell would only have to grow options for.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

export default function AdminDrawer({
  title,
  icon,
  closeHref,
  closeLabel,
  width = 560,
  children,
}: {
  title: string;
  /** An element, not a component: server pages render this drawer, and a
   *  function cannot cross into a client component as a prop. */
  icon?: ReactNode;
  closeHref: string;
  closeLabel: string;
  width?: number;
  children: ReactNode;
}) {
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") router.replace(closeHref, { scroll: false });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeHref, router]);

  const close = () => router.replace(closeHref, { scroll: false });

  return (
    <div className="fixed inset-0 z-50 print:hidden" role="presentation">
      <button
        type="button"
        tabIndex={-1}
        aria-label={closeLabel}
        onClick={close}
        className="absolute inset-0 h-full w-full cursor-default bg-adm-band/40 motion-safe:animate-[lead-drawer-fade_150ms_ease-out]"
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ width: `min(${width}px, calc(100vw - 20px))` }}
        className="absolute inset-y-2.5 right-2.5 flex flex-col overflow-hidden rounded-[20px] bg-adm-solid shadow-[var(--adm-shadow-float)] outline-none motion-safe:animate-[lead-drawer-in_220ms_cubic-bezier(0.2,0.8,0.2,1)]"
      >
        <div className="flex items-center gap-3 border-b border-adm-line px-5 py-4">
          {icon && (
            <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-adm-fill/20 text-adm-accent-ink">
              {icon}
            </span>
          )}
          <h2 className="min-w-0 flex-1 truncate text-base font-semibold text-adm-text">{title}</h2>
          <button type="button" onClick={close} aria-label={closeLabel} className="admin-btn-quiet admin-btn-sm">
            <X size={16} aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
      </div>
    </div>
  );
}
