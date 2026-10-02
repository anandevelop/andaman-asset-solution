"use client";

/**
 * components/admin/WorkInbox.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The dashboard's one list of things to do: unassigned leads, appointments
 * nobody closed, and content with no Thai — oldest first, filterable by
 * kind, each with its own next step as a button.
 *
 * The buttons are tier-1 actions (see UndoToast): the row goes at once and
 * the toast offers eight seconds to put it back. They call the same server
 * actions the leads table and the appointments page call, so the SALES
 * scoping those actions enforce applies here unchanged — and the server
 * only lists rows the viewer could act on, so a refused click is an edge
 * case (somebody else got there first), reported as a toast.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CalendarClock, CheckCircle2, ChevronDown, FileWarning, UserPlus, Zap, type LucideIcon } from "lucide-react";
import { assignLead } from "@/app/[locale]/admin/(crm)/leads/actions";
import { updateAppointmentStatus } from "@/app/[locale]/admin/(crm)/appointments/actions";
import { INBOX_VISIBLE, type InboxItem, type InboxKind } from "@/lib/admin/dashboard-model";
import Segmented from "@/components/admin/ui/Segmented";
import { showUndoToast } from "@/components/admin/UndoToast";

type Filter = InboxKind | "all";

const KIND_ICON: Record<InboxKind, LucideIcon> = {
  lead: UserPlus,
  appointment: CalendarClock,
  content: FileWarning,
};

const KIND_TONE: Record<InboxKind, string> = {
  lead: "bg-adm-status-info-bg text-adm-status-info",
  appointment: "bg-adm-warning-bg text-adm-warning",
  content: "bg-adm-content/12 text-adm-content",
};

type Props = {
  locale: string;
  items: InboxItem[];
  /** Exact totals per kind; `items` holds at most a dozen leads and
   *  appointments, and one row per content type. */
  totals: Record<InboxKind, number>;
  /** The kinds this role is shown at all — drives the filter segments. */
  kinds: InboxKind[];
  currentUserId: string;
  /** "rail": inside a narrow side card that has its own heading (the
   *  appointments page) — no header of its own, and the buttons drop to a
   *  line under the row instead of squeezing the name to one letter. */
  variant?: "panel" | "rail";
};

