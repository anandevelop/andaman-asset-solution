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
 *
 * Tabs are in that list too (visibleTabRows). The menu is being trimmed by
 * turning rows into tabs of a hub, and a palette that only read rows would
 * lose one destination per move — silently, since "no results" looks the
 * same whether the thing is missing or absent.
 *
 * GROUPS, IN THE V4 ORDER
 *
 *   ไปที่ (pages) · the search results by type · สร้างใหม่ · คำสั่ง
 *
 * Every row is one shape — a label and a `run` — whether it navigates or
 * does something in place ("switch to dark", "collapse the menu"), so the
 * arrow keys walk one list in the order it is drawn and Enter does what a
 * click would. Commands are the same toggles the topbar carries, offered
 * here because a palette is where the keyboard user looks for them.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ArrowRight,
  Building2,
  Calendar,
  FileImage,
  LayoutGrid,
  Loader2,
  Moon,
  Newspaper,
  PanelLeft,
  Plus,
  Rows3,
  Search,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Role } from "@prisma/client";
import { hasRole } from "@/lib/role-rank";
import { visibleNav, visibleTabRows } from "@/lib/admin/nav";
import { commandSearch, type SearchHit } from "@/app/[locale]/admin/command-search-actions";
import { applyDisplayPref, toggleCopilot, toggleRail } from "@/lib/admin/use-display-pref";

type Props = {
  locale: string;
  role: Role;
  /** ADMIN_COPILOT — the "open Copilot" command only when the panel exists. */
  copilotEnabled?: boolean;
};

/** One row of the palette, whatever it does. */
type Row = { id: string; label: string; sub?: string | null; badge?: string | null; icon: LucideIcon; run: () => void };
type Section = { key: string; label: string; rows: Row[] };

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

