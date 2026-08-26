"use client";

/**
 * components/admin/AttractionItemsEditor.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Repeatable rows for the places inside one NearbyAttractionCategory
 * (name, distance, drive time). Same trade-off as SpecialFeaturesEditor —
 * one hidden JSON input, validated server-side by
 * nearbyAttractionItemSchema in lib/validations.ts.
 *
 * Each row's `id` (the db id, blank for a row the admin just added) rides
 * along in the serialized JSON so the server action can update existing
 * items in place — preserving their other-locale translations — instead
 * of deleting and recreating every item on every save. `name` reflects
 * whichever locale the page is currently editing (see the `lang` prop the
 * parent AttractionCategoryForm threads through as `namePlaceholder`).
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";

export type AttractionItemRow = {
  id: string;
  name: string;
  distanceKm: string;
  durationMin: string;
};

const EMPTY_ROW: AttractionItemRow = { id: "", name: "", distanceKm: "", durationMin: "" };

function parseDefault(json: string): AttractionItemRow[] {
  if (!json.trim()) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((row) => ({
      id: typeof row?.id === "string" ? row.id : "",
      name: typeof row?.name === "string" ? row.name : "",
      distanceKm: row?.distanceKm !== undefined && row?.distanceKm !== null ? String(row.distanceKm) : "",
      durationMin: row?.durationMin !== undefined && row?.durationMin !== null ? String(row.durationMin) : "",
    }));
  } catch {
    return [];
  }
}

/** Rows with no name are dropped before serializing. */
function serialize(rows: AttractionItemRow[]): string {
  return JSON.stringify(rows.filter((r) => r.name.trim()));
}

export default function AttractionItemsEditor({
  name,
  defaultValue,
  addLabel,
  removeLabel,
  namePlaceholder,
  distanceLabel,
  durationLabel,
}: {
  name: string;
  defaultValue: string;
  addLabel: string;
  removeLabel: string;
  namePlaceholder: string;
  distanceLabel: string;
  durationLabel: string;
}) {
  const [rows, setRows] = useState<AttractionItemRow[]>(() => parseDefault(defaultValue));

  const update = (index: number, patch: Partial<AttractionItemRow>) => {
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
      <input type="hidden" name={name} value={serialize(rows)} readOnly />

      <div className="space-y-3">
        {rows.map((row, index) => (
          <div
            key={index}
            className="grid grid-cols-1 gap-2 border border-primary/10 bg-primary-900/[0.02] p-3 sm:grid-cols-[1fr_90px_90px_auto] sm:items-center"
          >
            <input
              value={row.name}
              onChange={(e) => update(index, { name: e.target.value })}
              placeholder={namePlaceholder}
              className="admin-input"
            />
            <input
              value={row.distanceKm}
              onChange={(e) => update(index, { distanceKm: e.target.value })}
              type="number"
              min="0"
              step="0.1"
              placeholder={distanceLabel}
              aria-label={distanceLabel}
              className="admin-input"
            />
            <input
              value={row.durationMin}
              onChange={(e) => update(index, { durationMin: e.target.value })}
              type="number"
              min="0"
              step="1"
              placeholder={durationLabel}
              aria-label={durationLabel}
              className="admin-input"
            />
            <button
              type="button"
              onClick={() => remove(index)}
              aria-label={removeLabel}
              className="inline-flex items-center justify-center gap-1.5 text-xs text-red-700 hover:text-red-800"
            >
              <Trash2 size={14} aria-hidden />
            </button>
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
