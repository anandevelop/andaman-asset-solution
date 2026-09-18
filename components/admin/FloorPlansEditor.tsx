"use client";

/**
 * components/admin/FloorPlansEditor.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Repeatable floor-plan rows (a photo + a "1st Floor"-style label) nested
 * inside UnitTypeForm — same "one hidden field, diffed server-side" trade-
 * off as AttractionItemsEditor, with one wrinkle: a floor plan's photo is
 * a real upload, not a plain text value, so it can't just ride along
 * inside the same JSON blob the way AttractionItemsEditor's distanceKm/
 * durationMin do.
 *
 * Split in two instead: this component's own hidden `<input name="floorPlans">`
 * carries only the row *list* — each row's stable `key` (a database id for
 * an existing floor plan, or a client-generated `new-…` string for one the
 * admin just added), its database `id` (blank for a new row), and its
 * `floorName` text. The photo itself is a full ImageUploader per row,
 * uncontrolled exactly like every other image field in this codebase —
 * see that component's own file comment — submitted under its own field
 * name, `floorPlanImage__{key}`. The server action (saveUnitType in
 * ../../../app/[locale]/admin/projects/[id]/unit-types/actions.ts) reads
 * the row list, then looks up each row's photo by that same key to
 * recombine the two before validating.
 *
 * `key` rather than `id` names each ImageUploader deliberately: `id` is
 * blank for a brand new row, and two new rows would otherwise collide on
 * the same field name (`floorPlanImage__`) — `key` is unique and stable
 * for the row's entire lifetime in this form, new or existing.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import ImageUploader from "@/components/admin/ImageUploader";

export type FloorPlanRow = {
  key: string;
  id: string;
  floorName: string;
  imageUrl: string;
};

type Props = {
  name: string;
  slug?: string;
  initialRows: { id: string; floorName: string; imageUrl: string }[];
  labels: {
    floorName: string;
    floorNamePlaceholder: string;
    image: string;
    add: string;
    remove: string;
    empty: string;
  };
};

let counter = 0;
/** Stable, unique, and never collides with a real database cuid — that's
 *  all a client-only row key needs to be. */
function newRowKey(): string {
  counter += 1;
  return `new-${Date.now()}-${counter}`;
}

export default function FloorPlansEditor({ name, slug, initialRows, labels }: Props) {
  const [rows, setRows] = useState<FloorPlanRow[]>(() =>
    initialRows.map((row) => ({ key: row.id, id: row.id, floorName: row.floorName, imageUrl: row.imageUrl })),
  );

  const serialized = JSON.stringify(
    rows.map(({ key, id, floorName }) => ({ key, id, floorName })),
  );

  const addRow = () =>
    setRows((current) => [...current, { key: newRowKey(), id: "", floorName: "", imageUrl: "" }]);

  const removeRow = (key: string) =>
    setRows((current) => current.filter((row) => row.key !== key));

  const updateFloorName = (key: string, floorName: string) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, floorName } : row)));

  return (
    <div>
      <input type="hidden" name={name} value={serialized} readOnly />

      {rows.length === 0 && <p className="text-sm text-ink-muted">{labels.empty}</p>}

      <div className="space-y-4">
        {rows.map((row) => (
          <div
            key={row.key}
            className="grid gap-4 border border-primary/10 bg-primary-900/2 p-4 sm:grid-cols-[1fr_auto]"
          >
            <div className="space-y-3">
              <div>
                <label className="admin-label">{labels.floorName}</label>
                <input
                  value={row.floorName}
                  onChange={(e) => updateFloorName(row.key, e.target.value)}
                  placeholder={labels.floorNamePlaceholder}
                  className="admin-input max-w-xs"
                />
              </div>

              <ImageUploader
                name={`floorPlanImage__${row.key}`}
                prefix="unit-types"
                slug={slug}
                defaultValue={row.imageUrl}
                label={labels.image}
              />
            </div>

            <button
              type="button"
              onClick={() => removeRow(row.key)}
              aria-label={labels.remove}
              className="inline-flex h-fit items-center gap-1.5 text-xs text-red-700 hover:text-red-800"
            >
              <Trash2 size={14} aria-hidden />
              {labels.remove}
            </button>
          </div>
        ))}
      </div>

      <button type="button" onClick={addRow} className="admin-btn-ghost mt-4">
        <Plus size={15} aria-hidden />
        {labels.add}
      </button>
    </div>
  );
}