export default function CommandK({ locale, role, copilotEnabled = false }: Props) {
  const router = useRouter();
  const t = useTranslations("admin.commandK");
  const tNav = useTranslations("admin.nav");
  const tTabs = useTranslations("admin.tabs");
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

  /* Every page this role may open: the sidebar's rows, plus the tabs
     inside them. The tabs matter because rows keep becoming tabs —
     "Translations" was a searchable row and is now a tab of Review &
     publish — and a palette that only reads rows would quietly stop
     finding each one as it moved. canSee() has already run inside both
     helpers, so a row that appears here is a row that opens.

     A tab row is labelled "<parent> · <tab>": "Translations" on its own
     told you nothing about where you would land, and there is more than
     one thing in this menu a person might call "defaults". */
  const navTargets = useMemo(() => {
    const items = visibleNav(role)
      .flatMap((group) => group.items)
      .map((item) => ({ key: item.key, href: item.href, label: tNav(`${item.key}` as never) }));

    const tabs = visibleTabRows(role).map((row) => ({
      key: `${row.itemKey}:${row.tabKey}`,
      href: row.href,
      label: `${tNav(`${row.itemKey}` as never)} · ${tTabs(`${row.itemKey}.${row.tabKey}` as never)}`,
    }));

    return [...items, ...tabs];
  }, [role, tNav, tTabs]);

  const filteredNavTargets = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return navTargets;
    return navTargets.filter((item) => item.label.toLowerCase().includes(q));
  }, [navTargets, query]);

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

  function runInPlace(action: () => void) {
    setOpen(false);
    action();
  }

  /* Commands: the topbar's toggles, by name. Filtered by the query like
     everything else; never role-gated, since each only changes this
     browser's view. */
  const commands = useMemo<Row[]>(() => {
    const all: Row[] = [
      {
        id: "cmd:theme",
        label: t("commands.theme"),
        icon: Moon,
        run: () =>
          runInPlace(() =>
            applyDisplayPref("theme", document.documentElement.dataset.adminTheme === "dark" ? "light" : "dark"),
          ),
      },
      {
        id: "cmd:density",
        label: t("commands.density"),
        icon: Rows3,
        run: () =>
          runInPlace(() =>
            applyDisplayPref(
              "density",
              document.documentElement.dataset.adminDensity === "compact" ? "comfortable" : "compact",
            ),
          ),
      },
      { id: "cmd:rail", label: t("commands.rail"), icon: PanelLeft, run: () => runInPlace(toggleRail) },
      ...(copilotEnabled
        ? [{ id: "cmd:copilot", label: t("commands.copilot"), icon: Sparkles, run: () => runInPlace(toggleCopilot) }]
        : []),
    ];
    const q = query.trim().toLowerCase();
    return q ? all.filter((row) => row.label.toLowerCase().includes(q)) : all;
    // runInPlace only closes the palette; t and the flag are what change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, query, copilotEnabled]);

  /* The sections in the order they are drawn — which is also the order
     the arrow keys walk, since both read this one array. */
  const sections: Section[] = [
    {
      key: "navigate",
      label: t("groups.navigate"),
      rows: filteredNavTargets.map((item) => ({
        id: `nav:${item.key}`,
        label: item.label,
        icon: ArrowRight,
        run: () => go(`/${locale}/admin${item.href}`),
      })),
    },
    ...groups.map((group) => ({
      key: group.key,
      label: tNav(group.key as never),
      rows: group.hits.map((hit) => ({
        id: `${group.key}:${hit.id}`,
        label: hit.title,
        sub: hit.subtitle,
        badge:
          group.key === "leads" && hit.badge
            ? tLeadStatus(hit.badge as never)
            : group.key === "units" && hit.badge
              ? tUnitStatus(hit.badge as never)
              : hit.badge,
        icon: GROUP_ICON[group.key],
        run: () => go(`/${locale}/admin${hit.href}`),
      })),
    })),
    {
      key: "create",
      label: t("groups.create"),
      rows: filteredQuickActions.map((action) => ({
        id: `create:${action.key}`,
        label: t(`actions.${action.key}` as never),
        icon: Plus,
        run: () => go(`/${locale}/admin${action.href}`),
      })),
    },
    { key: "commands", label: t("groups.commands"), rows: commands },
  ].filter((section) => section.rows.length > 0);

  const flat = sections.flatMap((section) => section.rows);

  function onKeyDownList(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => (flat.length === 0 ? 0 : (i + 1) % flat.length));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => (flat.length === 0 ? 0 : (i - 1 + flat.length) % flat.length));
    } else if (event.key === "Enter") {
      event.preventDefault();
      flat[activeIndex]?.run();
    }
  }

  // Keep the highlighted row in view as the arrows move it.
  useEffect(() => {
    document.getElementById(`cmdk-row-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (!open) return null;

  let runningIndex = -1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-adm-band/50 px-4 pt-[12vh] backdrop-blur-[2px]"
      onClick={() => setOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("placeholder")}
        className="w-[660px] max-w-full overflow-hidden rounded-[16px] border border-adm-line bg-adm-solid shadow-[var(--adm-shadow-float)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-adm-line px-4 py-3.5">
          <Search size={17} className="shrink-0 text-ink-muted" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDownList}
            placeholder={t("placeholder")}
            role="combobox"
            aria-expanded="true"
            aria-controls="cmdk-list"
            aria-activedescendant={flat.length > 0 ? `cmdk-row-${activeIndex}` : undefined}
            className="flex-1 border-none bg-transparent text-[15px] text-ink outline-hidden placeholder:text-ink-muted"
          />
          {loading ? (
            <Loader2 size={14} className="animate-spin text-ink-muted" aria-hidden />
          ) : (
            <kbd className="rounded-[6px] border border-adm-line-strong px-1.5 py-0.5 font-mono text-[10px] text-ink-muted">esc</kbd>
          )}
        </div>

        <div id="cmdk-list" role="listbox" className="max-h-[420px] overflow-y-auto py-1.5">
          {flat.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-ink-muted">
              {query.trim().length < 2 ? t("hint") : t("empty")}
            </p>
          )}

          {sections.map((section) => (
            <div key={section.key} role="group" aria-label={section.label}>
              <p className="px-4 pb-1 pt-2.5 text-[11px] font-medium text-ink-muted">{section.label}</p>
              {section.rows.map((row) => {
                runningIndex += 1;
                const index = runningIndex;
                const isActive = index === activeIndex;
                const Icon = row.icon;
                return (
                  <button
                    key={row.id}
                    id={`cmdk-row-${index}`}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={row.run}
                    className={`mx-1.5 flex w-[calc(100%-12px)] items-center gap-3 rounded-[10px] px-2.5 py-2 text-left text-[13px] ${
                      isActive ? "bg-primary/5" : ""
                    }`}
                  >
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] ${
                        isActive ? "bg-adm-fill text-adm-on-fill" : "bg-surface text-ink-muted"
                      }`}
                    >
                      <Icon size={14} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-ink">{row.label}</span>
                      {row.sub && <span className="block truncate text-[11px] text-ink-muted">{row.sub}</span>}
                    </span>
                    {row.badge && (
                      <span className="shrink-0 rounded-full bg-adm-neutral-bg px-2 py-0.5 text-[10.5px] font-medium text-adm-neutral">
                        {row.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-4 border-t border-adm-line px-4 py-2 text-[11px] text-ink-muted">
          <Hint keys={["↑", "↓"]} label={t("navigate")} />
          <Hint keys={["↵"]} label={t("select")} />
          <Hint keys={["⌘K", "/"]} label={t("toggle")} />
          <Hint keys={["g", "d"]} label={t("goHint")} />
        </div>
      </div>
    </div>
  );
}

function Hint({ keys, label }: { keys: string[]; label: string }) {
  return (
    <span className="flex items-center gap-1">
      {keys.map((key) => (
        <kbd key={key} className="rounded-[5px] border border-adm-line-strong px-1 py-0.5 font-mono text-[10px]">
          {key}
        </kbd>
      ))}
      {label}
    </span>
  );
}
