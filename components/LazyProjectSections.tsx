"use client";

/**
 * components/LazyProjectSections.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The project page's heavy interactive sections, fetched as the visitor
 * nears them instead of with the page:
 *
 *   SitePlanMap      ~1,400 lines — canvas plan engine, list, 3D tab
 *   MapCard          ~700 lines  — location map and nearby places
 *   ProgressGallery  ~400 lines  — construction photos and lightbox
 *
 * All three sit well below the fold, and on a phone Lighthouse spent most
 * of its main-thread time hydrating them during page load — work for
 * sections most visitors had not scrolled to yet. Each one's code now
 * arrives within NEAR_VIEWPORT_MARGIN of it, so a visitor scrolling down
 * finds it ready.
 *
 * Not server-rendered any more (ssr: false). What they show is either
 * interactive (the plan, the map) or already elsewhere for search engines
 * (the project's JSON-LD and copy); the unit types, gallery and narrative,
 * which carry the page's indexable content, stay server-rendered.
 *
 * Until loaded, a placeholder of roughly the section's height keeps the
 * page from jumping as they arrive.
 * ─────────────────────────────────────────────────────────────────────────
 */

import dynamic from "next/dynamic";
import { useRef, type ComponentProps, type ReactNode } from "react";
import { useNearViewport } from "@/components/useNearViewport";
import type SitePlanMapType from "@/components/SitePlanMap";
import type MapCardType from "@/components/MapCard";
import type ProgressGalleryType from "@/components/ProgressGallery";

function Placeholder({ className }: { className: string }) {
  return <div aria-hidden className={`w-full bg-primary/3 ${className}`} />;
}

const SITE_PLAN_H = "min-h-[900px] md:min-h-[640px]";
const MAP_CARD_H = "min-h-[1100px] lg:min-h-[560px]";
const PROGRESS_H = "min-h-[560px] md:min-h-[640px]";

const SitePlanMap = dynamic(() => import("@/components/SitePlanMap"), {
  ssr: false,
  loading: () => <Placeholder className={SITE_PLAN_H} />,
});
const MapCard = dynamic(() => import("@/components/MapCard"), {
  ssr: false,
  loading: () => <Placeholder className={MAP_CARD_H} />,
});
const ProgressGallery = dynamic(() => import("@/components/ProgressGallery"), {
  ssr: false,
  loading: () => <Placeholder className={PROGRESS_H} />,
});

function Deferred({ placeholder, children }: { placeholder: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const near = useNearViewport(ref);
  return <div ref={ref}>{near ? children : <Placeholder className={placeholder} />}</div>;
}

export function LazySitePlanMap(props: ComponentProps<typeof SitePlanMapType>) {
  return (
    <Deferred placeholder={SITE_PLAN_H}>
      <SitePlanMap {...props} />
    </Deferred>
  );
}

export function LazyMapCard(props: ComponentProps<typeof MapCardType>) {
  return (
    <Deferred placeholder={MAP_CARD_H}>
      <MapCard {...props} />
    </Deferred>
  );
}

export function LazyProgressGallery(props: ComponentProps<typeof ProgressGalleryType>) {
  return (
    <Deferred placeholder={props.months.length ? PROGRESS_H : "min-h-[80px]"}>
      <ProgressGallery {...props} />
    </Deferred>
  );
}
