/**
 * components/admin/report/ReportParts.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The printed reports' building blocks: masthead, figure tiles, section
 * headings, tables, summary lines and the @page footer. The Analytics
 * export and the monthly report on /admin/reports use the same blocks, so
 * the two PDFs come out in the same navy and gold and read as one
 * company's documents.
 *
 * Server components with inline hex colours, for the reason
 * ReportCharts.tsx gives: the admin's dark theme remaps Tailwind's colour
 * tokens, and a PDF must not change colour with the theme of the session
 * that printed it.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { ReactNode } from "react";
import { siteConfig } from "@/config/site";
import { BRAND } from "./ReportCharts";

/** A CSS string literal: the @page footer is written into a <style>. */
const cssString = (text: string) => `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

/**
 * Page size, margins and the running footer (company · note, page n / N)
 * for the printed report. In a <style> rather than globals.css because the
 * footer is translated and @page cannot read text from the DOM. The empty
 * top boxes are there to keep the browser's own date-and-title header out
 * of the way. Whether a browser still prints its own header and footer is
 * down to its "Headers and footers" option, which a page cannot switch
 * off, so the toolbar's hint says to untick it.
 */
export function PrintPageStyle({ footer }: { footer: string }) {
  return (
    <style>{`@media print {
  @page { size: A4; margin: 12mm 12mm 16mm;
    @top-left { content: ""; }
    @top-center { content: ""; }
    @top-right { content: ""; }
    @bottom-left { content: ${cssString(`${siteConfig.legalName} · ${footer}`)}; font: 8pt Roboto, sans-serif; color: ${BRAND.muted}; }
    @bottom-right { content: counter(page) " / " counter(pages); font: 8pt Roboto, sans-serif; color: ${BRAND.muted}; }
  }
  html, body, [data-admin-root], [data-admin-page] { background: #fff !important; }
}`}</style>
  );
}

export function Masthead({
  eyebrow,
  title,
  lines,
  aside,
}: {
  eyebrow: string;
  title: string;
  lines: string[];
  aside?: string;
}) {
  return (
    <header
      className="relative px-10 pb-7 pt-8"
      style={{ background: `linear-gradient(135deg, ${BRAND.navy} 0%, ${BRAND.navyDeep} 100%)` }}
    >
      <div className="flex items-start justify-between gap-6">
        {/* eslint-disable-next-line @next/next/no-img-element -- a print sheet, not a page to optimise */}
        <img src="/logo-white.png" alt={siteConfig.name} width={895} height={120} className="h-6 w-auto" />
        <p className="text-right text-[9.5px] font-medium uppercase tracking-[0.28em]" style={{ color: BRAND.gold }}>
          {eyebrow}
        </p>
      </div>
      <h1 className="mt-8 text-[26px] font-light leading-tight" style={{ color: "#ffffff" }}>
        {title}
      </h1>
      {lines.map((line, i) => (
        <p
          key={i}
          className={i === 0 ? "mt-2 text-[12px]" : "mt-1 text-[10px]"}
          style={{ color: i === 0 ? "rgba(255,255,255,0.78)" : "rgba(255,255,255,0.58)" }}
        >
          {line}
        </p>
      ))}
      {aside && (
        <p className="absolute bottom-6 right-10 text-right text-[10px]" style={{ color: "rgba(255,255,255,0.58)" }}>
          {aside}
        </p>
      )}
      <span className="absolute inset-x-0 bottom-0 h-[3px]" style={{ background: BRAND.gold }} aria-hidden />
    </header>
  );
}

/** The sheet the masthead and sections sit on: A4 wide, flat in print. */
export function Sheet({ children }: { children: ReactNode }) {
  return (
    <article
      className="report-sheet mx-auto max-w-[210mm] overflow-hidden bg-white shadow-card print:max-w-none print:shadow-none"
      style={{ color: BRAND.ink }}
    >
      {children}
    </article>
  );
}

/**
 * A headline figure. `change` is the percentage against the previous
 * period, drawn as ▲/▼ in green or red. `goodWhenDown` flips the colour for
 * a figure where less is better.
 */
export function KpiTile({
  label,
  value,
  hint,
  change,
  goodWhenDown = false,
}: {
  label: string;
  value: string;
  hint?: string;
  change?: number | null;
  goodWhenDown?: boolean;
}) {
  const up = (change ?? 0) > 0;
  const good = change === 0 || change == null ? null : up !== goodWhenDown;
  return (
    <div className="rounded-sm border-l-[3px] px-4 py-3" style={{ borderColor: BRAND.gold, background: BRAND.wash }}>
      <p className="text-[9px] font-semibold uppercase tracking-[0.14em]" style={{ color: BRAND.muted }}>
        {label}
      </p>
      <p className="mt-1 flex items-baseline gap-2">
        <span className="text-[24px] font-light tabular-nums leading-none" style={{ color: BRAND.navy }}>
          {value}
        </span>
        {change != null && (
          <span
            className="text-[10px] font-semibold tabular-nums"
            style={{ color: good === null ? BRAND.muted : good ? "#067647" : "#b42318" }}
          >
            {change > 0 ? "▲" : change < 0 ? "▼" : "•"} {Math.abs(change)}%
          </span>
        )}
      </p>
      {hint && (
        <p className="mt-1.5 text-[9.5px]" style={{ color: BRAND.muted }}>
          {hint}
        </p>
      )}
    </div>
  );
}

export function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="mt-8 break-inside-avoid">
      <div className="mb-3 flex items-baseline gap-3 border-b pb-1.5" style={{ borderColor: BRAND.line }}>
        <span className="h-3 w-1 self-center rounded-sm" style={{ background: BRAND.gold }} aria-hidden />
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em]" style={{ color: BRAND.navy }}>
          {title}
        </h2>
        {note && (
          <p className="ml-auto text-right text-[10px]" style={{ color: BRAND.muted }}>
            {note}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

export function SubTitle({ children }: { children: ReactNode }) {
  return (
    <p className="mb-2 text-[11px] font-semibold" style={{ color: BRAND.navy }}>
      {children}
    </p>
  );
}

export function Table({
  head,
  rows,
  align,
}: {
  head: string[];
  rows: ReactNode[][];
  align?: ("left" | "right")[];
}) {
  return (
    <table className="w-full border-collapse text-[11px]" style={{ color: BRAND.ink }}>
      <thead>
        <tr>
          {head.map((cell, i) => (
            <th
              key={i}
              className="border-b py-1.5 text-[9.5px] font-semibold uppercase tracking-wider"
              style={{ borderColor: BRAND.line, color: BRAND.muted, textAlign: align?.[i] ?? "left" }}
            >
              {cell}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, r) => (
          <tr key={r}>
            {row.map((cell, i) => (
              <td
                key={i}
                className="border-b py-1.5 tabular-nums"
                style={{ borderColor: BRAND.line, textAlign: align?.[i] ?? "left" }}
              >
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** A chart's figures in words, for a reader who will not measure bars. */
export function Summary({ items }: { items: { label: string; value: string }[] }) {
  return (
    <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-1 border-t pt-2.5 text-[10.5px]" style={{ borderColor: BRAND.line }}>
      {items.map((item) => (
        <div key={item.label} className="flex items-baseline gap-2">
          <dt style={{ color: BRAND.muted }}>{item.label}</dt>
          <dd className="font-semibold tabular-nums" style={{ color: BRAND.navy }}>
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function Empty({ text }: { text: string }) {
  return (
    <p className="rounded-sm px-4 py-6 text-center text-[11px]" style={{ background: BRAND.wash, color: BRAND.muted }}>
      {text}
    </p>
  );
}

export function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <p className="mb-2 flex gap-4 text-[10px]" style={{ color: BRAND.muted }}>
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-[2px]" style={{ background: item.color }} aria-hidden />
          {item.label}
        </span>
      ))}
    </p>
  );
}

const RATING_STYLE = {
  good: { color: "#067647", background: "#ecfdf3" },
  needsImprovement: { color: "#b54708", background: "#fffaeb" },
  poor: { color: "#b42318", background: "#fef3f2" },
} as const;

/** A Core Web Vitals rating as a coloured chip. */
export function RatingChip({ rating, label }: { rating: keyof typeof RATING_STYLE; label: string }) {
  return (
    <span className="rounded-sm px-1.5 py-px text-[9px] font-semibold" style={RATING_STYLE[rating]}>
      {label}
    </span>
  );
}
