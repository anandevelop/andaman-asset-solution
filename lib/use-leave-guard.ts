"use client";

/**
 * lib/use-leave-guard.ts
 * ─────────────────────────────────────────────────────────────────────────
 * While `dirty`, ask before anything takes the user away from unsaved
 * work — including in-app links.
 *
 * `beforeunload` alone covered closing the tab and reloading, and nothing
 * else: a next/link click is a client-side navigation, which never fires
 * it. On the site-copy grid that meant a click on another section in the
 * sidebar, or on the All / Edited / Review tabs, threw away everything
 * typed without a word — the grid is remounted per section. Every long
 * admin form with a FormSaveBar had the same hole.
 *
 * So this also listens for clicks on links in the capture phase at the
 * document, which runs before React's own listener on the root (where
 * <Link> handles the click). Declining stops the event there: neither the
 * router nor the browser navigates. Links that open elsewhere — a new
 * tab, a modified click, a download, an in-page #anchor — leave the work
 * where it is and are let through.
 *
 * The browser back button is not covered: the App Router gives no way to
 * veto a popstate navigation.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect } from "react";

function leavesThePage(anchor: HTMLAnchorElement, event: MouseEvent): boolean {
  if (event.defaultPrevented || event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  if (anchor.hasAttribute("download")) return false;
  const target = anchor.getAttribute("target");
  if (target && target !== "_self") return false;
  const href = anchor.getAttribute("href");
  if (!href || href.startsWith("#") || href.startsWith("javascript:")) return false;

  const url = new URL(anchor.href, window.location.href);
  const here = window.location;
  // Same page, different hash: nothing is lost.
  return !(url.origin === here.origin && url.pathname === here.pathname && url.search === here.search);
}

export function useLeaveGuard(dirty: boolean, message: string) {
  useEffect(() => {
    if (!dirty) return;

    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };

    const click = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement) || !leavesThePage(anchor, event)) return;
      if (window.confirm(message)) return;
      event.preventDefault();
      event.stopPropagation();
    };

    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", click, true);
    };
  }, [dirty, message]);
}
