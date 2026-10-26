"use client";

/**
 * components/TrackProjectView.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Sends one project_view (Meta ViewContent) for the project page it sits on.
 * Renders nothing.
 *
 * The analytics scripts load after hydration and only once cookies are
 * accepted, so on mount they are usually not there yet: a visitor who
 * accepts on this very page should still count. This waits for either
 * provider, checking once a second for a minute, sends once, and stops.
 * Nothing is sent without consent, because without it neither script ever
 * loads.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect } from "react";
import { trackProjectView } from "@/lib/analytics";

export default function TrackProjectView({ projectSlug, projectName }: { projectSlug: string; projectName: string }) {
  useEffect(() => {
    let tries = 0;
    const ready = () => typeof window.fbq === "function" || typeof window.gtag === "function";
    const send = () => {
      if (ready()) {
        trackProjectView({ projectSlug, projectName });
        return true;
      }
      return false;
    };
    if (send()) return;
    const timer = window.setInterval(() => {
      tries += 1;
      if (send() || tries >= 60) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [projectSlug, projectName]);

  return null;
}
