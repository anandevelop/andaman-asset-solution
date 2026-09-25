"use client";

/**
 * components/admin/ProjectsTable.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The admin Projects index table (Projects.dc.html): selection, the bulk
 * bar, the per-row publish switch, and drag-to-reorder.
 *
 * Owns the table body rather than sitting beside it, because the header
 * checkbox, the row checkboxes, the bulk bar and the drag order all read
 * the same selection state. Everything it renders is prepared on the
 * server — dates formatted, enums translated, rows serialised — so no
 * Decimal or Date crosses the boundary.
 *
 * Publishing goes through bulkSetPublished with a single id rather than a
 * new one-row action, which keeps the draft→review→publish gate
 * (lib/publishing-gate.ts) in exactly one place. That action reports how
 * many rows it actually changed, so a switch flipped on a project still in
 * review reports the refusal instead of animating a state the database
 * never took.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
import {
  AlertCircle,
  ArrowUpDown,
  Check,
  Download,
  Eye,
  EyeOff,
  GripVertical,
  HardHat,
  ImageOff,
  Loader2,
  Pencil,
} from "lucide-react";
import { bulkSetPublished, reorderProjects } from "@/app/[locale]/admin/(catalog)/projects/actions";
import SaveToast from "@/components/admin/SaveToast";

export type UnitTallyView =
  | { kind: "counted"; available: number; reserved: number; sold: number; total: number }
  | { kind: "notEntered"; total: number }
  | { kind: "none" };

export type ProjectTableRow = {
  id: string;
  slug: string;
  name: string;
  location: string;
  thumbnailUrl: string | null;
  typeLabel: string;
  status: "UPCOMING" | "UNDER_CONSTRUCTION" | "READY_TO_MOVE_IN" | "SOLD_OUT";
  statusLabel: string;
  isPublished: boolean;
  contentStatus: "DRAFT" | "IN_REVIEW" | "PUBLISHED";
  units: UnitTallyView;
  /** "18 / 32 available", "not entered yet", "not sold by unit" — decided
   *  and translated on the server, where the tally is already known. */
  unitsLabel: string;
  locales: { locale: string; fill: "complete" | "partial" | "missing" }[];
  /** Already relative ("2 hours ago") — see lib/relative-time.ts. */
  lastEditedLabel: string;
  lastEditedBy: string | null;
  progressCount: number;
};

type Props = {
  locale: string;
  rows: ProjectTableRow[];
  /** Where the first row sits in the whole list — the offset reorder needs
   *  so page 2 writes 25… rather than 0…. */
  startIndex: number;
  /** False while any filter, search or non-custom sort is active: the rows
   *  on screen are then not adjacent in the real order, so a drag has no
   *  coherent set of positions to write. */
  reorderable: boolean;
  /** Current filter query string, forwarded to the CSV export so it sends
   *  back the view rather than the whole table. */
  filterQuery: string;
  labels: {
    columnProject: string;
    columnLocation: string;
    columnType: string;
    columnStatus: string;
    columnUnits: string;
    columnLanguages: string;
    columnPublished: string;
    columnUpdated: string;
    selectAll: string;
    selectRow: string;
    publish: string;
    unpublish: string;
    reorder: string;
    reorderDone: string;
    reorderHint: string;
    reorderUnavailable: string;
    dragRow: string;
    exportCsv: string;
    clear: string;
    edit: string;
    progress: string;
    draftBadge: string;
    reviewBadge: string;
    awaitingReview: string;
    publishBlocked: string;
    noImage: string;
    done: string;
    error: string;
    exportFailed: string;
  };
};

const STATUS_TONE: Record<ProjectTableRow["status"], string> = {
  UPCOMING: "bg-accent/15 text-accent-800",
  UNDER_CONSTRUCTION: "bg-sky-50 text-sky-800",
  READY_TO_MOVE_IN: "bg-emerald-50 text-emerald-800",
  SOLD_OUT: "bg-surface-muted text-ink-muted",
};

