"use client";

/**
 * components/admin/AdminModal.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The overlay shell components/admin/InternalLinkModal.tsx and
 * InsertImageModal.tsx both need — no reusable admin dialog primitive
 * existed before these two, so this is the smallest common shape between
 * them rather than each duplicating a portal/focus-trap/scroll-lock.
 *
 * Portal, focus trap and body-scroll-lock are the same pattern
 * components/LeadSuccessDialog.tsx already established for the public
 * site (itself copied from Navbar.tsx's mobile menu) — see that file's
 * header for why each piece exists. No entry/exit animation here: these
 * are editor tools opened and closed rapidly while writing, not a
 * one-time confirmation moment worth a motion flourish.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

const FOCUSABLE = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

type Props = {
  open: boolean;
  onClose: () => void;
  titleId: string;
  title: string;
  closeLabel: string;
  children: React.ReactNode;
  /** Overrides the default max-width for a wider modal (the link picker's
   *  results list wants more room than the image modal's form fields). */
  className?: string;
};

export default function AdminModal({ open, onClose, titleId, title, closeLabel, children, className }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const nodes = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
      if (nodes.length === 0) return;

      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-6 pt-16 backdrop-blur-[3px]"
      style={{ backgroundColor: "rgba(4,29,44,0.62)" }}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
        className={`relative w-full rounded-xs bg-white p-6 shadow-cardHover ${className ?? "max-w-lg"}`}
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 id={titleId} className="text-sm font-semibold text-primary">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="shrink-0 text-ink-muted transition-colors hover:text-primary"
          >
            <X size={18} aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
