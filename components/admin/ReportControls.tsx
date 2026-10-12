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
import type { ReactNode } from "react";

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
};

/**
 * A row of joined buttons, one of which is selected. Three short choices
 * read better side by side than as a stacked radio list, and it puts all
 * three filters on one line instead of three columns of unequal height.
 */
function Segmented({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly (readonly [string, string])[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="admin-label mb-1.5">{label}</legend>
      <div className="inline-flex flex-wrap gap-0.5 rounded-lg border border-adm-line bg-adm-text/4 p-0.5">
        {options.map(([optionValue, optionLabel]) => (
          <button
            key={optionValue}
            type="button"
            onClick={() => onChange(optionValue)}
            aria-pressed={value === optionValue}
            className={`rounded-md px-3.5 py-1.5 text-sm transition-colors ${
              value === optionValue
                ? "bg-adm-strong font-semibold text-adm-on-strong shadow-sm"
                : "text-adm-muted hover:text-adm-text"
            }`}
          >
            {optionLabel}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export default function ReportControls({
  labels,
  audience,
  period,
  reportLocale,
  locales,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function set(key: string, value: string) {
    const next = new URLSearchParams(searchParams.toString());
    next.set(key, value);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  const hint = {
    executive: labels.audienceExecutiveHint,
    marketing: labels.audienceMarketingHint,
    engineering: labels.audienceEngineeringHint,
  }[audience];

  return (
    <div className="admin-card print:hidden">
      <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
        <div className="min-w-0">
          <Segmented
            label={labels.audience}
            value={audience}
            onChange={(value) => set("audience", value)}
            options={[
              ["executive", labels.audienceExecutive],
              ["marketing", labels.audienceMarketing],
              ["engineering", labels.audienceEngineering],
            ]}
          />
          {hint && <p className="mt-1.5 text-xs text-adm-muted">{hint}</p>}
        </div>
        <Segmented
          label={labels.period}
          value={period}
          onChange={(value) => set("period", value)}
          options={[
            ["lastMonth", labels.periodLastMonth],
            ["thisMonth", labels.periodThisMonth],
            ["lastQuarter", labels.periodLastQuarter],
          ]}
        />
        <Segmented
          label={labels.language}
          value={reportLocale}
          onChange={(value) => set("reportLocale", value)}
          options={locales.map((value) => [value, value.toUpperCase()] as const)}
        />
      </div>
    </div>
  );
}

/**
 * The exports, as one row of buttons in the page header: the PDF first
 * and solid, because that is what gets sent, and the two data files beside
 * it. They used to be a column of three equal outline buttons at the far
 * end of the filter card, which gave the PDF no more weight than Excel.
 *
 * window.print() rather than a PDF the server renders. A headless browser
 * in the image to draw a page the operating system's own print dialog
 * already produces costs about 400MB and a second rendering path to keep
 * in step with this one.
 */
export function ReportActions({
  labels,
  audience,
  period,
  reportLocale,
  exportBase,
}: {
  labels: Pick<ReportControlLabels, "print" | "csv" | "excel">;
  audience: string;
  period: string;
  reportLocale: string;
  /** Where the CSV and Excel downloads live; the current selection is
   *  appended so the file matches the screen. */
  exportBase: string;
}): ReactNode {
  const query = new URLSearchParams({ audience, period, reportLocale }).toString();
  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <a href={`${exportBase}?${query}&format=csv`} className="admin-btn-ghost py-2!">
        <Download size={15} aria-hidden />
        {labels.csv}
      </a>
      <a href={`${exportBase}?${query}&format=excel`} className="admin-btn-ghost py-2!">
        <FileSpreadsheet size={15} aria-hidden />
        {labels.excel}
      </a>
      <button type="button" onClick={() => window.print()} className="admin-btn py-2!">
        <Printer size={15} aria-hidden />
        {labels.print}
      </button>
    </div>
  );
}