const FILL_TONE: Record<"complete" | "partial" | "missing", string> = {
  complete: "bg-primary text-white",
  partial: "bg-accent/25 text-accent-800",
  missing: "bg-surface-muted text-ink-muted/70",
};

/** The bar under the availability figure: available, then reserved, then
 *  sold — left to right in the order a unit moves through them. */
function UnitBar({ units, label }: { units: UnitTallyView; label: string }) {
  if (units.kind !== "counted") return null;

  const percent = (value: number) => `${(value / units.total) * 100}%`;

  return (
    <span
      className="flex h-1.5 w-20 overflow-hidden rounded-full bg-surface-muted"
      role="img"
      aria-label={label}
    >
      <span className="bg-emerald-500" style={{ width: percent(units.available) }} />
      <span className="bg-accent" style={{ width: percent(units.reserved) }} />
      <span className="bg-primary/25" style={{ width: percent(units.sold) }} />
    </span>
  );
}

function SortableRow({
  row,
  children,
  className,
  reordering,
  dragLabel,
}: {
  row: ProjectTableRow;
  children: React.ReactNode;
  className: string;
  reordering: boolean;
  dragLabel: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id,
    disabled: !reordering,
  });

  return (
    <tr
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        // Lift the dragged row above its neighbours.
        position: isDragging ? "relative" : undefined,
        zIndex: isDragging ? 10 : undefined,
      }}
      className={`${className} ${isDragging ? "opacity-90 shadow-cardHover" : ""}`}
    >
      {reordering && (
        <td className="admin-td w-8">
          <button
            type="button"
            aria-label={`${dragLabel}: ${row.name}`}
            className="cursor-grab text-ink-muted hover:text-primary active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <GripVertical size={15} aria-hidden />
          </button>
        </td>
      )}
      {children}
    </tr>
  );
}

