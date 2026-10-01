"use client";

/**
 * components/admin/LeadDrawer.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The panel the pipeline opens a lead in, beside the board or table rather
 * than instead of it.
 *
 * State lives in the URL (?lead=[id]) rather than in React, for three
 * reasons: a drawer link can be pasted to a colleague and opens the same
 * thing, the browser's Back button closes it, and the lead's content is a
 * server component (LeadDetailView) that needs the id on the server anyway.
 * This component is only the frame: scrim, close, Esc, focus.
 *
 * Closing replaces the URL with the same one minus `lead`, so every filter,
 * the board/table choice and the scroll position survive the round trip.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Maximize2, X } from "lucide-react";

type Props = {
  fullPageHref: string;
  labels: { close: string; openFullPage: string; dialog: string };
  children: React.ReactNode;
};

export default function LeadDrawer({ fullPageHref, labels, children }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const panelRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("lead");
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  useEffect(() => {
    // Focus the panel so Esc and Tab start inside it, and give focus back
    // to whatever opened it (the row link) when it closes.
    const opener = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    // The page behind must not scroll under the wheel while the panel is
    // being read — the classic "scrolled the list instead" drawer bug.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
      opener?.focus?.();
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // Not while typing: Esc in a <select> or the note box means "cancel
      // this control", not "throw away the whole panel".
      const target = event.target as HTMLElement | null;
      const typing = target?.closest("input, textarea, select, [contenteditable='true']");
      if (event.key === "Escape" && !typing) close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  return (
    <div className="fixed inset-0 z-50 print:hidden">
      <button
        type="button"
        aria-label={labels.close}
        tabIndex={-1}
        onClick={close}
        className="absolute inset-0 h-full w-full cursor-default bg-[rgba(4,29,44,0.45)] animate-[lead-drawer-fade_150ms_ease-out]"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="lead-drawer-title"
        aria-label={labels.dialog}
        tabIndex={-1}
        className="absolute inset-y-0 right-0 flex w-full max-w-[560px] flex-col bg-surface shadow-[0_24px_60px_-20px_rgba(4,29,44,0.45)] outline-none animate-[lead-drawer-in_220ms_cubic-bezier(0.2,0.8,0.2,1)]"
      >
        <div className="flex h-[52px] shrink-0 items-center justify-end gap-1 border-b border-primary/10 bg-surface-raised px-3">
          <Link
            href={fullPageHref}
            className="inline-flex h-8 items-center gap-1.5 rounded-[6px] px-2.5 text-xs font-medium text-ink-muted transition-colors hover:bg-surface-muted hover:text-primary"
          >
            <Maximize2 size={13} aria-hidden />
            {labels.openFullPage}
          </Link>
          <button
            type="button"
            onClick={close}
            aria-label={labels.close}
            className="flex h-8 w-8 items-center justify-center rounded-[6px] text-ink-muted transition-colors hover:bg-surface-muted hover:text-primary"
          >
            <X size={17} aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
      </div>
    </div>
  );
}
