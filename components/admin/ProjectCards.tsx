/**
 * components/admin/ProjectCards.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The project list as photo cards — the v4 default. A sales office knows
 * its developments by their pictures, and the three things it asks of each
 * (what is left, what does it cost, is the page finished) fit on a card
 * without a twelve-column table.
 *
 * The table (ProjectsTable, ?view=table) is still one click away and still
 * where bulk publish, reorder and export live; cards are for finding and
 * opening a project, not for operating on many at once.
 *
 * Layout is the mockup's: a 170px photo fading into the card, the name
 * pulled up over the fade with the readiness ring beside it, three stat
 * tiles, the stock bar, and "ว่าง x/y" with the language flags under it.
 *
 * A server component: every card is a link into the workspace, with
 * nothing to hold in client state.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { MapPin } from "lucide-react";
import type { ProjectStatus } from "@prisma/client";
import type { UnitTally } from "@/lib/admin/project-list";
import AdminImage from "@/components/admin/ui/AdminImage";
import ProgressRing from "@/components/admin/ui/ProgressRing";
import LocaleFlags from "@/components/admin/ui/LocaleFlags";

export type ProjectCardView = {
  id: string;
  name: string;
  tagline: string | null;
  location: string;
  imageUrl: string | null;
  status: ProjectStatus;
  statusLabel: string;
  isPublished: boolean;
  units: UnitTally;
  /** "30", or "—" for a project not sold by the unit. */
  unitsValue: string;
  typesValue: string;
  priceValue: string;
  /** "ว่าง 30/30" — the short form; the long one truncated on every card. */
  freeLabel: string | null;
  /** 0–100, from lib/admin/project-readiness.ts. */
  readiness: number;
  readinessLabel: string;
  locales: { locale: string; fill: "complete" | "partial" | "missing" }[];
};

const STATUS_TONE: Record<ProjectStatus, string> = {
  UPCOMING: "text-adm-status-info",
  UNDER_CONSTRUCTION: "text-adm-warning",
  READY_TO_MOVE_IN: "text-adm-success",
  SOLD_OUT: "text-adm-neutral",
};

export default function ProjectCards({
  locale,
  cards,
  labels,
}: {
  locale: string;
  cards: ProjectCardView[];
  labels: {
    draft: string;
    published: string;
    units: string;
    types: string;
    price: string;
    localeTitles: { complete: string; partial: string; missing: string };
  };
}) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {cards.map((card) => (
        <li key={card.id}>
          <Link
            href={`/${locale}/admin/projects/${card.id}/edit`}
            data-spot
            className="admin-card admin-card-lift group block h-full overflow-hidden p-0!"
          >
            <span className="relative block h-[170px]">
              <AdminImage src={card.imageUrl} loading="lazy" iconSize={28} className="h-full w-full object-cover" />
              {/* The photo fades into the card, so the name can sit over
                  its lower edge and still read. */}
              <span
                aria-hidden
                className="absolute inset-0 bg-[linear-gradient(180deg,transparent_30%,var(--adm-solid))]"
              />
              {/* Solid chips, not text on the photo: any photo can sit
                  behind them and the label still reads. */}
              <span
                className={`absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-adm-solid px-2.5 py-0.5 text-[11px] font-semibold shadow-[0_1px_4px_rgba(0,0,0,0.12)] ${STATUS_TONE[card.status]}`}
              >
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
                {card.statusLabel}
              </span>
              <span
                className={[
                  "absolute right-3 top-3 rounded-full px-2.5 py-0.5 text-[11px] font-medium shadow-[0_1px_4px_rgba(0,0,0,0.12)]",
                  card.isPublished ? "bg-adm-success text-adm-on-strong" : "bg-adm-solid text-adm-muted",
                ].join(" ")}
              >
                {card.isPublished ? labels.published : labels.draft}
              </span>
            </span>

            <span className="relative -mt-10 block px-[18px] pb-[18px]">
              <span className="flex items-end justify-between gap-3">
                <span className="min-w-0">
                  <span className="block truncate text-lg font-semibold leading-tight text-adm-text">{card.name}</span>
                  {card.tagline && <span className="mt-0.5 block truncate text-xs text-adm-muted">{card.tagline}</span>}
                </span>
                <span title={card.readinessLabel} className="shrink-0">
                  <ProgressRing value={card.readiness} label={card.readinessLabel} />
                </span>
              </span>

              <span className="mt-2.5 flex items-center gap-1 text-xs text-adm-muted">
                <MapPin size={13} aria-hidden className="shrink-0" />
                <span className="truncate">{card.location}</span>
              </span>

              <span className="mt-3 grid grid-cols-3 gap-2">
                <Stat label={labels.units} value={card.unitsValue} />
                <Stat label={labels.types} value={card.typesValue} />
                <Stat label={labels.price} value={card.priceValue} />
              </span>

              {card.units.kind === "counted" && card.units.total > 0 && (
                <span aria-hidden className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-adm-line">
                  <span className="bg-adm-success" style={{ width: `${(card.units.available / card.units.total) * 100}%` }} />
                  <span className="bg-adm-fill" style={{ width: `${(card.units.reserved / card.units.total) * 100}%` }} />
                  <span className="bg-adm-ocean" style={{ width: `${(card.units.sold / card.units.total) * 100}%` }} />
                </span>
              )}

              <span className="mt-3 flex items-center justify-between gap-2">
                <span className="text-xs tabular-nums text-adm-muted">{card.freeLabel}</span>
                <LocaleFlags
                  locales={card.locales.map((entry) => ({ locale: entry.locale, state: entry.fill }))}
                  titles={labels.localeTitles}
                />
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="min-w-0 rounded-[10px] bg-adm-text/4 px-2.5 py-2">
      <span className="block truncate text-xs text-adm-muted">{label}</span>
      <span className="block truncate text-sm font-semibold text-adm-text">{value}</span>
    </span>
  );
}
