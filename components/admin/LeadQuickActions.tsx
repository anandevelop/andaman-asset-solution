"use client";

/**
 * components/admin/LeadQuickActions.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The two header buttons ("Log a call", "Schedule a viewing") — they don't
 * own any form state themselves, they just scroll to the composer and tell
 * it which tab to show, via the same window-event pattern AdminSidebar's
 * search trigger uses to open CommandK. See LeadActivityComposer.tsx.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { Calendar, Phone } from "lucide-react";
import { LEAD_COMPOSER_FOCUS_EVENT, type LeadComposerTab } from "@/components/admin/LeadActivityComposer";

function focusComposer(tab: LeadComposerTab) {
  document.getElementById("lead-composer")?.scrollIntoView({ behavior: "smooth", block: "start" });
  window.dispatchEvent(new CustomEvent(LEAD_COMPOSER_FOCUS_EVENT, { detail: tab }));
}

export default function LeadQuickActions({
  labels,
}: {
  labels: { logCall: string; scheduleViewing: string };
}) {
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={() => focusComposer("CALL")} className="admin-btn-ghost py-2!">
        <Phone size={14} strokeWidth={1.7} aria-hidden />
        {labels.logCall}
      </button>
      <button type="button" onClick={() => focusComposer("APPOINTMENT")} className="admin-btn-ghost py-2!">
        <Calendar size={14} strokeWidth={1.7} aria-hidden />
        {labels.scheduleViewing}
      </button>
    </div>
  );
}
