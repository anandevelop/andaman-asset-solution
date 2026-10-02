"use client";

/**
 * components/admin/HomeSectionList.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The home page's bands, top to bottom (the v4 mockup's "โครงสร้างหน้าแรก"):
 * the banner pinned first, the nine reorderable sections numbered 01–09
 * with a drag grip and a show/hide switch, the closing CTA pinned last.
 *
 * Dragging replaces the up/down arrows of the previous screen. The order
 * changes on screen at once and is saved as a whole (reorderSections); a
 * refused save puts the previous order back and says so. Keyboard users
 * keep a way in: dnd-kit's keyboard sensor — focus a grip, Space to lift,
 * arrows to move, Space to drop.
 *
 * The switch is the same setSectionVisible action the eye button called,
 * drawn the mockup's way: 36×20, green when the band is on the page.
 *
 * Every row still says who owns its content and links there (the outline
 * in lib/home-outline.ts) — this list orders the page; it does not edit
 * the bands, most of which are other pages' content shown again.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Lock, Pencil, Sparkles } from "lucide-react";
import { reorderSections, setSectionVisible } from "@/app/[locale]/admin/(content)/pages/home/sections/actions";
import { showUndoToast } from "@/components/admin/UndoToast";

export type HomeListEditor = { href: string; label: string };

export type HomeListRow = {
  /** HomeSection id for a managed row; the outline key for a pinned one. */
  id: string;
  /** The section's stored key, shown in mono under its name. */
  code: string;
  label: string;
  editors: HomeListEditor[];
  /** For a row filled automatically: where from. */
  autoNote: string | null;
  isVisible: boolean;
};

export type PinnedRow = {
  key: string;
  label: string;
  /** "3 สไลด์ · 5 วินาที/สไลด์" — already formatted. */
  summary: string | null;
  /** "ขาด TH/ZH/RU", or null when every language is there. */
  missing: string | null;
  editHref: string | null;
};

type Labels = {
  title: string;
  hint: string;
  drag: string;
  edit: string;
  visible: string;
  hidden: string;
  pinned: string;
  saveFailed: string;
};

