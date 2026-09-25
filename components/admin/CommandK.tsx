"use client";

/**
 * components/admin/CommandK.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * ⌘K / Ctrl+K search palette, mounted once in the admin layout so it opens
 * from any page.
 *
 * Three kinds of rows: "quick actions" (create X), "navigate" (every page
 * this role can open), and live search results (commandSearch — debounced,
 * server-side, role-scoped at the query itself so a VIEWER's palette can
 * never surface a lead's phone number just because it matched their
 * typing).
 *
 * The navigate rows come from lib/admin/nav.ts, the same list the sidebar
 * draws, filtered by the same canSee(). That is not tidiness: the palette
 * used to keep its own hand-written list with its own role thresholds, and
 * they had already drifted — it offered "Create new project" to every
 * EDITOR while projects/new guards at ADMIN, so the palette sent them
 * somewhere that turned them away. Reading one list makes that class of
 * bug impossible rather than fixed.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Building2,
  Calendar,
  FileImage,
  LayoutGrid,
  Loader2,
  Newspaper,
  Search,
  Users,
} from "lucide-react";
import { Role } from "@prisma/client";
import { hasRole } from "@/lib/role-rank";
import { visibleNav } from "@/lib/admin/nav";
import { commandSearch, type SearchHit } from "@/app/[locale]/admin/command-search-actions";

type Props = { locale: string; role: Role };

/**
 * Rows that create something. Everything that merely *goes* somewhere now
 * comes from lib/admin/nav.ts instead — see the file header.
 *
 * `minRole` here mirrors the target page's own guard, and two of them were
 * wrong: projects/new and events/new both require ADMIN, while this list
 * offered them to EDITOR. Same defect as the "New project" button on the
 * list page, which Phase 1 hid for the same reason.
 */
type QuickAction = { key: string; href: string; minRole: Role };

const QUICK_ACTIONS: QuickAction[] = [
  { key: "newProject", href: "/projects/new", minRole: Role.ADMIN },
  { key: "newNews", href: "/news/new", minRole: Role.EDITOR },
  { key: "newEvent", href: "/events/new", minRole: Role.ADMIN },
];

const GROUP_ICON: Record<SearchHit["group"], typeof Building2> = {
  projects: Building2,
  units: LayoutGrid,
  leads: Users,
  news: Newspaper,
  events: Calendar,
  media: FileImage,
};

