"use client";

/**
 * components/admin/DashboardControls.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The dashboard header's two action controls (Main.dc.html): a date-range
 * picker and an export button, paired because the export downloads leads
 * from exactly the range currently selected — there is no separate range
 * picker for the export, by design.
 *
 * The range only affects the lead-source breakdown and the conversion
 * table (see app/[locale]/admin/page.tsx) — the monthly trend chart is
 * always a fixed 12-month view, matching its own subtitle.
 *
 * Reuses the same /api/admin/leads/export endpoint and failure copy as
 * LeadExportButton (components/admin/LeadExportButton.tsx) rather than a
 * second export implementation — this is just a from/to pair derived from
 * the selected range instead of a manually-typed date pair.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { CalendarDays, ChevronDown, Download, Loader2 } from "lucide-react";
import { RANGE_OPTIONS, type RangeDays } from "@/lib/dashboard-range";

type Props = {
  currentRange: RangeDays;
  labels: {
    rangeLabel: string;
    range7: string;
    range30: string;
    range90: string;
    range365: string;
    exportReport: string;
  };
};

export default function DashboardControls({ currentRange, labels }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tExport = useTranslations("admin.leads.export");
  const [busy, setBusy] = useState(false);

  const rangeText: Record<RangeDays, string> = {
    "7": labels.range7,
    "30": labels.range30,
    "90": labels.range90,
    "365": labels.range365,
  };

  const onRangeChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", value);
    router.push(`${pathname}?${params.toString()}`);
  };

  const download = async () => {
    setBusy(true);

    try {
      const to = new Date();
      const from = new Date(to.getTime() - Number(currentRange) * 24 * 60 * 60_000);
      const query = new URLSearchParams({
        from: from.toISOString().slice(0, 10),
        to: to.toISOString().slice(0, 10),
      });

      const response = await fetch(`/api/admin/leads/export?${query.toString()}`);

      if (!response.ok) {
        window.alert(response.status === 429 ? tExport("rateLimited") : tExport("failed"));
        return;
      }

      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") ?? "";
      const match = /filename="([^"]+)"/.exec(disposition);

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = match?.[1] ?? "leads.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      window.alert(tExport("failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex shrink-0 gap-2.5">
      <div className="relative">
        <label className="sr-only" htmlFor="dashboard-range">
          {labels.rangeLabel}
        </label>
        <CalendarDays
          size={14}
          strokeWidth={1.7}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-primary"
          aria-hidden
        />
        <select
          id="dashboard-range"
          value={currentRange}
          onChange={(event) => onRangeChange(event.target.value)}
          className="admin-btn-ghost cursor-pointer appearance-none py-2! pl-9 pr-8"
        >
          {RANGE_OPTIONS.map((value) => (
            <option key={value} value={value}>
              {rangeText[value]}
            </option>
          ))}
        </select>
        <ChevronDown
          size={12}
          strokeWidth={2}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-primary"
          aria-hidden
        />
      </div>

      <button type="button" onClick={download} disabled={busy} className="admin-btn-ghost py-2!">
        {busy ? (
          <Loader2 size={14} className="animate-spin" aria-hidden />
        ) : (
          <Download size={14} strokeWidth={1.7} aria-hidden />
        )}
        {labels.exportReport}
      </button>
    </div>
  );
}
