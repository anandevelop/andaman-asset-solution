"use client";

/**
 * components/admin/UnitDetailPanel.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The selected plot, beside the site plan (Units.dc.html) — what it is,
 * who is holding it, and the two or three things worth doing to it from
 * here.
 *
 * The action set changes with the status because the honest set does:
 * there is no "extend the reservation" on a plot nobody has reserved, and
 * no "release the hold" on one that is sold. Reserving *for a named lead*
 * is deliberately not here either — that link is made from the lead's own
 * page, which is the only place the lead is known; this panel shows the
 * other end of it and can end it.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, CalendarClock, Check, Loader2, Pencil, X } from "lucide-react";
import {
  extendReservation,
  setUnitStatus,
  type UnitFormState,
} from "@/app/[locale]/admin/(catalog)/projects/[id]/units/actions";
import UnitForm, { type UnitFormValues } from "@/components/admin/UnitForm";

export type UnitDetailView = {
  id: string;
  unitNumber: string;
  status: "AVAILABLE" | "RESERVED" | "SOLD";
  statusLabel: string;
  releasedForSale: boolean;
  /** "3-bedroom villa · Type B", composed on the server. */
  typeLabel: string | null;
  livingAreaLabel: string | null;
  landAreaLabel: string | null;
  /** "West · Sea view", or null when neither is filled in. */
  facingLabel: string | null;
  reservedByLead: { id: string; name: string } | null;
  reservedByName: string | null;
  /** Formatted date plus "(in 5 days)" / "(2 days ago)", already localised. */
  expiryLabel: string | null;
  /** Past, or close enough that it needs chasing — see the page's own
   *  threshold. Drives the red treatment the mockup gives a reservation
   *  about to lapse, which is the state worth noticing before it does. */
  expiryUrgent: boolean;
  /** yyyy-mm-dd for the date input. */
  expiryInputValue: string;
  form: UnitFormValues;
};

type Props = {
  locale: string;
  projectId: string;
  projectSlug: string;
  unit: UnitDetailView | null;
  unitTypes: { id: string; name: string }[];
  statusLabels: { AVAILABLE: string; RESERVED: string; SOLD: string };
  saveAction: (state: UnitFormState, formData: FormData) => Promise<UnitFormState>;
  labels: {
    empty: string;
    heading: string;
    type: string;
    livingArea: string;
    landArea: string;
    facing: string;
    linkedLead: string;
    reservedBy: string;
    expires: string;
    notReleased: string;
    extend: string;
    extendSave: string;
    markSold: string;
    releaseHold: string;
    makeAvailable: string;
    markReserved: string;
    edit: string;
    cancel: string;
    auditNote: string;
    error: string;
    notSet: string;
    form: React.ComponentProps<typeof UnitForm>["labels"];
  };
};

const STATUS_TONE = {
  AVAILABLE: "bg-emerald-50 text-emerald-800",
  RESERVED: "bg-accent/20 text-accent-800",
  SOLD: "bg-surface-muted text-ink-muted",
} as const;