export default function CommandK({ locale, role }: Props) {
  const router = useRouter();
  const t = useTranslations("admin.commandK");
  const tNav = useTranslations("admin.nav");
  const tLeadStatus = useTranslations("admin.leadStatus");
  const tUnitStatus = useTranslations("admin.units.statusOptions");

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [groups, setGroups] = useState<{ key: SearchHit["group"]; hits: SearchHit[] }[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestId = useRef(0);

  const quickActions = useMemo(
    () => QUICK_ACTIONS.filter((a) => hasRole(role, a.minRole)),
    [role],
  );

  const filteredQuickActions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return quickActions;
    return quickActions.filter((a) => t(`actions.${a.key}` as never).toLowerCase().includes(q));
  }, [quickActions, query, t]);

  /* Every page this role may open, flattened out of the sidebar's groups.
     canSee() has already run inside visibleNav, so a row that appears here
     is a row that opens. */
  const navTargets = useMemo(
    () =>
      visibleNav(role)
        .flatMap((group) => group.items)
        .map((item) => ({ key: item.key, href: item.href })),
    [role],
  );

  const filteredNavTargets = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return navTargets;
    return navTargets.filter((item) => tNav(`${item.key}` as never).toLowerCase().includes(q));
  }, [navTargets, query, tNav]);

  // Flat list across quick actions + every result group, in render order —
  // this is what ArrowUp/ArrowDown/Enter walk, so the visual order and the
  // keyboard order can never drift apart.
  const flatItems = useMemo(() => {
    const items: { href: string; kind: "action" | "nav" | "hit" }[] =
      filteredQuickActions.map((a) => ({
        href: `/${locale}/admin${a.href}`,
        kind: "action" as const,
      }));
    for (const item of filteredNavTargets) {
      items.push({ href: `/${locale}/admin${item.href}`, kind: "nav" });
    }
    for (const group of groups) {
      for (const hit of group.hits) {
        items.push({ href: `/${locale}/admin${hit.href}`, kind: "hit" });
      }
    }
    return items;
  }, [filteredQuickActions, filteredNavTargets, groups, locale]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((v) => !v);
      } else if (event.key === "Escape") {
        setOpen(false);
      }
    }
    // A plain DOM event rather than lifted React state: the trigger button
    // lives in AdminSidebar, a server-rendered sibling in the admin
    // layout, so there is no shared client parent to hold "open" state in
    // without turning that whole layout client-side.
    function onOpenRequest() {
      setOpen(true);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("admin:open-search", onOpenRequest);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("admin:open-search", onOpenRequest);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setGroups([]);
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
    const q = query.trim();
    if (q.length < 2) {
      setGroups([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const id = ++requestId.current;
    const handle = setTimeout(() => {
      commandSearch(locale, q)
        .then((result) => {
          if (id === requestId.current) setGroups(result.groups);
        })
        .finally(() => {
          if (id === requestId.current) setLoading(false);
        });
    }, 200);
    return () => clearTimeout(handle);
  }, [query, locale]);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  function onKeyDownList(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, flatItems.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = flatItems[activeIndex];
      if (item) go(item.href);
    }
  }

  if (!open) return null;

  let runningIndex = -1;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-primary-900/40 pt-[110px]" onClick={() => setOpen(false)}>
      <div
        className="w-[660px] max-w-[92vw] overflow-hidden rounded-md bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-primary/10 px-4 py-3.5">
          <Search size={17} className="shrink-0 text-ink-muted" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDownList}
            placeholder={t("placeholder")}
            className="flex-1 border-none text-[15px] text-ink outline-hidden placeholder:text-ink-muted"
          />
          {loading ? (
            <Loader2 size={14} className="animate-spin text-ink-muted" aria-hidden />
          ) : (
            <kbd className="rounded-xs border border-primary/15 px-1.5 py-0.5 text-[10px] text-ink-muted">esc</kbd>
          )}
        </div>

        <div className="max-h-[420px] overflow-y-auto py-1.5">
          {filteredQuickActions.length === 0 &&
            filteredNavTargets.length === 0 &&
            groups.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-ink-muted">
              {query.trim().length < 2 ? t("hint") : t("empty")}
            </p>
          )}

          {filteredQuickActions.length > 0 && (
            <div>
              <p className="px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-ink-muted/70">
                {t("quickActions")}
              </p>
              {filteredQuickActions.map((a) => {
                runningIndex += 1;
                const isActive = runningIndex === activeIndex;
                return (
                  <button
                    key={a.key}
                    type="button"
                    onMouseEnter={() => setActiveIndex(runningIndex)}
                    onClick={() => go(`/${locale}/admin${a.href}`)}
                    className={`flex w-full items-center gap-3 px-4 py-2 text-left text-[13px] ${
                      isActive ? "bg-surface-muted" : ""
                    }`}
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-xs bg-primary text-white">
                      <Search size={12} aria-hidden />
                    </span>
                    <span className="flex-1 text-ink">{t(`actions.${a.key}` as never)}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Every page this role can open, from the same list the sidebar
              draws — see the file header. */}
          {filteredNavTargets.length > 0 && (
            <div>
              <p className="px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-ink-muted/70">
                {t("navigate")}
              </p>
              {filteredNavTargets.map((item) => {
                runningIndex += 1;
                const isActive = runningIndex === activeIndex;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onMouseEnter={() => setActiveIndex(runningIndex)}
                    onClick={() => go(`/${locale}/admin${item.href}`)}
                    className={`flex w-full items-center gap-3 px-4 py-2 text-left text-[13px] ${
                      isActive ? "bg-surface-muted" : ""
                    }`}
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-xs bg-surface-muted text-ink-muted">
                      <LayoutGrid size={12} aria-hidden />
                    </span>
                    <span className="flex-1 text-ink">{tNav(`${item.key}` as never)}</span>
                  </button>
                );
              })}
            </div>
          )}

          {groups.map((group) => {
            const Icon = GROUP_ICON[group.key];
            return (
              <div key={group.key}>
                <p className="px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-ink-muted/70">
                  {tNav(group.key as never)}
                </p>
                {group.hits.map((hit) => {
                  runningIndex += 1;
                  const isActive = runningIndex === activeIndex;
                  const badgeLabel =
                    group.key === "leads" && hit.badge
                      ? tLeadStatus(hit.badge as never)
                      : group.key === "units" && hit.badge
                        ? tUnitStatus(hit.badge as never)
                        : hit.badge;
                  return (
                    <button
                      key={`${group.key}-${hit.id}`}
                      type="button"
                      onMouseEnter={() => setActiveIndex(runningIndex)}
                      onClick={() => go(`/${locale}/admin${hit.href}`)}
                      className={`flex w-full items-center gap-3 px-4 py-2 text-left text-[13px] ${
                        isActive ? "bg-surface-muted" : ""
                      }`}
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-xs bg-surface-muted text-ink-muted">
                        <Icon size={13} aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-ink">{hit.title}</span>
                        {hit.subtitle && <span className="block truncate text-[11px] text-ink-muted">{hit.subtitle}</span>}
                      </span>
                      {badgeLabel && (
                        <span className="shrink-0 rounded-xs bg-primary/5 px-1.5 py-0.5 text-[10px] font-medium text-ink-muted">
                          {badgeLabel}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-4 border-t border-primary/10 bg-surface-muted/60 px-4 py-2 text-[10.5px] text-ink-muted">
          <span className="flex items-center gap-1"><kbd className="rounded-xs border border-primary/15 bg-white px-1 py-0.5">↑</kbd><kbd className="rounded-xs border border-primary/15 bg-white px-1 py-0.5">↓</kbd>{t("navigate")}</span>
          <span className="flex items-center gap-1"><kbd className="rounded-xs border border-primary/15 bg-white px-1 py-0.5">↵</kbd>{t("select")}</span>
          <span className="flex items-center gap-1"><kbd className="rounded-xs border border-primary/15 bg-white px-1 py-0.5">⌘K</kbd>{t("toggle")}</span>
        </div>
      </div>
    </div>
  );
}
