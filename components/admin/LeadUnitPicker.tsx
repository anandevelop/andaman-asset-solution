"use client";

/**
 * components/admin/LeadUnitPicker.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * "ยูนิตที่คุยอยู่" (LeadDetail.dc.html) — a minimal stand-in for the full
 * Units & Site Plan reservation workflow, which does not exist yet. This
 * only lets a rep hold one of the lead's own project's units against them
 * and set a target date; the interactive floor-plan picker, "mark as
 * sold", and the reservation's own audit trail on the Units page all stay
 * with that later phase. See reserveUnitForLead's own comment.
 *
 * Not optimistic (router.refresh() after a real save) — this changes a
 * shared ProjectUnit row's status, not a value scoped to this one lead
 * the way assignment/follow-up are, so showing a state the server hasn't
 * actually committed yet would be misleading if the unit was claimed by
 * someone else a moment earlier.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2 } from "lucide-react";
import { reserveUnitForLead, releaseUnitReservation } from "@/app/[locale]/admin/(crm)/leads/actions";

type ReservableUnit = { id: string; unitNumber: string; unitTypeName: string | null };
type CurrentReservation = { unitId: string; unitNumber: string; expiresAt: string | null };

type Props = {
  locale: string;
  leadId: string;
  reservableUnits: ReservableUnit[];
  current: CurrentReservation | null;
  labels: {
    label: string;
    placeholder: string;
    expiresLabel: string;
    reserve: string;
    release: string;
    reservedTag: string;
    error: string;
    noUnits: string;
  };
};

export default function LeadUnitPicker({ locale, leadId, reservableUnits, current, labels }: Props) {
  const router = useRouter();
  const [selectedUnit, setSelectedUnit] = useState("");
  const [expiresAt, setExpiresAt] = useState(current?.expiresAt ?? "");
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  function reserve(unitId: string) {
    if (!unitId) return;
    setError(false);
    startTransition(async () => {
      const result = await reserveUnitForLead(locale, leadId, unitId, expiresAt);
      if (result.ok) {
        setSelectedUnit("");
        router.refresh();
      } else {
        setError(true);
      }
    });
  }

  function release() {
    if (!current) return;
    setError(false);
    startTransition(async () => {
      const result = await releaseUnitReservation(locale, leadId, current.unitId);
      if (result.ok) router.refresh();
      else setError(true);
    });
  }

  return (
    <div>
      <p className="admin-label">{labels.label}</p>

      {current ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="rounded-xs bg-accent/15 px-2 py-1 text-xs font-semibold text-accent-700">
              {current.unitNumber}
            </span>
            <span className="text-xs text-ink-muted">{labels.reservedTag}</span>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs text-ink-muted" htmlFor="unit-reservation-expiry">
              {labels.expiresLabel}
            </label>
            <input
              id="unit-reservation-expiry"
              type="date"
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
              disabled={pending}
              className="admin-input py-1! text-xs"
            />
            <button
              type="button"
              onClick={() => reserve(current.unitId)}
              disabled={pending}
              className="text-xs font-medium text-accent-700 hover:text-accent-800"
            >
              {labels.reserve}
            </button>
          </div>

          <button
            type="button"
            onClick={release}
            disabled={pending}
            className="text-xs font-medium text-ink-muted hover:text-red-600"
          >
            {pending ? <Loader2 size={12} className="inline animate-spin" aria-hidden /> : null}{" "}
            {labels.release}
          </button>
        </div>
      ) : reservableUnits.length === 0 ? (
        <p className="text-xs text-ink-muted">{labels.noUnits}</p>
      ) : (
        <div className="space-y-2">
          <select
            value={selectedUnit}
            onChange={(event) => setSelectedUnit(event.target.value)}
            disabled={pending}
            className="admin-input py-1.5! text-sm"
          >
            <option value="">{labels.placeholder}</option>
            {reservableUnits.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.unitNumber}
                {unit.unitTypeName ? ` · ${unit.unitTypeName}` : ""}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
              disabled={pending}
              className="admin-input flex-1 py-1.5! text-xs"
            />
            <button
              type="button"
              onClick={() => reserve(selectedUnit)}
              disabled={pending || !selectedUnit}
              className="admin-btn shrink-0 py-1.5! text-xs"
            >
              {pending && <Loader2 size={12} className="animate-spin" aria-hidden />}
              {labels.reserve}
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-red-700">
          <AlertCircle size={13} aria-hidden />
          {labels.error}
        </p>
      )}
    </div>
  );
}
