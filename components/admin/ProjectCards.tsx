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
 * A server component: every card is a link into the workspace, with
 * nothing to hold in client state.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { ImageOff } from "lucide-react";
import type { ProjectStatus } from "@prisma/client";
import type { UnitTally } from "@/lib/admin/project-list";

export type ProjectCardView = {
  id: string;
  name: string;
  location: string;
  imageUrl: string | null;
  status: ProjectStatus;
  statusLabel: string;
  isPublished: boolean;
  units: UnitTally;
  unitsLabel: string;
  typesLabel: string;
  priceLabel: string;
  /** 0–100, from lib/admin/project-readiness.ts. */
  readiness: number;
  readinessLabel: string;
  locales: { locale: string; fill: "complete" | "partial" | "missing" }[];
};

const STATUS_TONE: Record<ProjectStatus, string> = {
  UPCOMING: "bg-adm-status-info-bg text-adm-status-info",
  UNDER_CONSTRUCTION: "bg-adm-warning-bg text-adm-warning",
  READY_TO_MOVE_IN: "bg-adm-success-bg text-adm-success",
  SOLD_OUT: "bg-adm-neutral-bg text-adm-neutral",
};

const FILL_TONE = {
  complete: "bg-adm-success-bg text-adm-success",
  partial: "bg-adm-warning-bg text-adm-warning",
  missing: "bg-adm-danger-bg text-adm-danger",
} as const;

export default function ProjectCards({
  locale,
  cards,
  labels,
}: {
  locale: string;
  cards: ProjectCardView[];
  labels: { draft: string; localeMissing: string };
}) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {cards.map((card) => (
        <li key={card.id}>
          <Link
            href={`/${locale}/admin/projects/${card.id}/edit`}
            className="admin-card group block overflow-hidden p-0! transition-[transform,border-color] hover:-translate-y-0.5 hover:border-adm-line-strong motion-reduce:hover:translate-y-0"
          >
            <span className="relative block aspect-[16/9] bg-surface-muted">
              {card.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- admin thumbnail, see ProjectsTable
                <img src={card.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full items-center justify-center">
                  <ImageOff size={28} aria-hidden className="text-ink-muted" />
                </span>
              )}
              {/* A solid chip, not text on the photo: any photo can sit
                  behind it and the label still reads. */}
              <span className="absolute left-3 top-3 flex gap-1.5">
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_TONE[card.status]}`}>
                  {card.statusLabel}
                </span>
                {!card.isPublished && (
                  <span className="rounded-full bg-adm-solid px-2.5 py-0.5 text-[11px] font-medium text-ink">
                    {labels.draft}
                  </span>
                )}
              </span>
              <span className="absolute right-3 top-3 rounded-full bg-adm-solid p-0.5" title={card.readinessLabel}>
                <ReadinessRing percent={card.readiness} />
              </span>
            </span>

            <span className="block p-4">
              <span className="block truncate text-base font-semibold text-ink group-hover:text-primary-500">
                {card.name}
              </span>
              <span className="block truncate text-xs text-ink-muted">{card.location}</span>

              <span className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <Stat value={card.unitsLabel} />
                <Stat value={card.typesLabel} />
                <Stat value={card.priceLabel} />
              </span>

              {card.units.kind === "counted" && card.units.total > 0 && (
                <span aria-hidden className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-adm-line">
                  <span className="bg-adm-success" style={{ width: `${(card.units.available / card.units.total) * 100}%` }} />
                  <span className="bg-adm-fill" style={{ width: `${(card.units.reserved / card.units.total) * 100}%` }} />
                  <span className="bg-primary-500" style={{ width: `${(card.units.sold / card.units.total) * 100}%` }} />
                </span>
              )}

              <span className="mt-3 flex gap-1">
                {card.locales.map((entry) => (
                  <span
                    key={entry.locale}
                    title={entry.fill === "complete" ? undefined : labels.localeMissing}
                    className={`rounded-[6px] px-1.5 py-0.5 text-[10.5px] font-semibold uppercase ${FILL_TONE[entry.fill]}`}
                  >
                    {entry.locale}
                  </span>
                ))}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Stat({ value }: { value: string }) {
  return <span className="truncate rounded-[8px] bg-surface px-2 py-1.5 text-center text-ink">{value}</span>;
}

function ReadinessRing({ percent }: { percent: number }) {
  const radius = 13;
  const circumference = 2 * Math.PI * radius;
  const tone = percent >= 80 ? "stroke-adm-success" : percent >= 40 ? "stroke-adm-warning" : "stroke-adm-danger";
  return (
    <span className="relative flex h-9 w-9 items-center justify-center">
      <svg viewBox="0 0 32 32" className="h-9 w-9 -rotate-90" aria-hidden>
        <circle cx="16" cy="16" r={radius} fill="none" strokeWidth="3" className="stroke-adm-line" />
        <circle
          cx="16"
          cy="16"
          r={radius}
          fill="none"
          strokeWidth="3"
          strokeLinecap="round"
          className={tone}
          strokeDasharray={`${(percent / 100) * circumference} ${circumference}`}
        />
      </svg>
      <span className="absolute text-[9.5px] font-semibold tabular-nums text-ink">{percent}</span>
    </span>
  );
}
