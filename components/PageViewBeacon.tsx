"use client";

/**
 * components/PageViewBeacon.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Tells the server that this page was read. Renders nothing.
 *
 * Mounted on the article page, whose view count sits next to its lead
 * count on /admin/news — see app/api/page-view/route.ts for why that
 * number is counted here rather than read back out of Google Analytics.
 *
 * Uses sendBeacon where it exists: it survives the page being closed,
 * which a fetch started on the way out does not, and it never delays the
 * navigation. fetch with keepalive is the fallback.
 *
 * Fires once per mount, guarded against React's development double-mount
 * so a local read does not count twice.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

export default function PageViewBeacon() {
  const pathname = usePathname();
  const counted = useRef<string | null>(null);

  useEffect(() => {
    if (counted.current === pathname) return;
    counted.current = pathname;

    const body = JSON.stringify({ path: pathname });

    try {
      if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
        navigator.sendBeacon("/api/page-view", new Blob([body], { type: "application/json" }));
        return;
      }

      void fetch("/api/page-view", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    } catch {
      // A counter is never worth an error in a reader's console.
    }
  }, [pathname]);

  return null;
}
