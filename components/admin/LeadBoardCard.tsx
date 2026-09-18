"use client";

/**
 * components/admin/LeadBoardCard.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * One card on the leads Kanban board (LeadBoard.dc.html). Purely
 * presentational — every string it shows is already formatted by the
 * server (lib/leads-board.ts + the page's own Intl formatters), so this
 * component does no date arithmetic and no locale lookups of its own.
 *
 * Draggable via @dnd-kit (see LeadBoard.tsx for the DndContext); the card
 * itself is also a plain link, so a click that is not a drag still opens
 * the lead the same way a table row's "View" link always has.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { useDraggable } from "@dnd-kit/core";
import { CalendarClock, Clock } from "lucide-react";
import { initialsFrom } from "@/lib/format";

export type LeadCardView = {
  id: string;
  name: string;
  projectLabel: string | null;
  ageLabel: string;
  /** "urgent" (red, overdue/stale) or "default". */
  ageTone: "urgent" | "default";
  hintLine: string;
  hintTone: "urgent" | "followUp" | "today" | "muted";
  assigneeName: string | null;
  consentGiven: boolean;
};

const HINT_TONE_CLASS: Record<LeadCardView["hintTone"], string> = {
  urgent: "font-medium text-red-600",
  followUp: "font-medium text-accent-700",
  today: "font-medium text-emerald-700",
  muted: "text-ink-muted",
};

export default function LeadBoardCard({
  card,
  href,
}: {
  card: LeadCardView;
  href: string;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.id,
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={
        transform
          ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
          : undefined
      }
      className={[
        "touch-none rounded-xs border bg-surface-raised p-3 shadow-xs transition-shadow",
        isDragging ? "z-20 border-primary/30 opacity-90 shadow-lg" : "border-primary/10 hover:shadow-card",
        card.ageTone === "urgent" ? "border-red-300/70" : "",
      ].join(" ")}
    >
      <Link href={href} className="block" draggable={false}>
        <div className="flex items-start justify-between gap-2">
          <p className="text-[13px] font-semibold leading-snug text-primary">{card.name}</p>
          <span
            className={[
              "shrink-0 whitespace-nowrap rounded-xs px-1.5 py-0.5 text-[10px] font-medium tabular-nums",
              card.ageTone === "urgent"
                ? "bg-red-50 text-red-700"
                : "bg-surface-muted text-ink-muted",
            ].join(" ")}
          >
            {card.ageLabel}
          </span>
        </div>

        {card.projectLabel && (
          <p className="mt-1 truncate text-[11.5px] text-ink-muted">{card.projectLabel}</p>
        )}

        <p className={`mt-2 flex items-center gap-1 text-[11.5px] leading-snug ${HINT_TONE_CLASS[card.hintTone]}`}>
          {card.hintTone === "today" && <CalendarClock size={11} className="shrink-0" aria-hidden />}
          {card.hintTone === "followUp" && <Clock size={11} className="shrink-0" aria-hidden />}
          <span className="line-clamp-2">{card.hintLine}</span>
        </p>

        {card.assigneeName && (
          <div className="mt-2.5 flex items-center gap-1.5">
            <span
              aria-hidden
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[9px] font-semibold text-white"
            >
              {initialsFrom(card.assigneeName)}
            </span>
            <span className="truncate text-[11px] text-ink-muted">{card.assigneeName}</span>
          </div>
        )}

        {!card.consentGiven && (
          <p className="mt-2 text-[10px] font-medium text-red-600">PDPA</p>
        )}
      </Link>
    </div>
  );
}
