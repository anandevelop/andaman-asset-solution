"use client";

/**
 * components/admin/UnitTileBoard.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Every plot as a tile, grouped by house type and coloured by status — the
 * v4 units tab. The question this screen answers is "what is left, and
 * where", and a wall of numbered tiles answers it faster than a table or a
 * plan image that most projects have not traced yet.
 *
 *   · click        → the status menu; picking one applies it at once, with
 *                    the eight-second undo (tier 1, see UndoToast)
 *   · shift-click  → add the tile to a selection, for a bulk status change
 *
 * A tile whose plot is reserved FOR someone — a lead, a named buyer, an
 * expiry — does not get the quick menu: it opens the detail panel. Moving
 * such a plot off RESERVED clears the reservation (reservationPatchFor in
 * units/actions.ts), and an undo can put the status back but not the lead
 * it was held for. A change that cannot be cleanly undone is not tier 1.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { UnitStatus } from "@prisma/client";
import { Lock, X } from "lucide-react";
import { setUnitStatus } from "@/app/[locale]/admin/(catalog)/projects/[id]/units/actions";
import PopoverMenu from "@/components/admin/PopoverMenu";
import { showUndoToast } from "@/components/admin/UndoToast";

export type TileUnit = {
  id: string;
  unitNumber: string;
  status: UnitStatus;
  released: boolean;
  /** Held for a lead or a named buyer — detail panel only (see header). */
  locked: boolean;
  selectedInPanel: boolean;
  detailHref: string;
};

export type TileGroup = { key: string; label: string; meta: string | null; units: TileUnit[] };

const TONE: Record<UnitStatus, string> = {
  AVAILABLE: "border-adm-success/30 bg-adm-success/12 text-adm-success",
  RESERVED: "border-adm-warning/30 bg-adm-warning/12 text-adm-warning",
  SOLD: "border-adm-line bg-adm-text/5 text-adm-muted",
};

const DOT: Record<UnitStatus, string> = {
  AVAILABLE: "bg-adm-success",
  RESERVED: "bg-adm-warning",
  SOLD: "bg-adm-neutral",
};

const DETAIL = "__detail";

type Props = {
  locale: string;
  projectId: string;
  projectSlug: string;
  groups: TileGroup[];
  statusLabels: Record<UnitStatus, string>;
  canWrite: boolean;
  labels: {
    details: string;
    unreleased: string;
    lockedHint: string;
    shiftHint: string;
    bulkStatus: string;
    clear: string;
    failed: string;
  };
};

