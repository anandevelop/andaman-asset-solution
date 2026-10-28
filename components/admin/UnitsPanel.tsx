"use client";

/**
 * components/admin/UnitsPanel.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The units tab's main card: its title and toolbar — search, CSV export,
 * CSV import, adding a plot — around the tile board, which the page passes
 * in as children.
 *
 * This used to also hold a table of every plot under the tiles. The tiles
 * now carry what the table showed (status, land area, facing, the lead a
 * plot is held for; type and living area in each group's heading), so the
 * table was the same list twice and is gone. Clicking a tile opens the plot
 * in the detail panel beside it, as a table row did.
 *
 * Search filters the tiles in the browser (UnitSearchContext → the board).
 * The whole project's plots are already on the page (a development is tens
 * of them, not thousands), so a round trip per keystroke would buy nothing.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertCircle, Check, Loader2, Plus, Search, Upload, X } from "lucide-react";
import {
  importUnitsCsv,
  type CsvImportResult,
  type UnitFormState,
} from "@/app/[locale]/admin/(catalog)/projects/[id]/units/actions";
import UnitForm from "@/components/admin/UnitForm";
import UnitExportButton from "@/components/admin/UnitExportButton";
import { UnitSearchContext } from "@/components/admin/unit-search-context";

type Props = {
  locale: string;
  projectId: string;
  projectSlug: string;
  /** The tile board (and the phase switcher above it). */
  children: ReactNode;
  unitTypes: { id: string; name: string }[];
  statusLabels: { AVAILABLE: string; RESERVED: string; SOLD: string; TRANSFERRED: string };
  saveAction: (state: UnitFormState, formData: FormData) => Promise<UnitFormState>;
  labels: {
    title: string;
    /** "24 plots in phase 1" — already formatted. */
    subtitle: string;
    search: string;
    importCsv: string;
    exportCsv: string;
    exportFailed: string;
    exportRateLimited: string;
    exportTruncated: string;
    addUnit: string;
    cancel: string;
    csvIntro: string;
    csvColumns: string;
    csvChoose: string;
    csvSkippedTitle: string;
    csvNothingApplied: string;
    csvError: string;
    csvReasons: Record<string, string>;
    form: React.ComponentProps<typeof UnitForm>["labels"];
  };
};

export default function UnitsPanel({
  locale,
  projectId,
  projectSlug,
  children,
  unitTypes,
  statusLabels,
  saveAction,
  labels,
}: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  // The two import counts are the only strings here whose numbers are not
  // known until the server answers, so they are pluralised on the client
  // rather than pre-formatted with the rest of the labels.
  const tCsv = useTranslations("admin.units.csv");

  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<CsvImportResult | null>(null);
  const [pending, startTransition] = useTransition();

  const runImport = async (file: File) => {
    setImportResult(null);
    const text = await file.text();

    startTransition(async () => {
      const result = await importUnitsCsv(locale, projectId, projectSlug, text);
      setImportResult(result);
      if (result.ok && (result.created > 0 || result.updated > 0)) router.refresh();
    });
  };

  return (
    <section className="admin-card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="text-sm font-semibold text-adm-text">{labels.title}</h2>
          <span className="text-xs text-adm-muted">{labels.subtitle}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex items-center">
            <Search size={14} className="absolute left-2.5 text-adm-muted" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={labels.search}
              aria-label={labels.search}
              className="admin-input w-48! py-1.5! pl-8! text-xs"
            />
          </div>

          <UnitExportButton
            projectId={projectId}
            label={labels.exportCsv}
            failedLabel={labels.exportFailed}
            rateLimitedLabel={labels.exportRateLimited}
            truncatedLabel={labels.exportTruncated}
          />

          <button
            type="button"
            onClick={() => {
              setImporting((value) => !value);
              setImportResult(null);
            }}
            className="admin-btn-ghost py-1.5! text-xs"
          >
            <Upload size={13} aria-hidden />
            {labels.importCsv}
          </button>

          <button
            type="button"
            onClick={() => setAdding((value) => !value)}
            className="admin-btn-ghost py-1.5! text-xs"
          >
            {adding ? <X size={13} aria-hidden /> : <Plus size={13} aria-hidden />}
            {adding ? labels.cancel : labels.addUnit}
          </button>
        </div>
      </div>

      {importing && (
        <div className="space-y-3 rounded-xs border border-adm-line bg-adm-text/4 p-4">
          <p className="text-sm text-adm-text">{labels.csvIntro}</p>
          <p className="font-mono text-xs text-adm-muted">{labels.csvColumns}</p>

          <div className="flex items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void runImport(file);
              }}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={pending}
              className="admin-btn py-2! text-xs"
            >
              {pending ? (
                <Loader2 size={13} className="animate-spin" aria-hidden />
              ) : (
                <Upload size={13} aria-hidden />
              )}
              {labels.csvChoose}
            </button>
          </div>

          {importResult && !importResult.ok && (
            <p className="flex items-center gap-1.5 text-xs text-adm-danger">
              <AlertCircle size={13} aria-hidden />
              {labels.csvReasons[importResult.error] ?? labels.csvError}
            </p>
          )}

          {importResult?.ok && importResult.skipped.length === 0 && (
            <p className="flex items-center gap-1.5 text-xs text-adm-success">
              <Check size={13} aria-hidden />
              {tCsv("created", { count: importResult.created })} ·{" "}
              {tCsv("updated", { count: importResult.updated })}
            </p>
          )}

          {importResult?.ok && importResult.skipped.length > 0 && (
            <div className="space-y-1.5">
              <p className="flex items-center gap-1.5 text-xs font-medium text-adm-danger">
                <AlertCircle size={13} aria-hidden />
                {labels.csvSkippedTitle} — {labels.csvNothingApplied}
              </p>
              <ul className="space-y-0.5 text-xs text-adm-muted">
                {importResult.skipped.slice(0, 20).map((row) => (
                  <li key={`${row.line}-${row.unitNumber}`}>
                    <span className="font-mono">#{row.line}</span> {row.unitNumber} —{" "}
                    {labels.csvReasons[row.reason] ?? row.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {adding && (
        <div className="rounded-xs border border-adm-line bg-adm-text/4 p-4">
          <UnitForm
            action={saveAction}
            unit={null}
            unitTypes={unitTypes}
            statusLabels={statusLabels}
            onDone={() => setAdding(false)}
            labels={labels.form}
          />
        </div>
      )}

      <UnitSearchContext.Provider value={query}>{children}</UnitSearchContext.Provider>
    </section>
  );
}