export default function WorkInbox({ locale, items, totals, kinds, currentUserId, variant = "panel" }: Props) {
  const rail = variant === "rail";
  const t = useTranslations("admin.dashboard.inbox");
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [expanded, setExpanded] = useState(false);
  /* Rows acted on in this view. Kept hidden even after the refresh brings
     fresh props, so a row does not flash back between the action landing
     and the server re-rendering without it. */
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [, startTransition] = useTransition();

  const hide = (key: string, value: boolean) =>
    setHidden((previous) => {
      const next = new Set(previous);
      if (value) next.add(key);
      else next.delete(key);
      return next;
    });

  const visible = items.filter((item) => !hidden.has(item.key));
  const hiddenOf = (kind: InboxKind) => items.filter((item) => item.kind === kind && hidden.has(item.key)).length;
  const countOf = (kind: InboxKind) => Math.max(0, totals[kind] - hiddenOf(kind));
  const allCount = kinds.reduce((sum, kind) => sum + countOf(kind), 0);
  const matching = filter === "all" ? visible : visible.filter((item) => item.kind === filter);
  // Six, then "see all" — the inbox is the first thing on the page, and a
  // long one pushed every other panel below the fold.
  const shown = expanded ? matching : matching.slice(0, INBOX_VISIBLE);

  /**
   * Do it, drop the row, offer the undo. `undo` is the inverse call; both
   * go through the same server actions, so undoing is just another
   * permitted change and is audit-logged like one.
   */
  const act = (
    item: InboxItem,
    message: string,
    run: () => Promise<{ ok: boolean }>,
    undo: () => Promise<{ ok: boolean }>,
  ) => {
    hide(item.key, true);
    startTransition(async () => {
      const result = await run();
      if (!result.ok) {
        hide(item.key, false);
        showUndoToast({ message: t("failed") });
        return;
      }
      router.refresh();
      showUndoToast({
        message,
        onUndo: async () => {
          const reverted = await undo();
          if (!reverted.ok) throw new Error("undo refused");
          hide(item.key, false);
          router.refresh();
        },
      });
    });
  };

  const setAppointment = (item: InboxItem, status: "COMPLETED" | "NO_SHOW") =>
    act(
      item,
      t(status === "COMPLETED" ? "done.visited" : "done.noShow", { name: item.title }),
      () => updateAppointmentStatus(locale, { id: item.id, status }),
      () => updateAppointmentStatus(locale, { id: item.id, status: "REQUESTED" }),
    );

  const segments: Filter[] = kinds.length > 1 ? ["all", ...kinds] : kinds;

  return (
    <div>
      {!rail && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-adm-line px-[18px] py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <Zap size={16} aria-hidden className="shrink-0 text-adm-accent-ink" />
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold leading-tight text-adm-text">{t("title")}</h2>
              <p className="text-xs text-adm-muted">{t("subtitle")}</p>
            </div>
          </div>
          {segments.length > 1 && (
            <Segmented
              label={t("filter")}
              active={filter}
              onSelect={(key) => {
                setFilter(key as Filter);
                setExpanded(false);
              }}
              items={segments.map((segment) => ({
                key: segment,
                label: t(`kinds.${segment}`),
                count: segment === "all" ? allCount : countOf(segment),
              }))}
            />
          )}
        </div>
      )}

      {shown.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
          <CheckCircle2 size={22} aria-hidden className="text-adm-success" />
          <p className="text-sm text-adm-muted">{t("empty")}</p>
        </div>
      ) : (
        <ul className={`divide-y divide-adm-line ${rail ? "px-3.5" : "px-[18px]"}`}>
          {shown.map((item) => {
            const Icon = KIND_ICON[item.kind];
            return (
              <li key={item.key} className={`flex items-center gap-3 py-[11px] ${rail ? "flex-wrap" : ""}`}>
                <span
                  aria-hidden
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] ${KIND_TONE[item.kind]}`}
                >
                  <Icon size={17} strokeWidth={1.75} />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-2">
                    {item.href ? (
                      <Link
                        href={item.href}
                        className="truncate text-sm font-medium text-adm-text hover:text-adm-accent-ink"
                      >
                        {item.title}
                      </Link>
                    ) : (
                      <span className="truncate text-sm font-medium text-adm-text">{item.title}</span>
                    )}
                    {item.late && (
                      <span className="shrink-0 rounded-full bg-adm-danger-bg px-2 py-px text-[11px] font-medium text-adm-danger">
                        {t("urgent")}
                      </span>
                    )}
                  </span>
                  {item.detail && <span className="block truncate text-xs text-adm-muted">{item.detail}</span>}
                </span>

                {item.ageLabel && (
                  <span
                    className={[
                      "shrink-0 text-xs tabular-nums",
                      rail ? "" : "hidden sm:inline",
                      item.late ? "text-adm-danger" : "text-adm-muted",
                    ].join(" ")}
                  >
                    {item.ageLabel}
                  </span>
                )}

                <span className={`flex shrink-0 items-center gap-1.5 ${rail ? "w-full pl-12" : ""}`}>
                  {item.kind === "lead" && (
                    <button
                      type="button"
                      className="admin-btn-ghost admin-btn-sm"
                      onClick={() =>
                        act(
                          item,
                          t("done.claimed", { name: item.title }),
                          () => assignLead(locale, item.id, currentUserId),
                          () => assignLead(locale, item.id, ""),
                        )
                      }
                    >
                      {t("actions.claim")}
                    </button>
                  )}
                  {item.kind === "appointment" && (
                    <>
                      <button
                        type="button"
                        className="admin-btn-ghost admin-btn-sm"
                        onClick={() => setAppointment(item, "COMPLETED")}
                      >
                        {t("actions.visited")}
                      </button>
                      <button
                        type="button"
                        className="admin-btn-ghost admin-btn-sm"
                        onClick={() => setAppointment(item, "NO_SHOW")}
                      >
                        {t("actions.noShow")}
                      </button>
                    </>
                  )}
                  {item.kind === "content" && item.href && (
                    <Link href={item.href} className="admin-btn-ghost admin-btn-sm">
                      {t("actions.edit")}
                    </Link>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {!expanded && matching.length > shown.length && (
        <div className="border-t border-adm-line px-[18px] py-2.5">
          <button type="button" onClick={() => setExpanded(true)} className="admin-btn-quiet admin-btn-sm">
            {t("seeAll", { count: matching.length })}
            <ChevronDown size={14} aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}
