"use client";

/**
 * components/admin/NotificationDrawer.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The bell's feed as a right-hand drawer (v4), replacing the 360px dropdown
 * that showed ten rows and no way to tell a new lead from a weekly digest.
 *
 *   · สำคัญ / ทั้งหมด — important is the events somebody should act on
 *     today (IMPORTANT_EVENTS); "all" is everything.
 *   · repeats collapse into one row with a count (buildFeed).
 *   · test traffic folds into a single line; ADMIN and above get a button
 *     that marks it read (dismissTestNotifications) — read, not deleted.
 *
 * Escape and the backdrop close it; focus moves into it on open and back
 * to the bell on close, as a dialog's should.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Bell, FlaskConical, X } from "lucide-react";
import { buildFeed, IMPORTANT_EVENTS } from "@/lib/admin/notification-feed";
import { dismissTestNotifications, markNotificationsRead } from "@/app/[locale]/admin/notifications-actions";
import { showUndoToast } from "@/components/admin/UndoToast";

export type DrawerNotification = {
  id: string;
  event: string;
  title: string;
  body: string | null;
  href: string | null;
  read: boolean;
  /** Already formatted for this locale by the server. */
  when: string;
};

type Props = {
  locale: string;
  notifications: DrawerNotification[];
  unreadCount: number;
  canClearTests: boolean;
  onClose: () => void;
};

export default function NotificationDrawer({ locale, notifications, unreadCount, canClearTests, onClose }: Props) {
  const t = useTranslations("admin.topbar.drawer");
  const tTop = useTranslations("admin.topbar");
  const router = useRouter();
  const [tab, setTab] = useState<"important" | "all">("important");
  const [pending, startTransition] = useTransition();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [onClose]);

  const { entries, tests } = buildFeed(notifications);
  const important = entries.filter((entry) => IMPORTANT_EVENTS.has(entry.row.event));
  const shown = tab === "important" ? important : entries;
  const unreadTests = tests.filter((row) => !row.read).length;

  return (
    <div className="fixed inset-0 z-[60]" role="presentation">
      <button
        type="button"
        aria-label={t("close")}
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-adm-band/30"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={tTop("notifications")}
        tabIndex={-1}
        className="absolute inset-y-0 right-0 flex w-[400px] max-w-full flex-col bg-adm-solid shadow-[var(--adm-shadow-float)] outline-hidden motion-safe:animate-[lead-drawer-in_.2s_ease-out]"
      >
        <div className="flex h-[60px] shrink-0 items-center gap-2 border-b border-adm-line px-4">
          <Bell size={17} aria-hidden className="text-adm-muted" />
          <h2 className="flex-1 text-sm font-semibold text-adm-text">{tTop("notifications")}</h2>
          {unreadCount > 0 && (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await markNotificationsRead(locale);
                  router.refresh();
                })
              }
              className="text-xs text-adm-muted hover:text-adm-text hover:underline"
            >
              {tTop("markAllRead")}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label={t("close")}
            className="flex h-8 w-8 items-center justify-center rounded-[10px] text-adm-muted hover:bg-adm-text/5 hover:text-adm-text"
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        <div role="tablist" aria-label={tTop("notifications")} className="flex gap-1 border-b border-adm-line px-3">
          {(["important", "all"] as const).map((key) => {
            const count = key === "important" ? important.filter((e) => !e.read).length : entries.filter((e) => !e.read).length;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={[
                  "relative flex items-center gap-1.5 px-3 py-2.5 text-[13px]",
                  tab === key
                    ? "font-semibold text-adm-text after:absolute after:inset-x-2 after:bottom-0 after:h-[2px] after:rounded-full after:bg-adm-fill"
                    : "text-adm-muted hover:text-adm-text",
                ].join(" ")}
              >
                {t(key)}
                {count > 0 && (
                  <span className="rounded-full bg-adm-danger-bg px-1.5 text-[10.5px] font-semibold tabular-nums text-adm-danger">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto">
          {shown.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-adm-muted">
              {tab === "important" ? t("emptyImportant") : tTop("noNotifications")}
            </p>
          ) : (
            <ul className="divide-y divide-adm-line">
              {shown.map(({ row, count, read }) => (
                <li key={row.id}>
                  <Link
                    href={row.href ? `/${locale}${row.href}` : `/${locale}/admin`}
                    onClick={onClose}
                    className={`flex gap-3 px-4 py-3 transition-colors hover:bg-adm-text/5 ${read ? "" : "bg-adm-fill/10"}`}
                  >
                    <span
                      aria-hidden
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${read ? "bg-transparent" : "bg-adm-fill"}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-[13px] font-medium text-adm-text">{row.title}</span>
                        {count > 1 && (
                          <span className="shrink-0 rounded-full bg-adm-neutral-bg px-1.5 text-[10.5px] font-semibold tabular-nums text-adm-neutral">
                            ×{count}
                          </span>
                        )}
                      </span>
                      {row.body && <span className="mt-0.5 block truncate text-xs text-adm-muted">{row.body}</span>}
                      <span className="mt-0.5 block text-[11px] text-adm-muted/80">{row.when}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Test traffic, one line however much of it there is. */}
        {tests.length > 0 && (
          <div className="flex items-center gap-2.5 border-t border-adm-line px-4 py-3 text-xs text-adm-muted">
            <FlaskConical size={14} aria-hidden className="shrink-0" />
            <span className="flex-1">{t("tests", { count: tests.length, unread: unreadTests })}</span>
            {canClearTests && unreadTests > 0 && (
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await dismissTestNotifications(locale);
                    router.refresh();
                    showUndoToast({ message: result.ok ? t("testsCleared", { count: result.count }) : t("failed") });
                  })
                }
                className="admin-btn-ghost min-h-7! px-2.5! text-xs!"
              >
                {t("clearTests")}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
