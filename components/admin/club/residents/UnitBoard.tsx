/**
 * components/admin/club/residents/UnitBoard.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The "ผังยูนิต" grid: tiles grouped by unit type, coloured by status,
 * the owner's first name under a handed-over unit and the price under an
 * available one. A red dot marks a reservation expiring within 3 days.
 * Tiles are links that open the unit drawer (?unit=), so Back closes it.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import type { UnitStatus } from "@prisma/client";

export type BoardTile = {
  id: string;
  unitNumber: string;
  status: UnitStatus;
  sub: string;
  flag: boolean;
  dim: boolean;
  href: string;
  title: string;
};

export type BoardGroup = { key: string; label: string; meta: string | null; tiles: BoardTile[] };

export const TILE_TONE: Record<UnitStatus, string> = {
  AVAILABLE: "bg-adm-success/12 text-adm-success",
  RESERVED: "bg-adm-warning/14 text-adm-warning",
  SOLD: "bg-adm-status-info/14 text-adm-status-info",
  TRANSFERRED: "bg-adm-strong text-adm-on-strong",
};

export const STATUS_DOT: Record<UnitStatus, string> = {
  AVAILABLE: "bg-adm-success",
  RESERVED: "bg-adm-warning",
  SOLD: "bg-adm-status-info",
  TRANSFERRED: "bg-adm-strong",
};

export default function UnitBoard({
  groups,
  legend,
  expiringLabel,
  emptyLabel,
}: {
  groups: BoardGroup[];
  legend: { status: UnitStatus; label: string }[];
  expiringLabel: string;
  emptyLabel: string;
}) {
  return (
    <div className="admin-card">
      {groups.length === 0 && <p className="text-sm text-adm-muted">{emptyLabel}</p>}
      {groups.map((group) => (
        <section key={group.key} className="mb-5 last:mb-3">
          <h3 className="mb-2 text-[13px] font-semibold text-adm-text">
            {group.label}
            {group.meta && <span className="font-normal text-adm-muted"> · {group.meta}</span>}
          </h3>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-1.5">
            {group.tiles.map((tile) => (
              <Link
                key={tile.id}
                href={tile.href}
                scroll={false}
                title={tile.title}
                className={`relative rounded-lg px-1 pb-[5px] pt-1.5 text-center text-xs font-semibold leading-tight transition-[opacity,transform] hover:-translate-y-px ${TILE_TONE[tile.status]} ${tile.dim ? "opacity-20" : ""}`}
              >
                {tile.unitNumber}
                <small className="block truncate text-[10px] font-normal opacity-80">{tile.sub || " "}</small>
                {tile.flag && <span aria-hidden className="absolute right-1 top-1 h-2 w-2 rounded-full bg-adm-danger ring-2 ring-adm-panel" />}
              </Link>
            ))}
          </div>
        </section>
      ))}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-adm-line pt-3 text-[11.5px] text-adm-muted">
        {legend.map((item) => (
          <span key={item.status} className="inline-flex items-center gap-1.5">
            <i aria-hidden className={`h-2.5 w-2.5 rounded-[3px] ${STATUS_DOT[item.status]}`} />
            {item.label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <i aria-hidden className="h-2.5 w-2.5 rounded-full bg-adm-danger" />
          {expiringLabel}
        </span>
      </div>
    </div>
  );
}
