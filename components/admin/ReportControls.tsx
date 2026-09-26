"use client";

/**
 * components/admin/ReportControls.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Who the report is for, what it covers, and what language it is in.
 *
 * URL-DRIVEN, NOT COMPONENT STATE
 *
 * Every choice is a query parameter, so the report a person is looking at
 * has an address. That matters more here than on the other admin screens:
 * this is the one page whose output gets sent to somebody else, and "the
 * August executive report in Thai" needs to be a link a colleague can open
 * and see the same thing — including after a print dialog, a reload, or a
 * week later.
 *
 * It also means the export buttons and the print view need no state of
 * their own: they read the same parameters the page did.
 *
 * The print and export controls sit here beside the selectors because they
 * act on exactly this selection, the way DashboardControls keeps its range
 * picker and its CSV button together.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Download, FileSpreadsheet, Printer } from "lucide-react";

export type ReportControlLabels = {
  audience: string;
  audienceExecutive: string;
  audienceExecutiveHint: string;
  audienceMarketing: string;
  audienceMarketingHint: string;
  audienceEngineering: string;
  audienceEngineeringHint: string;
  period: string;
  periodLastMonth: string;
  periodThisMonth: string;
  periodLastQuarter: string;
  language: string;
  print: string;
  csv: string;
  excel: string;
};

type Props = {
  labels: ReportControlLabels;
  audience: string;
  period: string;
  reportLocale: string;
  locales: readonly string[];
  /** Where the CSV and Excel downloads live, already carrying nothing —
   *  the current selection is appended here so the file matches the
   *  screen. */
  exportBase: string;
};

export default function ReportControls({
  labels,
  audience,
  period,
  reportLocale,
  locales,
  exportBase,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function set(key: string, value: string) {
    const next = new URLSearchParams(searchParams.toString());
    next.set(key, value);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  const query = new URLSearchParams({
    audience,
    period,
    reportLocale,
  }).toString();

  return (
    <div className="admin-card print:hidden">
      <div className="grid gap-5 lg:grid-cols-3">
        <fieldset>
          <legend className="admin-label">{labels.audience}</legend>
          <div className="mt-2 space-y-1.5">
            {(
              [
                [
                  "executive",
                  labels.audienceExecutive,
                  labels.audienceExecutiveHint,
                ],
                [
                  "marketing",
                  labels.audienceMarketing,
                  labels.audienceMarketingHint,
                ],
                [
                  "engineering",
                  labels.audienceEngineering,
                  labels.audienceEngineeringHint,
                ],
              ] as const
            ).map(([value, label, hint]) => (
              <label
                key={value}
                className={`flex cursor-pointer items-start gap-2.5 rounded-xs border px-3 py-2 text-sm transition-colors ${
                  audience === value
                    ? "border-primary/30 bg-primary/5 text-ink"
                    : "border-primary/10 text-ink-muted hover:border-primary/20"
                }`}
              >
                <input
                  type="radio"
                  name="audience"
                  value={value}
                  checked={audience === value}
                  onChange={() => set("audience", value)}
                  className="mt-0.5"
                />
                <span>
                  <span className="block font-medium">{label}</span>
                  <span className="block text-xs text-ink-muted">{hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="admin-label">{labels.period}</legend>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(
              [
                ["lastMonth", labels.periodLastMonth],
                ["thisMonth", labels.periodThisMonth],
                ["lastQuarter", labels.periodLastQuarter],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => set("period", value)}
                aria-pressed={period === value}
                className={`rounded-xs px-3 py-2 text-sm transition-colors ${
                  period === value
                    ? "bg-primary font-semibold text-white"
                    : "border border-primary/10 text-ink-muted hover:text-primary"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <p className="admin-label mt-5">{labels.language}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {locales.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => set("reportLocale", value)}
                aria-pressed={reportLocale === value}
                className={`rounded-xs px-3 py-2 text-sm uppercase transition-colors ${
                  reportLocale === value
                    ? "bg-primary font-semibold text-white"
                    : "border border-primary/10 text-ink-muted hover:text-primary"
                }`}
              >
                {value}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-col gap-2 lg:items-end lg:justify-start">
          {/*
            window.print() rather than a PDF the server renders. A headless
            browser in the image to draw a page the operating system's own
            print dialog already produces costs about 400MB and a second
            rendering path to keep in step with this one — see the plan's
            phase 6 note. If a PDF ever has to be *attached* to the
            scheduled email, that can be added without touching this page.
          */}
          <button
            type="button"
            onClick={() => window.print()}
            className="admin-btn w-full lg:w-auto"
          >
            <Printer size={15} aria-hidden />
            {labels.print}
          </button>

          <a
            href={`${exportBase}?${query}&format=csv`}
            className="admin-btn-ghost w-full lg:w-auto"
          >
            <Download size={15} aria-hidden />
            {labels.csv}
          </a>

          <a
            href={`${exportBase}?${query}&format=excel`}
            className="admin-btn-ghost w-full lg:w-auto"
          >
            <FileSpreadsheet size={15} aria-hidden />
            {labels.excel}
          </a>
        </div>
      </div>
    </div>
  );
}