export default function UnitDetailPanel({
  locale,
  projectId,
  projectSlug,
  unit,
  unitTypes,
  statusLabels,
  saveAction,
  labels,
}: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [extendOpen, setExtendOpen] = useState(false);
  const [expiry, setExpiry] = useState(unit?.expiryInputValue ?? "");
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!unit) {
    return (
      <section className="admin-card flex min-h-[240px] items-center justify-center">
        <p className="text-center text-sm text-ink-muted">{labels.empty}</p>
      </section>
    );
  }

  const changeStatus = (status: "AVAILABLE" | "RESERVED" | "SOLD") => {
    setError(false);
    startTransition(async () => {
      const result = await setUnitStatus(locale, projectId, projectSlug, unit.id, status);
      if (result.ok) router.refresh();
      else setError(true);
    });
  };

  const saveExpiry = () => {
    setError(false);
    startTransition(async () => {
      const result = await extendReservation(locale, projectId, projectSlug, unit.id, expiry);
      if (result.ok) {
        setExtendOpen(false);
        router.refresh();
      } else {
        setError(true);
      }
    });
  };

  const rows: { label: string; value: React.ReactNode }[] = [
    { label: labels.type, value: unit.typeLabel ?? labels.notSet },
    { label: labels.livingArea, value: unit.livingAreaLabel ?? labels.notSet },
    { label: labels.landArea, value: unit.landAreaLabel ?? labels.notSet },
    { label: labels.facing, value: unit.facingLabel ?? labels.notSet },
  ];

  if (unit.reservedByLead) {
    rows.push({
      label: labels.linkedLead,
      value: (
        <Link
          href={`/${locale}/admin/leads/${unit.reservedByLead.id}`}
          className="font-medium text-accent-700 hover:text-accent-800"
        >
          {unit.reservedByLead.name}
        </Link>
      ),
    });
  }

  if (unit.reservedByName) rows.push({ label: labels.reservedBy, value: unit.reservedByName });

  if (unit.expiryLabel) {
    rows.push({
      label: labels.expires,
      value: (
        <span className={unit.expiryUrgent ? "font-semibold text-red-700" : "text-primary"}>
          {unit.expiryLabel}
        </span>
      ),
    });
  }

  return (
    <section className="admin-card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold text-primary">
            {labels.heading} {unit.unitNumber}
          </h2>
          <span className={`rounded-xs px-2 py-0.5 text-xs font-medium ${STATUS_TONE[unit.status]}`}>
            {unit.statusLabel}
          </span>
          {!unit.releasedForSale && (
            <span className="rounded-xs border border-dashed border-primary/30 px-2 py-0.5 text-xs text-ink-muted">
              {labels.notReleased}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => setEditing((value) => !value)}
          className="flex items-center gap-1.5 text-xs font-medium text-accent-700 hover:text-accent-800"
        >
          {editing ? <X size={13} aria-hidden /> : <Pencil size={13} aria-hidden />}
          {editing ? labels.cancel : labels.edit}
        </button>
      </div>

      {editing ? (
        <UnitForm
          action={saveAction}
          unit={unit.form}
          unitTypes={unitTypes}
          statusLabels={statusLabels}
          onDone={() => setEditing(false)}
          labels={labels.form}
        />
      ) : (
        <>
          <dl className="space-y-2.5">
            {rows.map((row) => (
              <div key={row.label} className="flex items-baseline justify-between gap-4">
                <dt className="shrink-0 text-xs text-ink-muted">{row.label}</dt>
                <dd className="text-right text-sm text-primary">{row.value}</dd>
              </div>
            ))}
          </dl>

          {extendOpen && (
            <div className="flex items-center gap-2 rounded-xs border border-primary/10 bg-surface-muted/60 p-2.5">
              <CalendarClock size={14} className="shrink-0 text-ink-muted" aria-hidden />
              <input
                type="date"
                value={expiry}
                onChange={(event) => setExpiry(event.target.value)}
                aria-label={labels.expires}
                className="admin-input py-1.5! text-xs"
              />
              <button
                type="button"
                onClick={saveExpiry}
                disabled={pending}
                className="admin-btn shrink-0 py-1.5! text-xs"
              >
                {pending ? (
                  <Loader2 size={12} className="animate-spin" aria-hidden />
                ) : (
                  <Check size={12} aria-hidden />
                )}
                {labels.extendSave}
              </button>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {unit.status === "RESERVED" && (
              <button
                type="button"
                onClick={() => setExtendOpen((value) => !value)}
                disabled={pending}
                className="admin-btn-ghost py-2! text-xs"
              >
                {labels.extend}
              </button>
            )}

            {unit.status === "AVAILABLE" && (
              <button
                type="button"
                onClick={() => changeStatus("RESERVED")}
                disabled={pending}
                className="admin-btn-ghost py-2! text-xs"
              >
                {labels.markReserved}
              </button>
            )}

            {unit.status === "RESERVED" && (
              <button
                type="button"
                onClick={() => changeStatus("AVAILABLE")}
                disabled={pending}
                className="admin-btn-ghost py-2! text-xs"
              >
                {labels.releaseHold}
              </button>
            )}

            {unit.status === "SOLD" ? (
              <button
                type="button"
                onClick={() => changeStatus("AVAILABLE")}
                disabled={pending}
                className="admin-btn-ghost py-2! text-xs"
              >
                {labels.makeAvailable}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => changeStatus("SOLD")}
                disabled={pending}
                className="admin-btn py-2! text-xs"
              >
                {pending && <Loader2 size={12} className="animate-spin" aria-hidden />}
                {labels.markSold}
              </button>
            )}
          </div>

          {error && (
            <p className="flex items-center gap-1.5 text-xs text-red-700">
              <AlertCircle size={13} aria-hidden />
              {labels.error}
            </p>
          )}

          <p className="border-t border-primary/10 pt-3 text-xs text-ink-muted">{labels.auditNote}</p>
        </>
      )}
    </section>
  );
}
