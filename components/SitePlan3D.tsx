"use client";

/**
 * components/SitePlan3D.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The 3D view of a project's site plan: a self-contained three.js page in
 * public/embed/, framed here and fed the live unit statuses.
 *
 * WHY AN IFRAME
 *
 * The scene (public/embed/residence-prime-3d.html) was modelled by hand for
 * The Residence Prime — every house, tree and landmark — and ships as one
 * HTML file with its own panel and controls. Framing it keeps that file
 * exactly as designed and keeps three.js (~600 KB) out of the site's own
 * bundle: SitePlanMap mounts this component only when a visitor picks the
 * 3D view, so nobody else downloads any of it. three.js is served from
 * public/embed/vendor/, not a CDN, because the site's CSP admits neither
 * cdnjs nor jsDelivr.
 *
 * THE MESSAGES (same origin only, both ways)
 *
 *   → rp3d:setUnits  {units:[{id:"R01", status:"available|reserved|sold", land}]}
 *                    sent on load and whenever the statuses change, so the
 *                    scene always shows what the admin's unit list says
 *                    rather than the statuses baked into the file.
 *   ← rp3d:select    a plot was tapped; passed to onSelect.
 *   ← rp3d:enquire   "book a viewing" was pressed; scrolls to the page's
 *                    enquiry form and, if its message box is still empty,
 *                    writes the plot number into it.
 *
 * Which projects have a scene: lib/site-plan-3d.ts.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { ProjectUnitSummary } from "@/lib/projects";

type SceneStatus = "available" | "reserved" | "sold";

type Props = {
  src: string;
  /** Only unitNumber, status and landAreaSqm are read. */
  locale: string;
  projectName: string;
  units: Pick<ProjectUnitSummary, "unitNumber" | "status" | "landAreaSqm">[];
  title: string;
  /** id of the enquiry form section on the page */
  enquireId?: string;
  onSelect?: (unitNumber: string) => void;
  /** The frame's size and border; the public page's by default. */
  frameClassName?: string;
};

/** Set a value on a React-controlled field so the form's own state sees it. */
function setNativeValue(el: HTMLTextAreaElement | HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

const PUBLIC_FRAME =
  "h-[860px] w-full border border-primary/10 bg-white md:h-[min(80vh,760px)] md:min-h-[560px]";

export default function SitePlan3D({
  src,
  locale,
  projectName,
  units,
  title,
  enquireId = "enquire",
  onSelect,
  frameClassName = PUBLIC_FRAME,
}: Props) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  // The scene has Thai and English; Chinese and Russian visitors get English.
  const sceneLang = locale === "th" ? "th" : "en";

  const sceneUnits = useMemo(
    () =>
      units.map((u) => ({
        id: u.unitNumber,
        status: u.status.toLowerCase() as SceneStatus,
        land: u.landAreaSqm ?? undefined,
      })),
    [units],
  );

  const pushUnits = useCallback(() => {
    frameRef.current?.contentWindow?.postMessage({ type: "rp3d:setUnits", units: sceneUnits }, window.location.origin);
  }, [sceneUnits]);

  useEffect(() => {
    pushUnits();
  }, [pushUnits]);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.source !== frameRef.current?.contentWindow || e.origin !== window.location.origin) return;
      const data = e.data as { type?: string; unit?: string | null };

      if (data?.type === "rp3d:enquire") {
        const form = document.getElementById(enquireId);
        if (!form) return;
        form.scrollIntoView({ behavior: "smooth", block: "start" });
        // The form loads lazily (components/LazyLeadForm.tsx): ask for it,
        // then fill the message once its textarea exists.
        window.dispatchEvent(new Event("lead-form:load"));
        const unit = data.unit;
        if (!unit) return;
        const fill = (message: HTMLTextAreaElement) => {
          if (message.value) return;
          setNativeValue(
            message,
            sceneLang === "th"
              ? `สนใจแปลง ${unit} โครงการ ${projectName}`
              : `I'm interested in plot ${unit} at ${projectName}`,
          );
        };
        const ready = form.querySelector<HTMLTextAreaElement>("textarea");
        if (ready) {
          fill(ready);
          return;
        }
        const watcher = new MutationObserver(() => {
          const message = form.querySelector<HTMLTextAreaElement>("textarea");
          if (!message) return;
          watcher.disconnect();
          fill(message);
        });
        watcher.observe(form, { childList: true, subtree: true });
        setTimeout(() => watcher.disconnect(), 10_000);
      }

      if (data?.type === "rp3d:select" && data.unit) onSelect?.(data.unit);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [enquireId, sceneLang, projectName, onSelect]);

  return (
    <div className={`relative ${frameClassName}`}>
      <iframe
        ref={frameRef}
        src={`${src}?lang=${sceneLang}`}
        title={title}
        // Not fetched until the section nears the viewport: three.js plus
        // the scene is 300–730 KB, which a visitor who never scrolls to
        // the site plan should not pay for.
        loading="lazy"
        allow="fullscreen"
        onLoad={pushUnits}
        className="block h-full w-full border-0"
      />
    </div>
  );
}
