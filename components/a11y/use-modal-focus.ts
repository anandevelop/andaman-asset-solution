"use client";

/**
 * components/a11y/use-modal-focus.ts
 * ─────────────────────────────────────────────────────────────────────────
 * What a modal dialog owes keyboard and screen-reader users, in one place
 * (the gallery lightboxes and AdminModal had none of it):
 *
 *  - focus moves into the dialog when it opens (the first control, or the
 *    container itself),
 *  - Tab and Shift+Tab stay inside it,
 *  - focus goes back to whatever opened it when it closes,
 *  - the page behind does not scroll.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect, type RefObject } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useModalFocus(open: boolean, ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // After paint: AnimatePresence / portals mount the node in this commit,
    // but the ref may be attached a frame later.
    const frame = requestAnimationFrame(() => {
      const root = ref.current;
      if (!root || root.contains(document.activeElement)) return;
      const first = root.querySelector<HTMLElement>(FOCUSABLE);
      if (first) first.focus();
      else {
        if (!root.hasAttribute("tabindex")) root.setAttribute("tabindex", "-1");
        root.focus();
      }
    });

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Tab") return;
      const root = ref.current;
      if (!root) return;
      const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !root.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !root.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (opener?.isConnected) opener.focus();
    };
  }, [open, ref]);
}
