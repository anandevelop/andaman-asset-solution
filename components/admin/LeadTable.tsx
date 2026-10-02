"use client";

/**
 * components/admin/LeadTable.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The leads table: one row per lead, a checkbox to gather rows for the
 * bulk bar, and a click anywhere else on the row to open it in the drawer.
 *
 * PDPA: rows carry the phone number masked (lib/contact-mask.ts, applied on
 * the server) and no email at all — the full values never reach this
 * component. Revealing one is the drawer's job, and is audited there.
 *
 * Every change here is tier 1 (see UndoToast): status from the pill, owner
 * from the owner cell, and both again in bulk. The bulk bar has no delete:
 * leads are not deleted from the back office (see bulkUpdateLeads).
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { LeadStatus } from "@prisma/client";
import { Clock, Download, Lock, UserPlus, X } from "lucide-react";
import { assignLead, bulkUpdateLeads } from "@/app/[locale]/admin/(crm)/leads/actions";
import { LEAD_STATUS_DOT } from "@/lib/admin/lead-status-tone";
import LeadStatusSelect from "@/components/admin/LeadStatusSelect";
import PopoverMenu from "@/components/admin/PopoverMenu";
import { showUndoToast } from "@/components/admin/UndoToast";
import AdminImage from "@/components/admin/ui/AdminImage";
import Avatar from "@/components/admin/ui/Avatar";

export type LeadRowView = {
  id: string;
  name: string;
  maskedPhone: string;
  commsLanguage: string | null;
  /** The customer's nationality as a flag and its name, when known. */
  nationality: { flagSrc: string | null; label: string } | null;
  projectName: string | null;
  projectImage: string | null;
  sourceLabel: string;
  status: LeadStatus;
  assignee: { id: string; name: string } | null;
  receivedIso: string;
  receivedLabel: string;
  ageLabel: string;
  /** Past the response SLA and still NEW. */
  late: boolean;
  consentGiven: boolean;
};

type Labels = {
  selectAll: string;
  customer: string;
  interest: string;
  channel: string;
  status: string;
  owner: string;
  receivedAt: string;
  pdpaNote: string;
  assign: string;
  unassign: string;
  noProject: string;
  noConsent: string;
  bulkAssign: string;
  bulkStatus: string;
  bulkExport: string;
  bulkClear: string;
  unassigned: string;
  failed: string;
};

type Props = {
  locale: string;
  rows: LeadRowView[];
  leadHrefBase: string;
  /** Who a row may be given to. For SALES: themselves only — the action
   *  would refuse anyone else, so the menu does not offer them. */
  assignees: { id: string; name: string }[];
  statusLabels: Record<LeadStatus, string>;
  /** exportCustomerData — ADMIN and above. */
  canExport: boolean;
  labels: Labels;
};

