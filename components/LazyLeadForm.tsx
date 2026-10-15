"use client";

/**
 * components/LazyLeadForm.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * <LeadForm> for the bottom of a project page, fetched only as the visitor
 * nears it.
 *
 * The form brings zod (validation) and libphonenumber (the phone field's
 * country data) — together ~500 KB of JavaScript that every visitor
 * downloaded and parsed on page load, while most never reach the last
 * section. Here the form's code is requested when the section comes within
 * NEAR_VIEWPORT_MARGIN of the viewport (components/useNearViewport.ts),
 * early enough that a visitor scrolling down finds it ready, and straight
 * away when something sends them to it: an #enquire link (hero button,
 * site plan "Book a viewing"), the 3D scene's enquire, or a page opened
 * at a #hash.
 *
 * Until then a quiet placeholder holds the form's height, so nothing below
 * jumps when it arrives. The form is not server-rendered any more; it has
 * no content a search engine needs, and it cannot be used before its
 * JavaScript has loaded anyway.
 * ─────────────────────────────────────────────────────────────────────────
 */

import dynamic from "next/dynamic";
import { useRef, type ComponentProps } from "react";
import type LeadFormType from "@/components/LeadForm";
import { useNearViewport } from "@/components/useNearViewport";

function Placeholder() {
  return (
    <div aria-hidden className="min-h-[620px] space-y-5 sm:min-h-[580px]">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-12 animate-pulse bg-primary/4" />
      ))}
      <div className="h-28 animate-pulse bg-primary/4" />
      <div className="h-12 bg-primary/10" />
    </div>
  );
}

const LeadForm = dynamic(() => import("@/components/LeadForm"), {
  ssr: false,
  loading: Placeholder,
});

export default function LazyLeadForm(props: ComponentProps<typeof LeadFormType>) {
  const ref = useRef<HTMLDivElement>(null);
  // "lead-form:load" — the 3D scene's enquire (components/SitePlan3D.tsx).
  const near = useNearViewport(ref, { event: "lead-form:load" });
  return <div ref={ref}>{near ? <LeadForm {...props} /> : <Placeholder />}</div>;
}
