"use client";

/**
 * components/admin/SpecialFeaturesEditor.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Repeatable add/edit/remove rows for Project.specialFeatures (Json).
 *
 * FormData has no native array/object support, so this owns its own state
 * and serializes to one hidden JSON input on every change — the server
 * action (app/[locale]/admin/projects/actions.ts) reads that single field
 * and validates it with specialFeaturesJson in lib/validations.ts. This is
 * the same trade-off `facilities`/`gallery` make with newline-delimited
 * text, just for a shape a plain textarea cannot represent.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";

export type SpecialFeatureRow = {
  titleEn: string;
  titleTh: string;
  detailEn: string;
  detailTh: string;
};

const EMPTY_ROW: SpecialFeatureRow = { titleEn: "", titleTh: "", detailEn: "", detailTh: "" };

function parseDefault(json: string): SpecialFeatureRow[] {
  if (!json.trim()) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((row) => ({
      titleEn: typeof row?.titleEn === "string" ? row.titleEn : "",
      titleTh: typeof row?.titleTh === "string" ? row.titleTh : "",
      detailEn: typeof row?.detailEn === "string" ? row.detailEn : "",
      detailTh: typeof row?.detailTh === "string" ? row.detailTh : "",
    }));
  } catch {
    return [];
  }
}

/** Rows with a blank title and blank detail are dropped before serializing
 *  — an admin who clicked "Add" and then changed their mind should not
 *  submit an empty feature. */
function serialize(rows: SpecialFeatureRow[]): string {
  const meaningful = rows.filter((r) => r.titleEn.trim() || r.detailEn.trim());
  return JSON.stringify(meaningful);
}

export default function SpecialFeaturesEditor({
  name,
  defaultValue,
  label,
  hint,
  addLabel,
  removeLabel,
  titleEnPlaceholder,
  titleThPlaceholder,
  detailEnPlaceholder,
  detailThPlaceholder,
}: {
  name: string;
  defaultValue: string;
  label: string;
  hint?: string;
  addLabel: string;
  removeLabel: string;
  titleEnPlaceholder: string;
  titleThPlaceholder: string;
  detailEnPlaceholder: string;
  detailThPlaceholder: string;
}) {
  const [rows, setRows] = useState<SpecialFeatureRow[]>(() => parseDefault(defaultValue));

  const update = (index: number, patch: Partial<SpecialFeatureRow>) => {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const remove = (index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const add = () => {
    setRows((prev) => [...prev, { ...EMPTY_ROW }]);
  };

  return (
    <div>
      <span className="admin-label">{label}</span>
      {hint && <p className="admin-hint">{hint}</p>}

      <input type="hidden" name={name} value={serialize(rows)} readOnly />

      <div className="mt-3 space-y-4">
        {rows.map((row, index) => (
          <div
            key={index}
            className="grid gap-3 border border-primary/10 bg-primary-900/[0.02] p-4 sm:grid-cols-2"
          >
            <input
              value={row.titleEn}
              onChange={(e) => update(index, { titleEn: e.target.value })}
              placeholder={titleEnPlaceholder}
              className="admin-input"
            />
            <input
              value={row.titleTh}
              onChange={(e) => update(index, { titleTh: e.target.value })}
              placeholder={titleThPlaceholder}
              className="admin-input"
            />
            <textarea
              value={row.detailEn}
              onChange={(e) => update(index, { detailEn: e.target.value })}
              placeholder={detailEnPlaceholder}
              rows={2}
              className="admin-textarea sm:col-span-1"
            />
            <textarea
              value={row.detailTh}
              onChange={(e) => update(index, { detailTh: e.target.value })}
              placeholder={detailThPlaceholder}
              rows={2}
              className="admin-textarea sm:col-span-1"
            />
            <div className="sm:col-span-2">
              <button
                type="button"
                onClick={() => remove(index)}
                className="inline-flex items-center gap-1.5 text-xs text-red-700 hover:text-red-800"
              >
                <Trash2 size={13} aria-hidden />
                {removeLabel}
              </button>
            </div>
          </div>
        ))}
      </div>

      <button type="button" onClick={add} className="admin-btn-ghost mt-3">
        <Plus size={15} aria-hidden />
        {addLabel}
      </button>
    </div>
  );
}