export default function LeadTable({ locale, rows, leadHrefBase, assignees, statusLabels, canExport, labels }: Props) {
  const router = useRouter();
  // Messages with placeholders are filled here, where the values are.
  const t = useTranslations("admin.leads");
  const [picked, setSelected] = useState<Set<string>>(() => new Set());
  const [, startTransition] = useTransition();

  const byId = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);
  /* A refresh (after any change, or a filter) can drop rows. The selection
     is read through the rows on screen, so it can never act on one that
     has gone — derived, rather than pruned in an effect. */
  const selected = useMemo(() => new Set([...picked].filter((id) => byId.has(id))), [picked, byId]);
  const allSelected = rows.length > 0 && selected.size === rows.length;

  const toggle = (id: string) =>
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const assigneeOptions = [
    ...assignees.map((person) => ({ value: person.id, label: person.name })),
    { value: "", label: labels.unassign },
  ];

  /** Apply `changes`; offer to put back `previous`. Both through
   *  bulkUpdateLeads, so every row is checked on its own. */
  const applyBulk = (
    changes: { id: string; status?: LeadStatus; assignedToId?: string }[],
    previous: { id: string; status?: LeadStatus; assignedToId?: string }[],
  ) =>
    startTransition(async () => {
      const result = await bulkUpdateLeads(locale, changes);
      if (!result.ok || result.changed.length === 0) {
        showUndoToast({ message: labels.failed });
        return;
      }
      setSelected(new Set());
      router.refresh();
      const done = new Set(result.changed);
      showUndoToast({
        message:
          result.refused.length > 0
            ? t("bulk.partial", {
                changed: result.changed.length,
                refused: result.refused.length,
              })
            : t("bulk.done", { count: result.changed.length }),
        onUndo: async () => {
          const reverted = await bulkUpdateLeads(
            locale,
            previous.filter((change) => done.has(change.id)),
          );
          if (!reverted.ok) throw new Error("undo refused");
          router.refresh();
        },
      });
    });

  const selectedRows = [...selected].map((id) => byId.get(id)).filter((row): row is LeadRowView => Boolean(row));

  const assignOne = (row: LeadRowView, assignedToId: string) =>
    startTransition(async () => {
      const previous = row.assignee?.id ?? "";
      const result = await assignLead(locale, row.id, assignedToId);
      if (!result.ok) {
        showUndoToast({ message: labels.failed });
        return;
      }
      router.refresh();
      const who = assignees.find((person) => person.id === assignedToId)?.name;
      showUndoToast({
        message: who ? t("table.assigned", { name: who }) : labels.unassigned,
        onUndo: async () => {
          if (!(await assignLead(locale, row.id, previous)).ok) throw new Error("undo refused");
          router.refresh();
        },
      });
    });

  /** The row opens the drawer, except where the click was on something
   *  that has its own job — the checkbox, a menu, a link. */
  const openRow = (event: React.MouseEvent, id: string) => {
    if ((event.target as HTMLElement).closest("a, button, input, label, [role='menu']")) return;
    router.push(`${leadHrefBase}${id}`, { scroll: false });
  };

  return (
    <div className="space-y-3">
      {selected.size > 0 && (
        /* A card of its own above the table, sticky under the 60px topbar
           so it stays in reach while the rest of a long selection is
           scrolled to. */
        <div className="admin-card sticky top-[68px] z-20 flex flex-wrap items-center gap-2 border-adm-fill/40! px-4! py-2.5! text-sm">
          <span className="font-medium tabular-nums text-adm-text">{t("bulk.selected", { count: selected.size })}</span>
          <span className="ml-auto" aria-hidden />
          <PopoverMenu
            label={labels.bulkAssign}
            buttonClassName="admin-btn-ghost admin-btn-sm"
            buttonContent={
              <>
                <UserPlus size={14} aria-hidden />
                {labels.bulkAssign}
              </>
            }
            options={assigneeOptions}
            onSelect={(assignedToId) =>
              applyBulk(
                selectedRows.map((row) => ({ id: row.id, assignedToId })),
                selectedRows.map((row) => ({
                  id: row.id,
                  assignedToId: row.assignee?.id ?? "",
                })),
              )
            }
          />
          <PopoverMenu
            label={labels.bulkStatus}
            buttonClassName="admin-btn-ghost admin-btn-sm"
            buttonContent={labels.bulkStatus}
            options={Object.values(LeadStatus).map((status) => ({
              value: status,
              label: statusLabels[status],
              dotClassName: LEAD_STATUS_DOT[status],
            }))}
            onSelect={(status) =>
              applyBulk(
                selectedRows.map((row) => ({
                  id: row.id,
                  status: status as LeadStatus,
                })),
                selectedRows.map((row) => ({ id: row.id, status: row.status })),
              )
            }
          />
          {canExport && (
            <a
              href={`/api/admin/leads/export?ids=${selectedRows.map((row) => row.id).join(",")}`}
              className="admin-btn-ghost admin-btn-sm"
            >
              <Download size={14} aria-hidden />
              {labels.bulkExport}
            </a>
          )}
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="admin-btn-quiet admin-btn-sm"
          >
            <X size={14} aria-hidden />
            {labels.bulkClear}
          </button>
        </div>
      )}

      {/* Scrolls inside the card, never the page (Phase H's mobile rule). */}
      <div className="admin-card overflow-x-auto p-0!">
        <table className="w-full min-w-[980px] border-collapse">
          <thead className="border-b border-adm-line">
            <tr>
              <th className="admin-th w-10">
                <input
                  type="checkbox"
                  aria-label={labels.selectAll}
                  checked={allSelected}
                  ref={(element) => {
                    if (element) element.indeterminate = selected.size > 0 && !allSelected;
                  }}
                  onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((row) => row.id)))}
                  className="h-4 w-4 rounded-xs border-adm-line-strong text-adm-text focus:ring-adm-info/30"
                />
              </th>
              <th className="admin-th">{labels.customer}</th>
              <th className="admin-th">{labels.interest}</th>
              <th className="admin-th">{labels.channel}</th>
              <th className="admin-th">{labels.status}</th>
              <th className="admin-th">{labels.owner}</th>
              <th className="admin-th">{labels.receivedAt}</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-adm-line">
            {rows.map((row) => {
              const isSelected = selected.has(row.id);
              return (
                <tr
                  key={row.id}
                  onClick={(event) => openRow(event, row.id)}
                  className={[
                    "cursor-pointer transition-colors",
                    isSelected ? "bg-adm-fill/8" : "",
                  ].join(" ")}
                >
                  <td className="admin-td w-10">
                    <input
                      type="checkbox"
                      aria-label={t("table.select", { name: row.name })}
                      checked={isSelected}
                      onChange={() => toggle(row.id)}
                      className="h-4 w-4 rounded-xs border-adm-line-strong text-adm-text focus:ring-adm-info/30"
                    />
                  </td>

                  <td className="admin-td">
                    <div className="flex items-center gap-2.5">
                      <Avatar id={row.id} name={row.name} />
                      <span className="min-w-0">
                        <Link
                          href={`${leadHrefBase}${row.id}`}
                          scroll={false}
                          className="block truncate font-medium text-adm-text hover:text-adm-accent-ink"
                        >
                          {row.name}
                        </Link>
                        <span className="flex items-center gap-1.5 text-xs text-adm-muted">
                          {row.nationality?.flagSrc && (
                            // eslint-disable-next-line @next/next/no-img-element -- a 14px static flag from /public
                            <img
                              src={row.nationality.flagSrc}
                              alt={row.nationality.label}
                              title={row.nationality.label}
                              width={16}
                              height={11}
                              className="h-[11px] w-4 shrink-0 rounded-[2px] object-cover ring-1 ring-adm-line"
                            />
                          )}
                          <span className="admin-mono">{row.maskedPhone}</span>
                          {row.commsLanguage && (
                            <span className="rounded-full bg-adm-neutral-bg px-1.5 text-[10.5px] uppercase text-adm-neutral">
                              {row.commsLanguage}
                            </span>
                          )}
                          {!row.consentGiven && (
                            <span className="rounded-full bg-adm-danger-bg px-1.5 text-[10.5px] text-adm-danger">
                              {labels.noConsent}
                            </span>
                          )}
                        </span>
                      </span>
                    </div>
                  </td>

                  <td className="admin-td">
                    {row.projectName ? (
                      <span className="flex items-center gap-2">
                        <span className="flex h-5 w-7 shrink-0 items-center justify-center overflow-hidden rounded-[5px] bg-adm-text/6">
                          <AdminImage
                            src={row.projectImage}
                            loading="lazy"
                            iconSize={10}
                            className="h-full w-full object-cover"
                          />
                        </span>
                        <span className="truncate">{row.projectName}</span>
                      </span>
                    ) : (
                      <span className="text-adm-muted">{labels.noProject}</span>
                    )}
                  </td>

                  <td className="admin-td whitespace-nowrap text-adm-muted">{row.sourceLabel}</td>

                  <td className="admin-td">
                    <LeadStatusSelect
                      locale={locale}
                      leadId={row.id}
                      value={row.status}
                      labels={statusLabels}
                      errorLabel={labels.failed}
                      undoable
                    />
                  </td>

                  <td className="admin-td">
                    <PopoverMenu
                      label={row.assignee ? `${labels.owner}: ${row.assignee.name}` : labels.assign}
                      buttonClassName={
                        row.assignee
                          ? "inline-flex max-w-[180px] items-center gap-2 rounded-full py-0.5 pl-0.5 pr-2 text-sm text-adm-text hover:bg-adm-text/6"
                          : "admin-btn-ghost admin-btn-sm"
                      }
                      buttonContent={
                        row.assignee ? (
                          <>
                            <Avatar id={row.assignee.id} name={row.assignee.name} size="sm" />
                            <span className="truncate">{row.assignee.name}</span>
                          </>
                        ) : (
                          `+ ${labels.assign}`
                        )
                      }
                      options={row.assignee ? assigneeOptions : assigneeOptions.filter((option) => option.value)}
                      selected={row.assignee?.id ?? ""}
                      onSelect={(assignedToId) => assignOne(row, assignedToId)}
                    />
                  </td>

                  <td className="admin-td whitespace-nowrap">
                    <time dateTime={row.receivedIso} className="block text-xs text-adm-text">
                      {row.receivedLabel}
                    </time>
                    {/* Only past the response SLA: an age on every row was
                        noise, and the late ones are the ones to see. */}
                    {row.late && (
                      <span className="mt-0.5 flex items-center gap-1 text-[11.5px] tabular-nums text-adm-danger">
                        <Clock size={11} aria-hidden />
                        {row.ageLabel}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="flex items-center gap-1.5 text-[11.5px] text-adm-muted">
        <Lock size={12} aria-hidden className="shrink-0" />
        {labels.pdpaNote}
      </p>
    </div>
  );
}