export default function UnitTileBoard({ locale, projectId, projectSlug, groups, statusLabels, canWrite, labels }: Props) {
  const router = useRouter();
  const t = useTranslations("admin.units.tiles");
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [, startTransition] = useTransition();

  const all = groups.flatMap((group) => group.units);
  const byId = new Map(all.map((unit) => [unit.id, unit]));
  // Derived through what is on screen, so a refresh can never leave a
  // stale id in the selection.
  const selected = [...picked].filter((id) => byId.has(id));

  const apply = (changes: { id: string; from: UnitStatus; to: UnitStatus }[]) =>
    startTransition(async () => {
      const done: typeof changes = [];
      for (const change of changes) {
        const result = await setUnitStatus(locale, projectId, projectSlug, change.id, change.to);
        if (result.ok) done.push(change);
      }
      if (done.length === 0) {
        showUndoToast({ message: labels.failed });
        return;
      }
      setPicked(new Set());
      router.refresh();
      const first = byId.get(done[0].id);
      showUndoToast({
        message:
          done.length === 1 && first
            ? t("changedOne", { unit: first.unitNumber, status: statusLabels[done[0].to] })
            : t("changedMany", { count: done.length, status: statusLabels[done[0].to] }),
        onUndo: async () => {
          for (const change of done) {
            const reverted = await setUnitStatus(locale, projectId, projectSlug, change.id, change.from);
            if (!reverted.ok) throw new Error("undo refused");
          }
          router.refresh();
        },
      });
    });

  const statusOptions = Object.values(UnitStatus).map((status) => ({
    value: status,
    label: statusLabels[status],
    dotClassName: DOT[status],
  }));

  return (
    <div className="space-y-5">
      {canWrite && (
        <p className="text-xs text-adm-muted">{labels.shiftHint}</p>
      )}

      {selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-[12px] bg-adm-band px-3 py-2 text-sm text-white">
          <span className="font-medium tabular-nums">{t("selected", { count: selected.length })}</span>
          <PopoverMenu
            label={labels.bulkStatus}
            buttonClassName="inline-flex h-7 items-center rounded-[8px] px-2.5 text-[12.5px] hover:bg-white/10"
            buttonContent={labels.bulkStatus}
            options={statusOptions}
            onSelect={(to) =>
              apply(
                selected
                  .map((id) => byId.get(id)!)
                  .filter((unit) => unit.status !== to)
                  .map((unit) => ({ id: unit.id, from: unit.status, to: to as UnitStatus })),
              )
            }
          />
          <button
            type="button"
            onClick={() => setPicked(new Set())}
            className="ml-auto inline-flex h-7 items-center gap-1 rounded-[8px] px-2 text-[12.5px] text-white/70 hover:bg-white/10 hover:text-white"
          >
            <X size={14} aria-hidden />
            {labels.clear}
          </button>
        </div>
      )}

      {groups.map((group) => (
        <section key={group.key}>
          <h3 className="mb-2 flex items-baseline gap-2 text-xs text-adm-muted">
            <span className="font-medium text-adm-text">{group.label}</span>
            {group.meta && <span>· {group.meta}</span>}
          </h3>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(54px,1fr))] gap-1.5">
            {group.units.map((unit) => {
              const isPicked = picked.has(unit.id);
              const tileClass = [
                // Square, mono, and a sand ring that grows on hover — the
                // mockup's .unit. Status is the tile's colour and its title;
                // the word under the number did not fit at 54px.
                "admin-mono relative flex aspect-square w-full items-center justify-center rounded-[9px] border text-[11px] font-semibold tabular-nums transition-[transform,box-shadow] duration-150 hover:z-10 hover:scale-[1.08] hover:shadow-[0_0_0_2px_var(--adm-fill),0_0_14px_var(--adm-rail-glow)] motion-reduce:hover:scale-100",
                unit.released ? TONE[unit.status] : "border-dashed border-adm-line-strong bg-transparent text-adm-muted",
                unit.selectedInPanel ? "ring-2 ring-adm-info ring-offset-1 ring-offset-adm-bg" : "",
                isPicked ? "ring-2 ring-adm-fill ring-offset-1 ring-offset-adm-bg" : "",
              ].join(" ");
              const body = (
                <>
                  {unit.unitNumber}
                  {unit.locked && <Lock size={9} aria-hidden className="absolute right-1 top-1 opacity-70" />}
                </>
              );
              const label = `${unit.unitNumber} · ${unit.released ? statusLabels[unit.status] : labels.unreleased}`;

              if (!canWrite || unit.locked) {
                return (
                  <button
                    key={unit.id}
                    type="button"
                    title={unit.locked ? `${label} · ${labels.lockedHint}` : label}
                    aria-label={label}
                    onClick={() => router.push(unit.detailHref, { scroll: false })}
                    className={tileClass}
                  >
                    {body}
                  </button>
                );
              }

              return (
                <PopoverMenu
                  key={unit.id}
                  className="relative block"
                  label={label}
                  buttonClassName={tileClass}
                  buttonContent={body}
                  options={[...statusOptions, { value: DETAIL, label: labels.details }]}
                  selected={unit.status}
                  interceptClick={(event) => {
                    if (!event.shiftKey) return false;
                    setPicked((previous) => {
                      const next = new Set(previous);
                      if (next.has(unit.id)) next.delete(unit.id);
                      else next.add(unit.id);
                      return next;
                    });
                    return true;
                  }}
                  onSelect={(value) => {
                    if (value === DETAIL) router.push(unit.detailHref, { scroll: false });
                    else apply([{ id: unit.id, from: unit.status, to: value as UnitStatus }]);
                  }}
                />
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
