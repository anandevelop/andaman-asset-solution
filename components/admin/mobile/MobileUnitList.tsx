"use client";

/**
 * components/admin/mobile/MobileUnitList.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The on-site "change unit status" flow from Mobile.dc.html screen 3: a
 * flat list of units, tap one to open a bottom sheet with a status radio
 * list and Save/Cancel. The mockup's sheet also shows a free-text
 * "reason / note" field and a line linking the unit to a lead — neither
 * is backed by real data (ProjectUnit has no note column for a status
 * change, and no relation to LeadInquiry), so both are left out rather
 * than built as UI that would not actually persist or read anything.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { UnitStatus } from "@prisma/client";
import { updateUnitStatusMobile } from "@/app/[locale]/admin/(catalog)/projects/[id]/units/actions";

type Unit = { id: string; unitNumber: string; status: UnitStatus; typeLabel: string };

type SheetLabels = { title: string; cancel: string; save: string; error: string };

type Props = {
  locale: string;
  projectId: string;
  projectSlug: string;
  units: Unit[];
  statusLabels: Record<UnitStatus, string>;
  sheetLabels: SheetLabels;
};

const STATUS_CHIP: Record<UnitStatus, string> = {
  AVAILABLE: "bg-emerald-50 text-emerald-800",
  RESERVED: "bg-accent-50 text-accent-700",
  SOLD: "bg-surface-muted text-ink-muted",
};

export default function MobileUnitList({
  locale,
  projectId,
  projectSlug,
  units,
  statusLabels,
  sheetLabels,
}: Props) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [choice, setChoice] = useState<UnitStatus | null>(null);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  const openUnit = units.find((u) => u.id === openId) ?? null;

  function open(unit: Unit) {
    setOpenId(unit.id);
    setChoice(unit.status);
    setError(false);
  }

  function close() {
    if (pending) return;
    setOpenId(null);
    setChoice(null);
  }

  function save() {
    if (!openUnit || !choice) return;
    setError(false);
    startTransition(async () => {
      const result = await updateUnitStatusMobile(locale, projectId, projectSlug, openUnit.id, choice);
      if (result.ok) {
        setOpenId(null);
        setChoice(null);
        router.refresh();
      } else {
        setError(true);
      }
    });
  }

  return (
    <div className="space-y-2">
      {units.map((unit) => (
        <button
          key={unit.id}
          type="button"
          onClick={() => open(unit)}
          className="flex min-h-[56px] w-full items-center gap-3 rounded-xs border border-primary/10 bg-white px-3.5 py-2.5 text-left"
        >
          <span className="w-14 shrink-0 text-sm font-semibold text-primary">{unit.unitNumber}</span>
          <span className="min-w-0 flex-1 truncate text-xs text-ink-muted">{unit.typeLabel}</span>
          <span className={`shrink-0 rounded-xs px-2.5 py-1 text-[11px] font-semibold ${STATUS_CHIP[unit.status]}`}>
            {statusLabels[unit.status]}
          </span>
        </button>
      ))}

      {openUnit && (
        <div
          className="fixed inset-0 z-30 flex items-end bg-primary/30"
          onClick={close}
        >
          <div
            className="mx-auto w-full max-w-md rounded-t-2xl bg-white px-5 pb-6 pt-3.5"
            onClick={(event) => event.stopPropagation()}
          >
            <span className="mx-auto mb-3.5 block h-1 w-9 rounded-full bg-primary/15" />
            <p className="text-base font-semibold text-primary">
              {sheetLabels.title} {openUnit.unitNumber}
            </p>

            <div className="mt-2.5 divide-y divide-primary/10">
              {Object.values(UnitStatus).map((status) => (
                <label key={status} className="flex min-h-[52px] cursor-pointer items-center gap-3 py-1">
                  <input
                    type="radio"
                    name="unit-status"
                    checked={choice === status}
                    onChange={() => setChoice(status)}
                    className="h-5 w-5 accent-primary"
                  />
                  <span className="flex-1 text-sm text-primary">{statusLabels[status]}</span>
                </label>
              ))}
            </div>

            {error && <p className="mt-2 text-xs text-red-600">{sheetLabels.error}</p>}

            <div className="mt-3 flex gap-2.5">
              <button
                type="button"
                onClick={close}
                disabled={pending}
                className="flex min-h-[46px] flex-1 items-center justify-center rounded-xs border border-primary/20 text-sm font-medium text-primary disabled:opacity-60"
              >
                {sheetLabels.cancel}
              </button>
              <button
                type="button"
                onClick={save}
                disabled={pending}
                className="flex min-h-[46px] flex-1 items-center justify-center gap-2 rounded-xs bg-primary text-sm font-medium text-white disabled:opacity-60"
              >
                {pending && <Loader2 size={14} className="animate-spin" aria-hidden />}
                {sheetLabels.save}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
