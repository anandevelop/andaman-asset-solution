"use client";
/**
 * components/club/PortalRuntime.tsx — the portal's two pieces of
 * browser-only plumbing, mounted once by the club layout:
 *
 *  • registers /club-sw.js (offline card, see public/club-sw.js) and, when
 *    nobody is signed in, tells it to drop the cached card — a sign-out or
 *    a revoked device must not leave a card on the phone;
 *  • keeps the "auto" theme in step with the OS. The layout's inline
 *    script already picked the right class before first paint; this
 *    follows later changes (sunset, Control Centre).
 */
import { useEffect } from "react";

type Props = { rootId: string; theme: "dark" | "light" | "auto"; signedIn: boolean };

export default function PortalRuntime({ rootId, theme, signedIn }: Props) {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/club-sw.js", { scope: "/" })
      .then((reg) => {
        if (!signedIn) (reg.active ?? navigator.serviceWorker.controller)?.postMessage({ type: "club:clear" });
      })
      .catch(() => {
        /* no SW (private mode, old browser) — the portal works online as before */
      });
  }, [signedIn]);

  useEffect(() => {
    const root = document.getElementById(rootId);
    if (!root) return;
    const apply = (light: boolean) => {
      root.classList.toggle("club-light", light);
      root.classList.toggle("club-dark", !light);
    };
    if (theme !== "auto") {
      apply(theme === "light");
      return;
    }
    const media = window.matchMedia("(prefers-color-scheme: light)");
    apply(media.matches);
    const onChange = (event: MediaQueryListEvent) => apply(event.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [rootId, theme]);

  return null;
}
