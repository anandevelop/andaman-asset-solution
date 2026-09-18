"use client";

/**
 * components/admin/UnitsPanel.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The unit list under the site plan (Units.dc.html) — search, the table
 * itself, adding a plot, and the CSV import.
 *
 * One component rather than four because they all act on the same list and
 * share its selection: clicking a row opens that plot in the detail panel
 * above, which is the query string, so the table and the plan stay in
 * agreement without either knowing about the other.
 *
 * Search filters in the browser. The whole project's plots are already on
 * the page (a development is tens of them, not thousands), so a round trip
 * per keystroke would buy nothing and lose the instant response that makes
 * a find-as-you-type box worth having.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertCircle, Check, Loader2, Plus, Search, Upload, X } from "lucide-react";
import {
  importUnitsCsv,
  updateUnitStatus,
  type CsvImportResult,
  type UnitFormState,
} from "@/app/[locale]/admin/(catalog)/projects/[id]/units/actions";
import UnitStatusSelect from "@/components/admin/UnitStatusSelect";
import UnitForm, { type UnitFormValues } from "@/components/admin/UnitForm";

export type UnitTableRow = {
  id: string;
  unitNumber: string;
  typeLabel: string | null;
  livingAreaLabel: string | null;
  landAreaLabel: string | null;
  facingLabel: string | null;
  status: "AVAILABLE" | "RESERVED" | "SOLD";
  releasedForSale: boolean;
  leadId: string | null;
  leadName: string | null;
  lastEditedLabel: string;
  lastEditedBy: string | null;
};

type Props = {
  locale: string;
  projectId: string;
  projectSlug: string;
  rows: UnitTableRow[];
  selectedUnitId: string | null;
  unitTypes: { id: string; name: string }[];
  statusLabels: { AVAILABLE: string; RESERVED: string; SOLD: string };
  saveAction: (state: UnitFormState, formData: FormData) => Promise<UnitFormState>;
  labels: {
    title: string;
    /** "24 plots in phase 1" — already formatted. */
    subtitle: string;
    search: string;
    importCsv: string;
    addUnit: string;
    columnUnit: string;
    columnType: string;
    columnLivingArea: string;
    columnLandArea: string;
    columnFacing: string;
    columnStatus: string;
    columnLead: string;
    columnUpdated: string;
    notReleased: string;
    none: string;
    empty: string;
    noMatches: string;
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
  rows,
  selectedUnitId,
  unitTypes,
  statusLabels,
  saveAction,
  labels,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
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

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) =>
      [row.unitNumber, row.typeLabel, row.facingLabel, row.leadName]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(needle)),
    );
  }, [rows, query]);

  const select = (unitId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("unit", unitId);
    router.replace(`/${locale}/admin/projects/${projectId}/units?${params.toString()}`);
  };

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
          <h2 className="text-sm font-semibold text-primary">{labels.title}</h2>
          <span className="text-xs text-ink-muted">{labels.subtitle}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex items-center">
            <Search size={14} className="absolute left-2.5 text-ink-muted" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={labels.search}
              aria-label={labels.search}
              className="admin-input w-48! py-1.5! pl-8! text-xs"
            />
          </div>

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
        <div className="space-y-3 rounded-xs border border-primary/10 bg-surface-muted/50 p-4">
          <p className="text-sm text-primary">{labels.csvIntro}</p>
          <p className="font-mono text-xs text-ink-muted">{labels.csvColumns}</p>

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
            <p className="flex items-center gap-1.5 text-xs text-red-700">
              <AlertCircle size={13} aria-hidden />
              {labels.csvReasons[importResult.error] ?? labels.csvError}
            </p>
          )}

          {importResult?.ok && importResult.skipped.length === 0 && (
            <p className="flex items-center gap-1.5 text-xs text-emerald-700">
              <Check size={13} aria-hidden />
              {tCsv("created", { count: importResult.created })} ·{" "}
              {tCsv("updated", { count: importResult.updated })}
            </p>
          )}

          {importResult?.ok && importResult.skipped.length > 0 && (
            <div className="space-y-1.5">
              <p className="flex items-center gap-1.5 text-xs font-medium text-red-700">
                <AlertCircle size={13} aria-hidden />
                {labels.csvSkippedTitle} — {labels.csvNothingApplied}
              </p>
              <ul className="space-y-0.5 text-xs text-ink-muted">
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
        <div className="rounded-xs border border-primary/10 bg-surface-muted/50 p-4">
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

      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-muted">{labels.empty}</p>
      ) : filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-muted">{labels.noMatches}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse">
            <thead className="border-b border-primary/10">
              <tr>
                <th className="admin-th">{labels.columnUnit}</th>
                <th className="admin-th">{labels.columnType}</th>
                <th className="admin-th">{labels.columnLivingArea}</th>
                <th className="admin-th">{labels.columnLandArea}</th>
                <th className="admin-th">{labels.columnFacing}</th>
                <th className="admin-th">{labels.columnStatus}</th>
                <th className="admin-th">{labels.columnLead}</th>
                <th className="admin-th">{labels.columnUpdated}</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-primary/5">
              {filtered.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => select(row.id)}
                  className={`cursor-pointer transition-colors ${
                    row.id === selectedUnitId ? "bg-accent/6" : "hover:bg-surface-muted/60"
                  }`}
                >
                  <td className="admin-td font-medium text-primary">
                    {row.unitNumber}
                    {!row.releasedForSale && (
                      <span className="ml-2 rounded-xs border border-dashed border-primary/30 px-1.5 py-0.5 text-[11px] text-ink-muted">
                        {labels.notReleased}
                      </span>
                    )}
                  </td>
                  <td className="admin-td whitespace-nowrap text-ink-muted">{row.typeLabel ?? labels.none}</td>
                  <td className="admin-td whitespace-nowrap text-ink-muted">
                    {row.livingAreaLabel ?? labels.none}
                  </td>
                  <td className="admin-td whitespace-nowrap text-ink-muted">
                    {row.landAreaLabel ?? labels.none}
                  </td>
                  <td className="admin-td whitespace-nowrap text-ink-muted">
                    {row.facingLabel ?? labels.none}
                  </td>

                  {/* The select stops the click here so changing a status
                      does not also re-select the row underneath it. */}
                  <td className="admin-td" onClick={(event) => event.stopPropagation()}>
                    <UnitStatusSelect
                      action={updateUnitStatus.bind(null, locale, projectId, projectSlug, row.id)}
                      status={row.status}
                      labels={statusLabels}
                    />
                  </td>

                  <td className="admin-td" onClick={(event) => event.stopPropagation()}>
                    {row.leadId && row.leadName ? (
                      <Link
                        href={`/${locale}/admin/leads/${row.leadId}`}
                        className="text-sm text-accent-700 hover:text-accent-800"
                      >
                        {row.leadName}
                      </Link>
                    ) : (
                      <span className="text-ink-muted">{labels.none}</span>
                    )}
                  </td>

                  <td className="admin-td max-w-[150px] text-xs text-ink-muted">
                    <span className="block whitespace-nowrap">{row.lastEditedLabel}</span>
                    {row.lastEditedBy && (
                      <span className="block truncate text-ink-muted/80" title={row.lastEditedBy}>
                        {row.lastEditedBy}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
