"use client";

/**
 * components/admin/UnitForm.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Create or edit one plot — the fields behind "เพิ่มยูนิต" on the units
 * list and "แก้ไขรายละเอียด" in the detail panel. One component for both,
 * because the two differ only in whether `unit` is null.
 *
 * useActionState/useFormStatus like every other form in this admin (see
 * ProjectForm's header for why not react-hook-form): the payload is a
 * flat set of scalars, and the server action is already the validation
 * boundary, so a client-side schema would be the same rules written
 * twice.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, Check, Loader2 } from "lucide-react";
import type { UnitFormState } from "@/app/[locale]/admin/(catalog)/projects/[id]/units/actions";

export type UnitFormValues = {
  id: string;
  unitNumber: string;
  unitTypeId: string | null;
  status: "AVAILABLE" | "RESERVED" | "SOLD";
  landAreaSqm: number | null;
  facing: string | null;
  viewLabel: string | null;
  phase: number | null;
  releasedForSale: boolean;
  priceTHB: number | null;
  adminNotes: string | null;
};

type Props = {
  action: (state: UnitFormState, formData: FormData) => Promise<UnitFormState>;
  /** Null when creating. */
  unit: UnitFormValues | null;
  unitTypes: { id: string; name: string }[];
  statusLabels: { AVAILABLE: string; RESERVED: string; SOLD: string };
  onDone?: () => void;
  labels: {
    unitNumber: string;
    unitType: string;
    unitTypeNone: string;
    status: string;
    phase: string;
    phaseHint: string;
    released: string;
    releasedHint: string;
    landArea: string;
    facing: string;
    view: string;
    price: string;
    priceHint: string;
    adminNotes: string;
    save: string;
    cancel: string;
    saved: string;
    error: string;
    duplicate: string;
  };
};

const INITIAL: UnitFormState = { ok: false };

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} className="admin-btn py-2! text-sm">
      {pending && <Loader2 size={14} className="animate-spin" aria-hidden />}
      {label}
    </button>
  );
}

export default function UnitForm({
  action,
  unit,
  unitTypes,
  statusLabels,
  onDone,
  labels,
}: Props) {
  const [state, formAction] = useActionState(action, INITIAL);

  // The server reports a taken unit number as a field error rather than a
  // failed save, since it names something the person can fix.
  const numberError =
    state.fields?.unitNumber === "DUPLICATE" ? labels.duplicate : state.fields?.unitNumber;

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="admin-label" htmlFor="unit-number">
            {labels.unitNumber}
          </label>
          <input
            id="unit-number"
            name="unitNumber"
            defaultValue={unit?.unitNumber ?? ""}
            required
            maxLength={20}
            className="admin-input"
          />
          {numberError && (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-red-700">
              <AlertCircle size={12} aria-hidden />
              {numberError}
            </p>
          )}
        </div>

        <div>
          <label className="admin-label" htmlFor="unit-type">
            {labels.unitType}
          </label>
          <select
            id="unit-type"
            name="unitTypeId"
            defaultValue={unit?.unitTypeId ?? ""}
            className="admin-input"
          >
            <option value="">{labels.unitTypeNone}</option>
            {unitTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="admin-label" htmlFor="unit-status">
            {labels.status}
          </label>
          <select
            id="unit-status"
            name="status"
            defaultValue={unit?.status ?? "AVAILABLE"}
            className="admin-input"
          >
            <option value="AVAILABLE">{statusLabels.AVAILABLE}</option>
            <option value="RESERVED">{statusLabels.RESERVED}</option>
            <option value="SOLD">{statusLabels.SOLD}</option>
          </select>
        </div>

        <div>
          <label className="admin-label" htmlFor="unit-phase">
            {labels.phase}
          </label>
          <input
            id="unit-phase"
            name="phase"
            type="number"
            min={1}
            max={99}
            defaultValue={unit?.phase ?? ""}
            className="admin-input"
          />
          <p className="admin-hint">{labels.phaseHint}</p>
        </div>

        <div>
          <label className="admin-label" htmlFor="unit-land">
            {labels.landArea}
          </label>
          <input
            id="unit-land"
            name="landAreaSqm"
            type="number"
            step="0.01"
            min={0}
            defaultValue={unit?.landAreaSqm ?? ""}
            className="admin-input"
          />
        </div>

        <div>
          <label className="admin-label" htmlFor="unit-price">
            {labels.price}
          </label>
          <input
            id="unit-price"
            name="priceTHB"
            type="number"
            step="1"
            min={0}
            defaultValue={unit?.priceTHB ?? ""}
            className="admin-input"
          />
          <p className="admin-hint">{labels.priceHint}</p>
        </div>

        <div>
          <label className="admin-label" htmlFor="unit-facing">
            {labels.facing}
          </label>
          <input
            id="unit-facing"
            name="facing"
            defaultValue={unit?.facing ?? ""}
            maxLength={60}
            className="admin-input"
          />
        </div>

        <div>
          <label className="admin-label" htmlFor="unit-view">
            {labels.view}
          </label>
          <input
            id="unit-view"
            name="viewLabel"
            defaultValue={unit?.viewLabel ?? ""}
            maxLength={60}
            className="admin-input"
          />
        </div>
      </div>

      <div>
        <label className="flex items-center gap-2 text-sm text-primary">
          <input
            type="checkbox"
            name="releasedForSale"
            defaultChecked={unit?.releasedForSale ?? true}
            className="h-4 w-4 rounded-xs border-primary/30 text-primary focus:ring-primary/30"
          />
          {labels.released}
        </label>
        <p className="admin-hint">{labels.releasedHint}</p>
      </div>

      <div>
        <label className="admin-label" htmlFor="unit-notes">
          {labels.adminNotes}
        </label>
        <textarea
          id="unit-notes"
          name="adminNotes"
          rows={2}
          defaultValue={unit?.adminNotes ?? ""}
          maxLength={2000}
          className="admin-textarea min-h-0!"
        />
      </div>

      {/* sortOrder is not exposed: plot order follows the unit number in
          every project so far, and the site plan is where position is
          actually managed. The schema keeps the column; the form does not
          need to make someone fill it in. */}
      <input type="hidden" name="sortOrder" value="0" />

      <div className="flex items-center gap-3">
        <SubmitButton label={labels.save} />

        {onDone && (
          <button type="button" onClick={onDone} className="text-sm text-ink-muted hover:text-primary">
            {labels.cancel}
          </button>
        )}

        {state.ok && (
          <span className="flex items-center gap-1.5 text-xs text-emerald-700">
            <Check size={13} aria-hidden />
            {labels.saved}
          </span>
        )}

        {!state.ok && state.message === "SAVE_FAILED" && (
          <span className="flex items-center gap-1.5 text-xs text-red-700">
            <AlertCircle size={13} aria-hidden />
            {labels.error}
          </span>
        )}
      </div>
    </form>
  );
}
