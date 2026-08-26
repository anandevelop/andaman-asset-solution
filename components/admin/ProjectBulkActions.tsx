"use client";

/**
 * components/admin/ProjectBulkActions.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Selection checkboxes and the bulk publish/unpublish bar.
 *
 * Owns the table body rather than sitting beside it, because the header
 * checkbox, the row checkboxes and the action bar all read the same
 * selection. Threading that through a server component would mean lifting
 * the whole table into client state; passing the rows in as a prop keeps
 * the data fetching on the server where it belongs.
 *
 * The action bar only appears once something is selected — a permanently
 * visible toolbar full of disabled buttons is noise on the 95% of visits
 * that are just looking at the list.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  AlertCircle,
  Check,
  Eye,
  EyeOff,
  HardHat,
  Loader2,
  Pencil,
  X,
} from "lucide-react";
import { bulkSetPublished } from "@/app/[locale]/admin/projects/actions";
import SaveToast from "@/components/admin/SaveToast";

export type ProjectRow = {
  id: string;
  slug: string;
  name: string;
  location: string;
  propertyTypeLabel: string;
  statusLabel: string;
  isPublished: boolean;
  updatedAt: string;
  progressCount: number;
};

type Props = {
  locale: string;
  rows: ProjectRow[];
  labels: {
    name: string;
    propertyType: string;
    status: string;
    published: string;
    draft: string;
    updated: string;
    edit: string;
    selectAll: string;
    selectRow: string;
    publish: string;
    unpublish: string;
    clear: string;
    error: string;
    done: string;
  };
};

export default function ProjectBulkActions({ locale, rows, labels }: Props) {
  const t = useTranslations("admin.common");
  // The admin sits inside NextIntlClientProvider, so the pluralised count
  // is formatted here rather than being string-patched on the server.
  const tBulk = useTranslations("admin.projects.bulk");
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [state, setState] = useState<"idle" | "done" | "error">("idle");
  const [pending, startTransition] = useTransition();

  const allSelected = rows.length > 0 && selected.size === rows.length;
  // Drives the header checkbox's indeterminate state.
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
    setSelected(allSelected ? new Set() : new Set(rows.map((row) => row.id)));
  };

  const run = (isPublished: boolean) => {
    setState("idle");

    startTransition(async () => {
      const result = await bulkSetPublished(locale, [...selected], isPublished);

      if (!result.ok) {
        setState("error");
        return;
      }

      setSelected(new Set());
      setState("done");

      // The server action revalidates the cache; refresh pulls the new
      // rows without a full navigation.
      router.refresh();
      setTimeout(() => setState("idle"), 2500);
    });
  };

  return (
    <>
      {/* ── Action bar ────────────────────────────────────────────── */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-sm border border-accent/30 bg-accent/[0.07] px-4 py-3">
          <span className="text-sm font-medium text-primary">
            {tBulk("selected", { count: selected.size })}
          </span>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => run(true)}
              disabled={pending}
              className="admin-btn !py-2"
            >
              {pending ? (
                <Loader2 size={14} className="animate-spin" aria-hidden />
              ) : (
                <Eye size={14} aria-hidden />
              )}
              {labels.publish}
            </button>

            <button
              type="button"
              onClick={() => run(false)}
              disabled={pending}
              className="admin-btn-ghost !py-2"
            >
              <EyeOff size={14} aria-hidden />
              {labels.unpublish}
            </button>

            <button
              type="button"
              onClick={() => setSelected(new Set())}
              disabled={pending}
              aria-label={labels.clear}
              className="p-1.5 text-ink-muted transition-colors hover:text-primary"
            >
              <X size={16} aria-hidden />
            </button>
          </div>
        </div>
      )}

      {state === "done" && (
        <SaveToast tone="success" token={state}>
          <Check size={15} aria-hidden />
          {labels.done}
        </SaveToast>
      )}

      {state === "error" && (
        <SaveToast tone="error" token={state}>
          <AlertCircle size={15} aria-hidden />
          {labels.error}
        </SaveToast>
      )}

      {/* ── Table ─────────────────────────────────────────────────── */}
      <div className="overflow-x-auto rounded-sm border border-primary/10 bg-surface-raised shadow-card">
        <table className="w-full min-w-[880px] border-collapse">
          <thead className="border-b border-primary/10 bg-surface-muted">
            <tr>
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
                  className="h-4 w-4 rounded-sm border-primary/30 text-primary focus:ring-primary/30"
                />
              </th>
              <th className="admin-th">{labels.name}</th>
              <th className="admin-th">{labels.propertyType}</th>
              <th className="admin-th">{labels.status}</th>
              <th className="admin-th">{labels.published}</th>
              <th className="admin-th">{labels.updated}</th>
              <th className="admin-th" />
            </tr>
          </thead>

          <tbody className="divide-y divide-primary/5">
            {rows.map((row) => {
              const isSelected = selected.has(row.id);

              return (
                <tr
                  key={row.id}
                  className={`transition-colors ${
                    isSelected ? "bg-accent/[0.05]" : "hover:bg-surface-muted/60"
                  }`}
                >
                  <td className="admin-td">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleRow(row.id)}
                      aria-label={`${labels.selectRow}: ${row.name}`}
                      className="h-4 w-4 rounded-sm border-primary/30 text-primary focus:ring-primary/30"
                    />
                  </td>

                  <td className="admin-td">
                    <p className="font-medium text-primary">{row.name}</p>
                    <p className="mt-0.5 font-mono text-xs text-ink-muted">
                      /{row.slug}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-muted">{row.location}</p>
                  </td>

                  <td className="admin-td whitespace-nowrap text-ink-muted">
                    {row.propertyTypeLabel}
                  </td>

                  <td className="admin-td whitespace-nowrap text-ink-muted">
                    {row.statusLabel}
                  </td>

                  <td className="admin-td whitespace-nowrap">
                    <span
                      className={
                        row.isPublished
                          ? "rounded-sm bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800"
                          : "rounded-sm bg-surface-muted px-2 py-1 text-xs font-medium text-ink-muted"
                      }
                    >
                      {row.isPublished ? labels.published : labels.draft}
                    </span>
                  </td>

                  <td className="admin-td whitespace-nowrap text-xs text-ink-muted">
                    {row.updatedAt}
                  </td>

                  <td className="admin-td whitespace-nowrap text-right">
                    <div className="flex justify-end gap-3">
                      <Link
                        href={`/${locale}/admin/progress/${row.id}`}
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
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <span className="sr-only" role="status">
        {pending ? t("saving") : ""}
      </span>
    </>
  );
}