export default function HomeSectionList({
  locale,
  top,
  bottom,
  rows: initialRows,
  canWrite,
  labels,
}: {
  locale: string;
  top: PinnedRow;
  bottom: PinnedRow;
  rows: HomeListRow[];
  canWrite: boolean;
  labels: Labels;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [, startTransition] = useTransition();

  // A server refresh (another tab, a revalidated action) replaces whatever
  // this list drifted to locally.
  useEffect(() => setRows(initialRows), [initialRows]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const previous = rows;
    const from = rows.findIndex((row) => row.id === active.id);
    const to = rows.findIndex((row) => row.id === over.id);
    const next = arrayMove(rows, from, to);
    setRows(next);
    startTransition(async () => {
      const result = await reorderSections(
        locale,
        next.map((row) => row.id),
      );
      if (!result.ok) {
        setRows(previous);
        showUndoToast({ message: labels.saveFailed });
        return;
      }
      router.refresh();
    });
  };

  const toggle = (row: HomeListRow) => {
    setRows((current) =>
      current.map((candidate) => (candidate.id === row.id ? { ...candidate, isVisible: !row.isVisible } : candidate)),
    );
    startTransition(async () => {
      await setSectionVisible(locale, row.id, !row.isVisible);
      router.refresh();
    });
  };

  return (
    <section className="admin-card overflow-hidden p-0!">
      <div className="border-b border-adm-line px-[18px] py-3.5">
        <h2 className="text-[15px] font-semibold text-adm-text">
          {labels.title} <span className="text-xs font-normal text-adm-muted">{labels.hint}</span>
        </h2>
      </div>

      <div className="space-y-2 p-3.5">
        <Pinned row={top} labels={labels} />

        <DndContext id="home-sections" sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={rows.map((row) => row.id)} strategy={verticalListSortingStrategy}>
            <ol className="space-y-2">
              {rows.map((row, index) => (
                <SortableRow
                  key={row.id}
                  row={row}
                  index={index}
                  canWrite={canWrite}
                  labels={labels}
                  onToggle={() => toggle(row)}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>

        <Pinned row={bottom} labels={labels} />
      </div>
    </section>
  );
}

function Pinned({ row, labels }: { row: PinnedRow; labels: Labels }) {
  return (
    <div className="flex items-center gap-3 rounded-[12px] border border-adm-fill/40 bg-adm-fill/5 px-3.5 py-3">
      <Lock size={14} aria-label={labels.pinned} className="shrink-0 text-adm-accent-ink" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-adm-text">{row.label}</span>
        {row.summary && <span className="block truncate text-xs text-adm-muted">{row.summary}</span>}
      </span>
      {row.missing && (
        <span className="shrink-0 rounded-full bg-adm-warning-bg px-2 py-0.5 text-[11px] font-medium text-adm-warning">
          {row.missing}
        </span>
      )}
      {row.editHref && (
        <Link href={row.editHref} className="admin-btn-ghost admin-btn-sm shrink-0">
          {labels.edit}
        </Link>
      )}
    </div>
  );
}

function SortableRow({
  row,
  index,
  canWrite,
  labels,
  onToggle,
}: {
  row: HomeListRow;
  index: number;
  canWrite: boolean;
  labels: Labels;
  onToggle: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id,
    disabled: !canWrite,
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={[
        "flex items-center gap-3 rounded-[12px] border bg-adm-solid px-3 py-2.5",
        isDragging ? "relative z-10 border-adm-fill/60 shadow-[var(--adm-shadow-float)]" : "border-adm-line",
        row.isVisible ? "" : "opacity-60",
      ].join(" ")}
    >
      {canWrite ? (
        <button
          type="button"
          aria-label={`${labels.drag}: ${row.label}`}
          className="cursor-grab touch-none rounded-[6px] p-1 text-adm-muted hover:bg-adm-text/6 hover:text-adm-text active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical size={15} aria-hidden />
        </button>
      ) : (
        <span className="w-[23px]" aria-hidden />
      )}
      <span className="admin-mono w-6 shrink-0 text-xs text-adm-muted">{String(index + 1).padStart(2, "0")}</span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-adm-text">{row.label}</span>
        <span className="admin-mono block truncate text-[10.5px] text-adm-muted">{row.code}</span>
        {row.autoNote ? (
          <span className="mt-0.5 flex items-center gap-1 text-[11.5px] text-adm-muted">
            <Sparkles size={11} aria-hidden className="shrink-0 text-adm-accent-ink" />
            <span className="truncate">{row.autoNote}</span>
          </span>
        ) : (
          <span className="mt-0.5 flex flex-wrap gap-x-2.5 text-[11.5px]">
            {row.editors.map((editor) => (
              <Link key={editor.href} href={editor.href} className="text-adm-accent-ink hover:underline">
                {editor.label}
              </Link>
            ))}
          </span>
        )}
      </span>

      <button
        type="button"
        role="switch"
        aria-checked={row.isVisible}
        aria-label={`${row.isVisible ? labels.visible : labels.hidden}: ${row.label}`}
        title={row.isVisible ? labels.visible : labels.hidden}
        disabled={!canWrite}
        onClick={onToggle}
        className={[
          "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
          row.isVisible ? "bg-adm-success" : "bg-adm-text/20",
        ].join(" ")}
      >
        <span
          className={[
            "inline-block h-3.5 w-3.5 rounded-full bg-white shadow-xs transition-transform",
            row.isVisible ? "translate-x-[18px]" : "translate-x-[3px]",
          ].join(" ")}
        />
      </button>

      {row.editors[0] && (
        <Link
          href={row.editors[0].href}
          aria-label={`${labels.edit}: ${row.label}`}
          className="admin-btn-quiet admin-btn-sm shrink-0"
        >
          <Pencil size={13} aria-hidden />
        </Link>
      )}
    </li>
  );
}
