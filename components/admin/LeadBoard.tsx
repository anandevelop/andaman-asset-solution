"use client";

/**
 * components/admin/LeadBoard.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The leads Kanban board (LeadBoard.dc.html) — six columns, one per open
 * LeadStatus (LOST is a count, not a column; see lib/leads-board.ts).
 *
 * Drag-and-drop only changes which column a card is in, i.e. its status —
 * there is no persisted order-within-a-column, so a card always renders
 * newest-first (the same ordering the table view uses) and a drag that
 * lands back in its own column is a no-op. Dropping into a different
 * column calls the same updateLeadStatus() the table's inline status
 * <select> already uses, so the two views can never drift into different
 * validation or SALES-ownership rules.
 *
 * PointerSensor's activation distance (6px, matching ImageUploader.tsx's
 * own drag list) is what lets a plain click still open the card: dnd-kit
 * does not intercept the pointer at all until the cursor has actually
 * moved, so a click with no movement reaches the card's <Link> untouched.
 *
 * Optimistic: a card moves the instant it is dropped and only snaps back
 * if the server rejects the change (a SALES rep dragging a card that is
 * not theirs, most commonly) — the same contract LeadStatusSelect already
 * gives the table.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { LeadStatus } from "@prisma/client";
import { AlertCircle } from "lucide-react";
import { updateLeadStatus } from "@/app/[locale]/admin/(crm)/leads/actions";
import LeadBoardCard, { type LeadCardView } from "@/components/admin/LeadBoardCard";

export type LeadBoardColumn = {
  status: LeadStatus;
  label: string;
  dotClassName: string;
  cards: LeadCardView[];
};

type Props = {
  locale: string;
  columns: LeadBoardColumn[];
  errorLabel: string;
};

function Column({
  column,
  locale,
}: {
  column: LeadBoardColumn;
  /** Baked into each card's link href. */
  locale: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.status });

  return (
    <div className="flex w-72 shrink-0 flex-col">
      <div className="mb-2.5 flex items-center gap-2 px-0.5">
        <span className={`h-2 w-2 shrink-0 rounded-full ${column.dotClassName}`} aria-hidden />
        <h2 className="text-[13px] font-semibold text-primary">{column.label}</h2>
        <span className="ml-auto rounded-xs bg-surface-muted px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-ink-muted">
          {column.cards.length}
        </span>
      </div>

      <div
        ref={setNodeRef}
        className={[
          "flex min-h-[120px] flex-1 flex-col gap-2.5 rounded-xs p-1 transition-colors",
          isOver ? "bg-accent-50/60 ring-1 ring-inset ring-accent-400/40" : "",
        ].join(" ")}
      >
        {column.cards.map((card) => (
          <LeadBoardCard
            key={card.id}
            card={card}
            href={`/${locale}/admin/leads/${card.id}`}
          />
        ))}
      </div>
    </div>
  );
}

export default function LeadBoard({ locale, columns: initialColumns, errorLabel }: Props) {
  const [columns, setColumns] = useState(initialColumns);
  const [error, setError] = useState(false);

  // The server re-runs filters on every navigation; a fresh set of columns
  // from the parent (a filter change, a revalidated status update from
  // another tab) should always replace whatever this component drifted to
  // locally, not merge with it.
  useEffect(() => setColumns(initialColumns), [initialColumns]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const nextStatus = over.id as LeadStatus;
    const sourceColumn = columns.find((c) => c.cards.some((card) => card.id === active.id));
    const card = sourceColumn?.cards.find((c) => c.id === active.id);
    if (!card || !sourceColumn || sourceColumn.status === nextStatus) return;

    const previous = columns;

    setColumns((current) =>
      current.map((c) => {
        if (c.status === sourceColumn.status) {
          return { ...c, cards: c.cards.filter((item) => item.id !== card.id) };
        }
        if (c.status === nextStatus) {
          return { ...c, cards: [card, ...c.cards] };
        }
        return c;
      }),
    );
    setError(false);

    void updateLeadStatus(locale, card.id, nextStatus).then((result) => {
      if (!result.ok) {
        setColumns(previous);
        setError(true);
      }
    });
  };

  return (
    <div>
      {error && (
        <p className="mb-3 flex items-center gap-1.5 text-xs text-red-700">
          <AlertCircle size={13} aria-hidden />
          {errorLabel}
        </p>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-2">
          {columns.map((column) => (
            <Column key={column.status} column={column} locale={locale} />
          ))}
        </div>
      </DndContext>
    </div>
  );
}
