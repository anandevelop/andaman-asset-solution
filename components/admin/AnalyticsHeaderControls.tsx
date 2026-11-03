"use client";

/**
 * The /admin/analytics header: 24 ชม. · 7 วัน · 28 วัน · 90 วัน, the
 * "เทียบช่วงก่อนหน้า" switch, and ส่งออก (the printable report for the
 * nearest range it supports). Both live in the URL (?range=&compare=1), so
 * a link to the screen is a link to the same view.
 */

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Download } from "lucide-react";
import Link from "next/link";

export const ANALYTICS_RANGES = ["1", "7", "28", "90"] as const;
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];

export default function AnalyticsHeaderControls({
  locale,
  range,
  compare,
  labels,
}: {
  locale: string;
  range: AnalyticsRange;
  compare: boolean;
  labels: { ranges: Record<AnalyticsRange, string>; compare: string; export: string };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const go = (patch: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) params.delete(key);
      else params.set(key, value);
    }
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  // The printable report takes 7 / 30 / 90 / 365.
  const reportRange = range === "90" ? "90" : range === "28" ? "30" : "7";

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex rounded-full border border-adm-line bg-adm-solid p-1">
        {ANALYTICS_RANGES.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => go({ range: value })}
            aria-pressed={range === value}
            className={`rounded-full px-3.5 py-1.5 text-sm transition-colors ${
              range === value ? "bg-white font-semibold text-adm-text shadow-xs" : "text-adm-muted hover:text-adm-text"
            }`}
          >
            {labels.ranges[value]}
          </button>
        ))}
      </div>

      <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-adm-muted">
        <button
          type="button"
          role="switch"
          aria-checked={compare}
          onClick={() => go({ compare: compare ? null : "1" })}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${compare ? "bg-adm-fill" : "bg-adm-line-strong"}`}
        >
          <span
            className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform ${compare ? "translate-x-5.5" : "translate-x-0.5"}`}
          />
        </button>
        {labels.compare}
      </label>

      <Link href={`/${locale}/admin/analytics/report?range=${reportRange}`} className="admin-btn-ghost rounded-full! px-4">
        <Download size={14} aria-hidden />
        {labels.export}
      </Link>
    </div>
  );
}