export default function ProjectsTable({
  locale,
  rows,
  startIndex,
  reorderable,
  filterQuery,
  labels,
}: Props) {
  const t = useTranslations("admin.common");
  // The admin sits inside NextIntlClientProvider, so the pluralised
  // selection count is formatted here rather than string-patched on the
  // server — it changes with every checkbox.
  const tBulk = useTranslations("admin.projects.bulk");
  const router = useRouter();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [ordered, setOrdered] = useState(rows);
  const [reordering, setReordering] = useState(false);
  const [state, setState] = useState<"idle" | "done" | "error" | "blocked">("idle");
  const [busyRow, setBusyRow] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [pending, startTransition] = useTransition();

  // A server refresh is the source of truth for the order; local drag
  // state only stands in between the drop and the refresh landing.
  useEffect(() => {
    setOrdered(rows);
  }, [rows]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const allSelected = ordered.length > 0 && selected.size === ordered.length;
  const someSelected = selected.size > 0 && !allSelected;

  const toggleRow = (id: string) => {
    setState("idle");
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setState("idle");
    setSelected(allSelected ? new Set() : new Set(ordered.map((row) => row.id)));
  };

  const runPublish = (ids: string[], isPublished: boolean, rowId?: string) => {
    setState("idle");
    setBusyRow(rowId ?? null);

    startTransition(async () => {
      const result = await bulkSetPublished(locale, ids, isPublished);
      setBusyRow(null);

      if (!result.ok) {
        setState("error");
        return;
      }

      // The gate refused every row it was asked to publish — say so rather
      // than reporting a success that changed nothing.
      if (isPublished && result.updated === 0) {
        setState("blocked");
        return;
      }

      if (!rowId) setSelected(new Set());
      setState("done");
      router.refresh();
      setTimeout(() => setState("idle"), 2500);
    });
  };

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const from = ordered.findIndex((row) => row.id === active.id);
    const to = ordered.findIndex((row) => row.id === over.id);
    if (from === -1 || to === -1) return;

    const next = arrayMove(ordered, from, to);
    setOrdered(next);
    setState("idle");

    startTransition(async () => {
      const result = await reorderProjects(
        locale,
        next.map((row) => row.id),
        startIndex,
      );

      if (!result.ok) {
        // Put the rows back where they were rather than leaving the screen
        // showing an order the database does not have.
        setOrdered(rows);
        setState("error");
        return;
      }

      setState("done");
      router.refresh();
      setTimeout(() => setState("idle"), 2500);
    });
  };

  /*
    Fetching to a blob rather than a plain <a download>: the export can
    come back 403 or 429, and a link would simply do nothing in either
    case. Same approach as LeadExportButton.
  */
  const exportCsv = async () => {
    setExporting(true);

    try {
      const params = new URLSearchParams(filterQuery);
      params.delete("page");
      params.delete("perPage");
      if (selected.size > 0) params.set("ids", [...selected].join(","));

      const query = params.toString();
      const response = await fetch(`/api/admin/projects/export${query ? `?${query}` : ""}`);

      if (!response.ok) {
        setState("error");
        return;
      }

      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") ?? "";
      const match = /filename="([^"]+)"/.exec(disposition);

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = match?.[1] ?? "projects.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setState("error");
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      {/* ── Bulk bar ───────────────────────────────────────────────── */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xs bg-primary px-4 py-3 text-white">
          <span className="text-sm font-semibold">{tBulk("selected", { count: selected.size })}</span>

          <button
            type="button"
            onClick={() => runPublish([...selected], true)}
            disabled={pending}
            className="flex items-center gap-1.5 text-sm text-white/85 transition-colors hover:text-white disabled:opacity-50"
          >
            {pending && !busyRow ? (
              <Loader2 size={14} className="animate-spin" aria-hidden />
            ) : (
              <Eye size={14} aria-hidden />
            )}
            {labels.publish}
          </button>

          <button
            type="button"
            onClick={() => runPublish([...selected], false)}
            disabled={pending}
            className="flex items-center gap-1.5 text-sm text-white/85 transition-colors hover:text-white disabled:opacity-50"
          >
            <EyeOff size={14} aria-hidden />
            {labels.unpublish}
          </button>

          <button
            type="button"
            onClick={() => setReordering((value) => !value)}
            disabled={pending || !reorderable}
            title={reorderable ? undefined : labels.reorderUnavailable}
            className="flex items-center gap-1.5 text-sm text-white/85 transition-colors hover:text-white disabled:opacity-40"
          >
            <ArrowUpDown size={14} aria-hidden />
            {reordering ? labels.reorderDone : labels.reorder}
          </button>

          <button
            type="button"
            onClick={exportCsv}
            disabled={exporting}
            className="flex items-center gap-1.5 text-sm text-white/85 transition-colors hover:text-white disabled:opacity-50"
          >
            {exporting ? (
              <Loader2 size={14} className="animate-spin" aria-hidden />
            ) : (
              <Download size={14} aria-hidden />
            )}
            {labels.exportCsv}
          </button>

          <button
            type="button"
            onClick={() => {
              setSelected(new Set());
              setReordering(false);
            }}
            disabled={pending}
            className="ml-auto text-sm font-medium text-accent-200 transition-colors hover:text-white"
          >
            {labels.clear}
          </button>
        </div>
      )}

      {reordering && (
        <p className="rounded-xs border border-accent/30 bg-accent/[0.07] px-4 py-2.5 text-xs text-accent-800">
          {labels.reorderHint}
        </p>
      )}

      {state === "done" && (
        <SaveToast tone="success" token={state}>
          <Check size={15} aria-hidden />
          {labels.done}
        </SaveToast>
      )}

      {state === "blocked" && (
        <SaveToast tone="error" token={state}>
          <AlertCircle size={15} aria-hidden />
          {labels.publishBlocked}
        </SaveToast>
      )}

      {state === "error" && (
        <SaveToast tone="error" token={state}>
          <AlertCircle size={15} aria-hidden />
          {labels.error}
        </SaveToast>
      )}

      {/* ── Table ──────────────────────────────────────────────────── */}
      <div className="overflow-x-auto rounded-xs border border-primary/10 bg-surface-raised shadow-card">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <table className="w-full min-w-[1040px] border-collapse">
            <thead className="border-b border-primary/10 bg-surface-muted">
              <tr>
                {reordering && <th className="admin-th w-8" />}
                <th className="admin-th w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(node) => {
                      // Indeterminate is a DOM property, not an attribute —
                      // React cannot set it declaratively.
                      if (node) node.indeterminate = someSelected;
                    }}
                    onChange={toggleAll}
                    aria-label={labels.selectAll}
                    className="h-4 w-4 rounded-xs border-primary/30 text-primary focus:ring-primary/30"
                  />
                </th>
                <th className="admin-th">{labels.columnProject}</th>
                <th className="admin-th">{labels.columnLocation}</th>
                <th className="admin-th">{labels.columnType}</th>
                <th className="admin-th">{labels.columnStatus}</th>
                <th className="admin-th">{labels.columnUnits}</th>
                <th className="admin-th">{labels.columnLanguages}</th>
                <th className="admin-th">{labels.columnPublished}</th>
                <th className="admin-th">{labels.columnUpdated}</th>
                <th className="admin-th" />
              </tr>
            </thead>

            <SortableContext
              items={ordered.map((row) => row.id)}
              strategy={verticalListSortingStrategy}
            >
              <tbody className="divide-y divide-primary/5">
                {ordered.map((row) => {
                  const isSelected = selected.has(row.id);
                  const inWorkflow = row.contentStatus !== "PUBLISHED";

                  return (
                    <SortableRow
                      key={row.id}
                      row={row}
                      reordering={reordering}
                      dragLabel={labels.dragRow}
                      className={`transition-colors ${
                        isSelected
                          ? "bg-accent/5"
                          : inWorkflow
                            ? "bg-accent/3 hover:bg-accent/6"
                            : "hover:bg-surface-muted/60"
                      }`}
                    >
                      <td className="admin-td">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleRow(row.id)}
                          aria-label={`${labels.selectRow}: ${row.name}`}
                          className="h-4 w-4 rounded-xs border-primary/30 text-primary focus:ring-primary/30"
                        />
                      </td>

                      <td className="admin-td">
                        <div className="flex items-center gap-3">
                          <span className="relative flex h-10 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xs bg-surface-muted">
                            {row.thumbnailUrl ? (
                              /* Plain <img>, like every other admin
                                 thumbnail (MediaLibrary, ImageUploader):
                                 next/image would refuse any host missing
                                 from remotePatterns and take the row down
                                 with it, for a 56px preview nobody
                                 downloads twice. */
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={row.thumbnailUrl}
                                alt=""
                                loading="lazy"
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <ImageOff size={14} className="text-ink-muted" aria-label={labels.noImage} />
                            )}
                          </span>

                          <span className="min-w-0 max-w-[200px]">
                            <span className="flex flex-wrap items-center gap-1.5">
                              <Link
                                href={`/${locale}/admin/projects/${row.id}/edit`}
                                className="font-medium text-primary hover:text-accent-800"
                              >
                                {row.name}
                              </Link>
                              {inWorkflow && (
                                <span className="rounded-xs bg-accent/20 px-1.5 py-0.5 text-[11px] font-semibold text-accent-800">
                                  {row.contentStatus === "DRAFT"
                                    ? labels.draftBadge
                                    : labels.reviewBadge}
                                </span>
                              )}
                            </span>
                            <span className="mt-0.5 block truncate font-mono text-xs text-ink-muted">
                              /projects/{row.slug}
                              {inWorkflow && !row.isPublished && ` · ${labels.awaitingReview}`}
                            </span>
                          </span>
                        </div>
                      </td>

                      {/* Locations run long ("Laguna Area (Ban
                          Don-Cherngtalay, Phuket)"); left unbounded they
                          push the language and publish columns off the
                          right edge on a laptop. */}
                      <td className="admin-td max-w-[150px] truncate text-ink-muted" title={row.location}>
                        {row.location}
                      </td>

                      <td className="admin-td whitespace-nowrap text-ink-muted">{row.typeLabel}</td>

                      <td className="admin-td whitespace-nowrap">
                        <span
                          className={`rounded-xs px-2 py-1 text-xs font-medium ${STATUS_TONE[row.status]}`}
                        >
                          {row.statusLabel}
                        </span>
                      </td>

                      <td className="admin-td whitespace-nowrap">
                        {row.units.kind === "counted" ? (
                          <span className="flex items-center gap-2">
                            <UnitBar units={row.units} label={row.unitsLabel} />
                            <span className="text-xs tabular-nums text-ink-muted">
                              {row.units.available} / {row.units.total}
                            </span>
                          </span>
                        ) : (
                          <span className="text-xs text-ink-muted/70">{row.unitsLabel}</span>
                        )}
                      </td>

                      <td className="admin-td whitespace-nowrap">
                        <span className="flex gap-1">
                          {row.locales.map(({ locale: code, fill }) => (
                            <span
                              key={code}
                              className={`rounded-xs px-1.5 py-0.5 text-[11px] font-semibold uppercase ${FILL_TONE[fill]}`}
                            >
                              {code}
                            </span>
                          ))}
                        </span>
                      </td>

                      <td className="admin-td">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={row.isPublished}
                          aria-label={`${labels.columnPublished}: ${row.name}`}
                          disabled={pending}
                          onClick={() => runPublish([row.id], !row.isPublished, row.id)}
                          className={[
                            "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
                            row.isPublished ? "bg-emerald-500" : "bg-primary/20",
                          ].join(" ")}
                        >
                          <span
                            className={[
                              "inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-xs transition-transform",
                              row.isPublished ? "translate-x-[18px]" : "translate-x-[3px]",
                            ].join(" ")}
                          >
                            {busyRow === row.id && (
                              <Loader2 size={14} className="animate-spin text-primary" aria-hidden />
                            )}
                          </span>
                        </button>
                      </td>

                      {/* Time above name rather than one long line: the
                          editor's full name is what makes this column the
                          widest one otherwise. */}
                      <td className="admin-td max-w-[130px] text-xs text-ink-muted">
                        <span className="block whitespace-nowrap">{row.lastEditedLabel}</span>
                        {row.lastEditedBy && (
                          <span className="block truncate text-ink-muted/80" title={row.lastEditedBy}>
                            {row.lastEditedBy}
                          </span>
                        )}
                      </td>

                      <td className="admin-td whitespace-nowrap text-right">
                        <span className="flex justify-end gap-3">
                          <Link
                            href={`/${locale}/admin/projects/${row.id}/progress`}
                            aria-label={`${labels.progress}: ${row.name}`}
                            className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-primary"
                          >
                            <HardHat size={14} aria-hidden />
                            {row.progressCount}
                          </Link>

                          <Link
                            href={`/${locale}/admin/projects/${row.id}/edit`}
                            className="inline-flex items-center gap-1.5 text-sm text-accent-700 hover:text-accent-800"
                          >
                            <Pencil size={14} aria-hidden />
                            {labels.edit}
                          </Link>
                        </span>
                      </td>
                    </SortableRow>
                  );
                })}
              </tbody>
            </SortableContext>
          </table>
        </DndContext>
      </div>

      <span className="sr-only" role="status">
        {pending ? t("saving") : ""}
      </span>
    </>
  );
}
