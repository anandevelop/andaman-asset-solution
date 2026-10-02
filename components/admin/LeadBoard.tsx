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
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { updateLeadStatus } from "@/app/[locale]/admin/(crm)/leads/actions";
import { showUndoToast } from "@/components/admin/UndoToast";
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
  /** "/th/admin/leads?…&lead=" — each card appends its id, opening the
   *  lead in the page's drawer with the board's filters kept. */
  leadHrefBase: string;
  errorLabel: string;
};

function Column({ column, leadHrefBase }: { column: LeadBoardColumn; leadHrefBase: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.status });

  return (
    <div className="flex w-72 shrink-0 flex-col rounded-[14px] bg-adm-text/3 p-2">
      <div className="mb-2 flex items-center gap-2 px-1.5 pt-1">
        <span className={`h-2 w-2 shrink-0 rounded-full ${column.dotClassName}`} aria-hidden />
        <h2 className="text-[13px] font-semibold text-adm-text">{column.label}</h2>
        <span className="admin-mono ml-auto rounded-full bg-adm-text/6 px-1.5 py-0.5 text-[11px] tabular-nums text-adm-muted">
          {column.cards.length}
        </span>
      </div>

      <div
        ref={setNodeRef}
        className={[
          "flex min-h-[120px] flex-1 flex-col gap-2 rounded-[10px] border border-transparent p-0.5 transition-colors",
          isOver ? "border-adm-fill! bg-adm-fill/6" : "",
        ].join(" ")}
      >
        {column.cards.map((card) => (
          <LeadBoardCard
            key={card.id}
            card={card}
            href={`${leadHrefBase}${card.id}`}
          />
        ))}
      </div>
    </div>
  );
}

export default function LeadBoard({ locale, columns: initialColumns, leadHrefBase, errorLabel }: Props) {
  const router = useRouter();
  const t = useTranslations("admin.leads.board");
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

    const fromStatus = sourceColumn.status;
    void updateLeadStatus(locale, card.id, nextStatus).then((result) => {
      if (!result.ok) {
        setColumns(previous);
        setError(true);
        return;
      }
      /* Tier 1: the move stands, with eight seconds to put it back. The
         undo is the same action in reverse; the refresh that follows
         redraws both columns from the server. */
      const target = columns.find((c) => c.status === nextStatus)?.label ?? nextStatus;
      showUndoToast({
        message: t("moved", { name: card.name, status: target }),
        onUndo: async () => {
          const reverted = await updateLeadStatus(locale, card.id, fromStatus);
          if (!reverted.ok) throw new Error("undo refused");
          router.refresh();
        },
      });
    });
  };

  return (
    <div>
      {error && (
        <p className="mb-3 flex items-center gap-1.5 text-xs text-adm-danger">
          <AlertCircle size={13} aria-hidden />
          {errorLabel}
        </p>
      )}

      {/* A fixed id: dnd-kit otherwise numbers its aria-describedby from a
          module counter that the server and the browser do not share, and
          every render of this page was a hydration mismatch. */}
      <DndContext id="lead-board" sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-2">
          {columns.map((column) => (
            <Column key={column.status} column={column} leadHrefBase={leadHrefBase} />
          ))}
        </div>
      </DndContext>
    </div>
  );
}
