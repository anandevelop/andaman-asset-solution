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
import { CalendarClock, CheckCircle2, FileWarning, UserPlus, type LucideIcon } from "lucide-react";
import { assignLead } from "@/app/[locale]/admin/(crm)/leads/actions";
import { updateAppointmentStatus } from "@/app/[locale]/admin/(crm)/appointments/actions";
import type { InboxItem, InboxKind } from "@/lib/admin/dashboard-model";
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
  content: "bg-adm-neutral-bg text-adm-neutral",
};

type Props = {
  locale: string;
  items: InboxItem[];
  /** Exact totals per kind; `items` holds at most a dozen of each. */
  totals: Record<InboxKind, number>;
  /** The kinds this role is shown at all — drives the filter segments. */
  kinds: InboxKind[];
  currentUserId: string;
};

export default function WorkInbox({ locale, items, totals, kinds, currentUserId }: Props) {
  const t = useTranslations("admin.dashboard.inbox");
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
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
  const shown = filter === "all" ? visible : visible.filter((item) => item.kind === filter);

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
      {segments.length > 1 && (
        <div
          role="tablist"
          aria-label={t("filter")}
          className="mx-5 mt-3 inline-flex rounded-[10px] border border-adm-line bg-surface p-0.5"
        >
          {segments.map((segment) => {
            const count = segment === "all" ? allCount : countOf(segment);
            const selected = filter === segment;
            return (
              <button
                key={segment}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setFilter(segment)}
                className={[
                  "flex h-7 items-center gap-1.5 rounded-[8px] px-3 text-[12.5px] transition-colors",
                  selected ? "bg-adm-solid font-medium text-ink shadow-[0_0_0_1px_var(--adm-line)]" : "text-ink-muted hover:text-ink",
                ].join(" ")}
              >
                {t(`kinds.${segment}`)}
                <span className="tabular-nums text-ink-muted">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {shown.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
          <CheckCircle2 size={22} aria-hidden className="text-adm-success" />
          <p className="text-sm text-ink-muted">{t("empty")}</p>
        </div>
      ) : (
        <ul className="mt-2 divide-y divide-adm-line">
          {shown.map((item) => {
            const Icon = KIND_ICON[item.kind];
            return (
              <li key={item.key} className="flex items-center gap-3 px-5 py-2.5">
                <span
                  aria-hidden
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] ${KIND_TONE[item.kind]}`}
                >
                  <Icon size={16} strokeWidth={1.75} />
                </span>

                <span className="min-w-0 flex-1">
                  {item.href ? (
                    <Link href={item.href} className="block truncate text-sm font-medium text-ink hover:text-primary-500">
                      {item.title}
                    </Link>
                  ) : (
                    <span className="block truncate text-sm font-medium text-ink">{item.title}</span>
                  )}
                  {item.detail && <span className="block truncate text-xs text-ink-muted">{item.detail}</span>}
                </span>

                {item.ageLabel && (
                  <span
                    className={[
                      "hidden shrink-0 rounded-full px-2 py-0.5 text-[11px] tabular-nums sm:inline",
                      item.late ? "bg-adm-danger-bg font-medium text-adm-danger" : "bg-adm-neutral-bg text-adm-neutral",
                    ].join(" ")}
                  >
                    {item.ageLabel}
                  </span>
                )}

                <span className="flex shrink-0 items-center gap-1.5">
                  {item.kind === "lead" && (
                    <button
                      type="button"
                      className="admin-btn min-h-7! px-2.5! text-xs!"
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
                        className="admin-btn min-h-7! px-2.5! text-xs!"
                        onClick={() => setAppointment(item, "COMPLETED")}
                      >
                        {t("actions.visited")}
                      </button>
                      <button
                        type="button"
                        className="admin-btn-ghost min-h-7! px-2.5! text-xs!"
                        onClick={() => setAppointment(item, "NO_SHOW")}
                      >
                        {t("actions.noShow")}
                      </button>
                    </>
                  )}
                  {item.kind === "content" && item.href && (
                    <Link href={item.href} className="admin-btn-ghost min-h-7! px-2.5! text-xs!">
                      {t("actions.edit")}
                    </Link>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
