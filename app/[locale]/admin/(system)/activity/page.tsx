/**
 * app/[locale]/admin/activity/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The audit trail, read. SUPER_ADMIN only — requireAdmin redirects anyone
 * else to the dashboard with ?denied=1, the same guard the users page uses.
 *
 * Restricted because the trail is about the people using the system rather
 * than the content in it: who was working late, who deleted the thing that
 * is missing. That is a management question, not an editorial one, and an
 * EDITOR being able to watch their colleagues is a different product from
 * the one that was asked for.
 *
 * THE LAYOUT
 *
 * Four figures for the last seven days that somebody would act on (unit
 * prices and statuses changed, sign-ins refused, customer numbers looked
 * at, people active), then one card: tabs by job with their counts, a
 * search box, the person and the period, and the table — when, who, what
 * they did, to what, what changed (before → after) and where from. One
 * entry opens in a drawer with its full diff and "revert". The filters are
 * lib/admin/activity-query.ts, shared with the CSV export.
 *
 * Read-only by construction. The only
 * two things that write to AuditLog anywhere are lib/audit/extension.ts,
 * which records changes by watching Prisma, and lib/audit/events.ts, which
 * records sign-ins and sign-outs because there is no write for the
 * extension to watch. Nothing deletes or edits a row — an audit trail an
 * administrator can rewrite answers no question worth asking.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  Ban,
  ChevronRight,
  Download,
  Eye,
  LogIn,
  LogOut,
  Pencil,
  Plus,
  Search,
  ShieldAlert,
  Tag,
  Trash2,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Prisma, Role } from "@prisma/client";
import { auditModelLabel, type AuditModelLabels } from "@/lib/admin/audit-model-label";
import AuditDetailPanel, { type AuditEntryView } from "@/components/admin/AuditDetailPanel";
import AdminDrawer from "@/components/admin/ui/AdminDrawer";
import AdminPageHeader from "@/components/admin/ui/AdminPageHeader";
import { prisma } from "@/lib/prisma";
import { safeQuery, isDatabaseOffline } from "@/lib/db";
import { requireAdmin } from "@/lib/admin/guard";
import {
  AUTH_LOGIN,
  AUTH_LOGIN_FAILED,
  AUTH_LOGOUT,
  AUTH_MODEL,
  AUTH_TOTP_FAILED,
  CONTACT_REVEAL,
  LEAD_ERASE,
  isAuthEvent,
  isFailedAuth,
} from "@/lib/audit/events";
import { deviceLabel } from "@/lib/audit/device";
import {
  ACTIVITY_CATEGORIES,
  ACTIVITY_RANGES,
  DEFAULT_RANGE,
  UNIT_COMMERCIAL_FIELDS,
  activityWhere,
  baseWhere,
  categoryOf,
  countByCategory,
  parseActivityFilters,
  relativeTime,
} from "@/lib/admin/activity-query";
import { intlLocale } from "@/lib/format";
import { initialsOf } from "@/components/admin/agents/ui";
import { zoneEyebrow } from "@/lib/admin/nav";

/** Entries are written constantly; a cached page would be a stale one. */
export const dynamic = "force-dynamic";

/** Rows drawn at first, and added by each "show more". */
const PAGE_SIZE = 50;
/** The most one page will draw; past this, narrow the filters or export. */
const MAX_ROWS = 500;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tab?: string; range?: string; actor?: string; q?: string; show?: string; entry?: string }>;
};

type Tone = "success" | "neutral" | "accent" | "info" | "danger" | "warning";

const TONE: Record<Tone, string> = {
  success: "bg-adm-success-bg text-adm-success",
  neutral: "bg-adm-neutral-bg text-adm-neutral",
  accent: "bg-adm-fill/22 text-adm-accent-ink",
  info: "bg-adm-info/12 text-adm-info",
  danger: "bg-adm-danger-bg text-adm-danger",
  warning: "bg-adm-warning-bg text-adm-warning",
};

/** How each action is drawn. Anything unlisted is a neutral "edit". */
const ACTION_STYLE: Record<string, { icon: LucideIcon; tone: Tone }> = {
  create: { icon: Plus, tone: "info" },
  update: { icon: Pencil, tone: "accent" },
  delete: { icon: Trash2, tone: "danger" },
  [AUTH_LOGIN]: { icon: LogIn, tone: "success" },
  [AUTH_LOGOUT]: { icon: LogOut, tone: "neutral" },
  [AUTH_LOGIN_FAILED]: { icon: Ban, tone: "danger" },
  [AUTH_TOTP_FAILED]: { icon: Ban, tone: "danger" },
  [CONTACT_REVEAL]: { icon: Eye, tone: "warning" },
  [LEAD_ERASE]: { icon: Trash2, tone: "danger" },
};

const printable = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "✓" : "✗";
  return JSON.stringify(value);
};

const clip = (text: string, max = 48) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

export default async function AdminActivityPage(props: Props) {
  const [params, searchParams] = await Promise.all([props.params, props.searchParams]);
  const { locale } = params;

  await requireAdmin(locale, Role.SUPER_ADMIN);

  const t = await getTranslations({ locale, namespace: "admin" });

  // Readable names for AuditLog.model — see lib/admin/audit-model-label.ts.
  const modelLabels = t.raw("auditModels") as AuditModelLabels;
  // Field labels are already written for the publishing screen; one
  // vocabulary for "which field changed" across the admin, not two.
  const tPublishing = await getTranslations({ locale, namespace: "admin.publishing" });
  const fieldLabel = (field: string) =>
    tPublishing.has(`changed.field.${field}` as never) ? tPublishing(`changed.field.${field}` as never) : field;

  const filters = parseActivityFilters(searchParams);
  const shown = Math.min(MAX_ROWS, Math.max(PAGE_SIZE, Number(searchParams.show) || PAGE_SIZE));
  const now = new Date();
  const weekAgo = new Date(now.getTime() - WEEK_MS);
  const where = activityWhere(filters, now);

  const [entries, byModel, people, stats] = await Promise.all([
    safeQuery(
      "admin:activity",
      () => prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, take: shown }),
      [] as Awaited<ReturnType<typeof prisma.auditLog.findMany>>,
    ),
    // One query for all six tab counts: counted over everything but the
    // tab, so the number on a tab is what pressing it shows.
    safeQuery(
      "admin:activity:tabs",
      async () =>
        (
          await prisma.auditLog.groupBy({ by: ["model"], where: baseWhere(filters, now), _count: { _all: true } })
        ).map((row) => ({ model: row.model, count: row._count._all })),
      [] as { model: string; count: number }[],
    ),
    /*
      Filter options come from the log itself, not from the user table: the
      point of a name in this list is that they did something, and an actor
      whose account has since been deleted still has entries worth reading.
    */
    safeQuery(
      "admin:activity:people",
      () => prisma.auditLog.groupBy({ by: ["actorEmail"], orderBy: { actorEmail: "asc" } }),
      [] as { actorEmail: string }[],
    ),
    safeQuery(
      "admin:activity:stats",
      async () => {
        const [unit, failed, reveals, active] = await Promise.all([
          /* `changes` holds only fields whose value really differs, where
             changedFields lists every field the form submitted — so this
             counts edits that moved a price or a status, not every save. */
          prisma.$queryRaw<{ n: bigint }[]>(Prisma.sql`
            SELECT count(*) AS n FROM "audit_logs"
            WHERE "model" = 'ProjectUnit' AND "action" = 'update' AND "createdAt" >= ${weekAgo}
              AND (${Prisma.join(
                UNIT_COMMERCIAL_FIELDS.map((field) => Prisma.sql`jsonb_exists("changes", ${field})`),
                " OR ",
              )})`),
          prisma.auditLog.count({
            where: { model: AUTH_MODEL, action: { in: [AUTH_LOGIN_FAILED, AUTH_TOTP_FAILED] }, createdAt: { gte: weekAgo } },
          }),
          prisma.auditLog.count({ where: { action: CONTACT_REVEAL, createdAt: { gte: weekAgo } } }),
          prisma.auditLog.groupBy({ by: ["actorId"], where: { actorId: { not: null }, createdAt: { gte: weekAgo } } }),
        ]);
        return { unit: Number(unit[0]?.n ?? 0), failed, reveals, active: active.length };
      },
      { unit: 0, failed: 0, reveals: 0, active: 0 },
    ),
  ]);

  const counts = countByCategory(byModel);
  const total = counts[filters.category];

  /* Names for the people in view. The entry keeps the address as it was;
     the name is today's, and only decoration beside it. */
  const actorIds = [...new Set(entries.map((entry) => entry.actorId).filter((id): id is string => Boolean(id)))];
  const names = new Map(
    (
      await safeQuery(
        "admin:activity:names",
        () => prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } }),
        [] as { id: string; name: string }[],
      )
    ).map((user) => [user.id, user.name]),
  );

  const offline = isDatabaseOffline();
  const absolute = new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Bangkok",
  });
  const full = new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });

  /*
    A lookup rather than a chain of ternaries, and it falls back to the
    stored string rather than to "edited". The old chain treated everything
    it did not recognise as an edit, which was harmless while only three
    actions existed and became a lie the moment sign-ins were added: a
    "login" row read as "edited Session".
  */
  const actionLabels: Record<string, string> = {
    create: t("activity.actionCreate"),
    update: t("activity.actionUpdate"),
    delete: t("activity.actionDelete"),
    [AUTH_LOGIN]: t("activity.actionLogin"),
    [AUTH_LOGOUT]: t("activity.actionLogout"),
    [AUTH_LOGIN_FAILED]: t("activity.actionLoginFailed"),
    [AUTH_TOTP_FAILED]: t("activity.actionTotpFailed"),
    [CONTACT_REVEAL]: t("activity.actionRevealContact"),
    [LEAD_ERASE]: t("activity.actionEraseLead"),
  };
  const actionLabel = (action: string) => actionLabels[action] ?? action;

  /**
   * The small line under the name.
   *
   * It carries the one thing a reader could otherwise get wrong. On a
   * failed sign-in the address is a string someone typed, not an identity
   * the application confirmed, and a row that looks like "super@… ·
   * SUPER_ADMIN" beside "failed sign-in" invites exactly the wrong reading
   * — that a known administrator did something — when it may have been a
   * stranger typing a known address.
   */
  const actorNote = (entry: { action: string; actorRole: Role | null; actorId: string | null }) =>
    [
      entry.actorRole ? t(`roles.${entry.actorRole}` as never) : null,
      isFailedAuth(entry.action)
        ? t("activity.unverified")
        : // The account can be gone; the entry is not.
          entry.actorId === null
          ? t("activity.deletedActor")
          : null,
    ]
      .filter(Boolean)
      .join(" · ");

  type Entry = (typeof entries)[number];
  type Changes = Record<string, { before: unknown; after: unknown }> | null;

  /** The "what changed" cell: the first real change, before → after. */
  const changeOf = (entry: Entry) => {
    const pairs = Object.entries((entry.changes as Changes) ?? {});
    if (pairs.length > 0) {
      const [field, change] = pairs[0];
      return {
        label: fieldLabel(field),
        before: clip(printable(change.before)) || "—",
        after: clip(printable(change.after)) || "—",
        more: pairs.length - 1,
      };
    }
    return null;
  };

  const itemOf = (entry: Entry) =>
    isAuthEvent(entry.model)
      ? null
      : entry.count !== null
        ? t("activity.bulk", { count: entry.count })
        : entry.recordLabel;

  /** The query string for a link, keeping the current filters. */
  const href = (change: Record<string, string | undefined>) => {
    const next: Record<string, string | undefined> = {
      tab: filters.category,
      range: filters.range,
      actor: filters.actor,
      q: filters.q,
      ...change,
    };
    const query = new URLSearchParams();
    if (next.tab && next.tab !== "all") query.set("tab", next.tab);
    if (next.range && next.range !== DEFAULT_RANGE) query.set("range", next.range);
    if (next.actor) query.set("actor", next.actor);
    if (next.q) query.set("q", next.q);
    if (next.show) query.set("show", next.show);
    if (next.entry) query.set("entry", next.entry);
    const suffix = query.toString();
    return `/${locale}/admin/activity${suffix ? `?${suffix}` : ""}`;
  };
  const keepShown = shown > PAGE_SIZE ? String(shown) : undefined;

  const EDIT_PATHS: Record<string, string> = {
    Project: "projects",
    NewsArticle: "news",
    Event: "events",
    EBrochure: "e-brochures",
  };
  const CUSTOMER_MODELS = new Set(["LeadInquiry", "EventRegistration", "LeadNote"]);

  /* The entry the drawer shows. Looked up on its own, so a link to one
     entry still opens it after the filters or the period have moved on. */
  const selected = searchParams.entry
    ? (entries.find((row) => row.id === searchParams.entry) ??
      (await safeQuery("admin:activity:entry", () => prisma.auditLog.findUnique({ where: { id: searchParams.entry } }), null)))
    : null;

  const selectedView: AuditEntryView | null = selected
    ? (() => {
        const rows = Object.entries((selected.changes as Changes) ?? {}).map(([field, change]) => ({
          field,
          label: fieldLabel(field),
          before: printable(change.before),
          after: printable(change.after),
        }));

        const reason =
          rows.length > 0
            ? null
            : CUSTOMER_MODELS.has(selected.model)
              ? ("customerData" as const)
              : selected.action !== "update"
                ? ("notAnUpdate" as const)
                : ("noChange" as const);

        return {
          id: selected.id,
          recordLabel: selected.recordLabel,
          modelLabel: auditModelLabel(selected.model, modelLabels),
          actionLabel: actionLabel(selected.action),
          actorName: selected.actorEmail,
          actorRole: selected.actorRole ? t(`roles.${selected.actorRole}` as never) : null,
          at: full.format(selected.createdAt),
          ip: selected.ipAddress,
          userAgent: deviceLabel(selected.userAgent),
          changes: rows,
          noValuesReason: reason,
          canRevert: rows.length > 0 && selected.action === "update",
          recordHref:
            selected.recordId && EDIT_PATHS[selected.model]
              ? `/${locale}/admin/${EDIT_PATHS[selected.model]}/${selected.recordId}/edit`
              : null,
        };
      })()
    : null;

  const exportQuery = new URLSearchParams({ locale });
  if (filters.category !== "all") exportQuery.set("tab", filters.category);
  exportQuery.set("range", filters.range);
  if (filters.actor) exportQuery.set("actor", filters.actor);
  if (filters.q) exportQuery.set("q", filters.q);

  const statCards: { key: string; icon: LucideIcon; label: string; value: number; alert?: boolean }[] = [
    { key: "unit", icon: Tag, label: t("activity.statUnit"), value: stats.unit },
    { key: "failed", icon: ShieldAlert, label: t("activity.statFailed"), value: stats.failed, alert: stats.failed > 0 },
    { key: "reveals", icon: Eye, label: t("activity.statReveals"), value: stats.reveals },
    { key: "active", icon: Users, label: t("activity.statActive"), value: stats.active },
  ];

  const chip = (action: string) => {
    const style = ACTION_STYLE[action] ?? { icon: Pencil, tone: "neutral" as const };
    const Icon = style.icon;
    return (
      <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE[style.tone]}`}>
        <Icon size={13} aria-hidden />
        {actionLabel(action)}
      </span>
    );
  };

  const who = (entry: Entry) => {
    const name = entry.actorId ? names.get(entry.actorId) : undefined;
    const note = actorNote(entry);
    return {
      // A failed sign-in has no account behind it: the address typed is
      // all there is, and it is shown as what it is.
      title: name ?? entry.actorEmail,
      sub: [note, name ? entry.actorEmail : null].filter(Boolean).join(" · "),
      initials: isFailedAuth(entry.action) ? "?" : initialsOf(name ?? entry.actorEmail),
      unknown: isFailedAuth(entry.action),
    };
  };

  const avatar = (person: ReturnType<typeof who>, size: string) => (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-full font-semibold ${size} ${
        person.unknown ? "bg-adm-danger-bg text-adm-danger" : "bg-adm-neutral-bg text-adm-neutral"
      }`}
    >
      {person.initials}
    </span>
  );

  const changeCell = (entry: Entry) => {
    const change = changeOf(entry);
    if (change) {
      return (
        <>
          <span className="text-adm-muted">
            {change.label}: {change.before}
          </span>{" "}
          <span aria-hidden className="text-adm-muted">
            →
          </span>{" "}
          <span className="font-medium text-adm-text">{change.after}</span>
          {change.more > 0 && <span className="ml-1.5 text-xs text-adm-muted">{t("activity.moreFields", { count: change.more })}</span>}
        </>
      );
    }
    // Field names only: creates, deletes, and everything about a customer
    // (see AuditLog.changes) store no values.
    if (entry.changedFields.length > 0) {
      return <span className="text-xs text-adm-muted">{clip(entry.changedFields.join(", "), 140)}</span>;
    }
    return <span className="text-adm-muted">{t("common.none")}</span>;
  };

  const origin = (entry: Entry) => ({ ip: entry.ipAddress, device: deviceLabel(entry.userAgent) });

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow={zoneEyebrow((key) => t(key as never), "activity")}
        title={t("activity.title")}
        description={t("activity.subtitle")}
        actions={
          <a href={`/api/admin/activity/export?${exportQuery.toString()}`} className="admin-btn-ghost">
            <Download size={15} aria-hidden />
            {t("activity.export")}
          </a>
        }
      />

      {/* Shown above the table, not instead of it: a stale page with a
          warning is more use than a blank one, and the same banner appears
          on every other admin index. */}
      {offline && (
        <p className="rounded-xs border border-adm-warning/30 bg-adm-warning-bg px-4 py-3 text-sm text-adm-warning">
          {t("common.offline")}
        </p>
      )}

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {statCards.map(({ key, icon: Icon, label, value, alert }) => (
          <div key={key} className="admin-card space-y-1.5 px-5! py-4!">
            <dt className="flex items-center gap-1.5 text-[12.5px] text-adm-muted">
              <Icon size={15} aria-hidden className="shrink-0" />
              {label}
            </dt>
            <dd className={`text-[28px] font-semibold leading-none tabular-nums ${alert ? "text-adm-danger" : "text-adm-text"}`}>
              {value.toLocaleString()}
            </dd>
          </div>
        ))}
      </dl>

      <section className="admin-card overflow-hidden p-0!">
        <div className="space-y-3 border-b border-adm-line px-4 py-3.5">
          {/* The bar itself scrolls when it does not fit, as AdminTabs' pill
              bar does: clipped by a parent, a rounded bar ends in a square
              edge. */}
          <nav aria-label={t("activity.tabsLabel")} className="flex min-w-0">
            <div className="flex w-fit min-w-0 max-w-full gap-0.5 overflow-x-auto rounded-full bg-adm-neutral-bg p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {ACTIVITY_CATEGORIES.map((category) => {
                const active = filters.category === category;
                return (
                  <Link
                    key={category}
                    href={href({ tab: category })}
                    aria-current={active ? "page" : undefined}
                    className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-2 text-[13px] transition-colors ${
                      active ? "bg-white font-semibold text-adm-text shadow-xs" : "text-adm-muted hover:text-adm-text"
                    }`}
                  >
                    {t(`activity.tab.${category}` as never)}
                    <span className="text-[11.5px] font-normal text-adm-muted tabular-nums">{counts[category].toLocaleString()}</span>
                  </Link>
                );
              })}
            </div>
          </nav>

          {/* A plain GET form: the selections land in the query string, so a
              filtered view can be sent to someone, the back button works,
              and the page needs no client JavaScript to filter. */}
          <form method="get" className="flex flex-wrap items-center gap-2">
            {filters.category !== "all" && <input type="hidden" name="tab" value={filters.category} />}
            <label className="relative flex items-center">
              <span className="sr-only">{t("common.search")}</span>
              <Search size={15} aria-hidden className="pointer-events-none absolute left-3 text-adm-muted" />
              <input
                type="search"
                name="q"
                defaultValue={filters.q ?? ""}
                placeholder={t("activity.searchPlaceholder")}
                className="admin-input w-72 max-w-full pl-9!"
              />
            </label>
            <label>
              <span className="sr-only">{t("activity.filterPerson")}</span>
              <select name="actor" defaultValue={filters.actor ?? ""} className="admin-input max-w-48">
                <option value="">{t("activity.allPeople")}</option>
                {people.map((person) => (
                  <option key={person.actorEmail} value={person.actorEmail}>
                    {person.actorEmail}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">{t("activity.filterRange")}</span>
              <select name="range" defaultValue={filters.range} className="admin-input">
                {ACTIVITY_RANGES.map((range) => (
                  <option key={range} value={range}>
                    {t(`activity.range.${range}` as never)}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="admin-btn-ghost">
              {t("common.search")}
            </button>
          </form>
        </div>

        {entries.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-adm-muted">
            {counts.all === 0 && !filters.q && !filters.actor ? t("activity.empty") : t("activity.emptyFiltered")}
          </p>
        ) : (
          <>
            {/* ── sm and up: the table ─────────────────────────────────── */}
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[980px] border-collapse">
                <thead>
                  <tr>
                    <th scope="col" className="admin-th pl-[22px]!">{t("activity.when")}</th>
                    <th scope="col" className="admin-th">{t("activity.who")}</th>
                    <th scope="col" className="admin-th">{t("activity.what")}</th>
                    <th scope="col" className="admin-th">{t("activity.record")}</th>
                    <th scope="col" className="admin-th">{t("activity.colChange")}</th>
                    <th scope="col" className="admin-th">{t("activity.colOrigin")}</th>
                    <th scope="col" className="admin-th w-10" />
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => {
                    const person = who(entry);
                    const item = itemOf(entry);
                    const from = origin(entry);
                    return (
                      <tr key={entry.id} className={selected?.id === entry.id ? "bg-adm-fill/8" : "hover:bg-adm-text/[0.025]"}>
                        {/* The time cell is the row's own link: a plain <a>
                            keeps the selection in the URL, so a particular
                            entry can be sent to someone. */}
                        <td className="admin-td whitespace-nowrap pl-[22px]!">
                          <Link href={href({ entry: entry.id, show: keepShown })} scroll={false} className="block hover:underline">
                            <span className="block font-medium text-adm-text">{relativeTime(entry.createdAt, now, intlLocale(locale))}</span>
                            <time dateTime={entry.createdAt.toISOString()} className="block text-xs text-adm-muted">
                              {absolute.format(entry.createdAt)}
                            </time>
                          </Link>
                        </td>
                        <td className="admin-td max-w-[260px]">
                          <span className="flex items-center gap-2.5">
                            {avatar(person, "size-[34px] text-xs")}
                            <span className="min-w-0">
                              <span className="block truncate font-medium text-adm-text">{person.title}</span>
                              {person.sub && <span className="block truncate text-xs text-adm-muted">{person.sub}</span>}
                            </span>
                          </span>
                        </td>
                        <td className="admin-td">{chip(entry.action)}</td>
                        <td className="admin-td max-w-[280px] whitespace-normal!">
                          <span className="block text-[11.5px] text-adm-muted">
                            {t(`activity.tab.${categoryOf(entry.model)}` as never)}
                            {/* "signed in" says it all; "signed in Session" does not. */}
                            {!isAuthEvent(entry.model) && <> · {auditModelLabel(entry.model, modelLabels)}</>}
                          </span>
                          {!isAuthEvent(entry.model) && (
                            <span className="block text-adm-text">
                              {item ?? <span className="text-adm-muted">{t("activity.noLabel")}</span>}
                            </span>
                          )}
                        </td>
                        <td className="admin-td max-w-[320px] whitespace-normal!">{changeCell(entry)}</td>
                        <td className="admin-td whitespace-nowrap">
                          {from.ip || from.device ? (
                            <>
                              <span className="block tabular-nums text-adm-text">{from.ip ?? t("common.none")}</span>
                              {from.device && <span className="block text-xs text-adm-muted">{from.device}</span>}
                            </>
                          ) : (
                            <span className="text-adm-muted">{t("common.none")}</span>
                          )}
                        </td>
                        <td className="admin-td text-right">
                          <Link
                            href={href({ entry: entry.id, show: keepShown })}
                            scroll={false}
                            aria-label={t("activity.openEntry")}
                            className="admin-btn-quiet admin-btn-sm px-1.5!"
                          >
                            <ChevronRight size={16} aria-hidden />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ── Below sm: one card per entry ─────────────────────────── */}
            <ul className="divide-y divide-adm-line sm:hidden">
              {entries.map((entry) => {
                const person = who(entry);
                const item = itemOf(entry);
                const from = origin(entry);
                return (
                  <li key={entry.id}>
                    <Link href={href({ entry: entry.id, show: keepShown })} scroll={false} className="block space-y-2 px-4 py-3.5">
                      <span className="flex items-center gap-2.5">
                        {avatar(person, "size-9 text-xs")}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold text-adm-text">{person.title}</span>
                          <span className="block truncate text-xs text-adm-muted">
                            {[person.sub, relativeTime(entry.createdAt, now, intlLocale(locale))].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                        {chip(entry.action)}
                      </span>
                      {!isAuthEvent(entry.model) && (
                        <span className="block text-sm">
                          <span className="block text-[11.5px] text-adm-muted">{auditModelLabel(entry.model, modelLabels)}</span>
                          {item ?? <span className="text-adm-muted">{t("activity.noLabel")}</span>}
                        </span>
                      )}
                      {(changeOf(entry) || entry.changedFields.length > 0) && (
                        <span className="block rounded-[10px] bg-adm-text/4 px-2.5 py-2 text-[12.5px]">{changeCell(entry)}</span>
                      )}
                      <span className="block text-xs text-adm-muted tabular-nums">
                        {[absolute.format(entry.createdAt), from.ip, from.device].filter(Boolean).join(" · ")}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>

            {total > entries.length && (
              <div className="flex justify-center border-t border-adm-line px-4 py-3">
                {entries.length < MAX_ROWS ? (
                  <Link
                    href={href({ show: String(Math.min(MAX_ROWS, shown + PAGE_SIZE)) })}
                    scroll={false}
                    className="admin-btn-quiet max-sm:min-h-11!"
                  >
                    {t("activity.showMore", { count: total - entries.length })}
                  </Link>
                ) : (
                  <p className="text-xs text-adm-muted">{t("activity.maxShown", { max: MAX_ROWS })}</p>
                )}
              </div>
            )}
          </>
        )}
      </section>

      <p className="px-1 text-[12.5px] text-adm-muted">{t("activity.footnote")}</p>

      {selectedView && (
        <AdminDrawer
          title={t("activity.detail.title")}
          closeHref={href({ show: keepShown })}
          closeLabel={t("leadDrawer.close")}
          width={520}
        >
          <AuditDetailPanel
            locale={locale}
            entry={selectedView}
            labels={{
              title: selectedView.actionLabel,
              empty: t("activity.detail.empty"),
              record: t("activity.detail.record"),
              actor: t("activity.detail.actor"),
              time: t("activity.detail.time"),
              from: t("activity.detail.from"),
              openRecord: t("activity.detail.openRecord"),
              revert: t("activity.detail.revert"),
              revertNote: t("activity.detail.revertNote"),
              reverted: t("activity.detail.reverted"),
              confirm: t("activity.detail.confirm"),
              reason: {
                customerData: t("activity.detail.reason.customerData"),
                notAnUpdate: t("activity.detail.reason.notAnUpdate"),
                noChange: t("activity.detail.reason.noChange"),
              },
              error: {
                NOT_FOUND: t("activity.detail.error.NOT_FOUND"),
                NOT_REVERTABLE: t("activity.detail.error.NOT_REVERTABLE"),
                CUSTOMER_DATA: t("activity.detail.error.CUSTOMER_DATA"),
                NO_VALUES: t("activity.detail.error.NO_VALUES"),
                TRUNCATED: t("activity.detail.error.TRUNCATED"),
                RECORD_GONE: t("activity.detail.error.RECORD_GONE"),
                REVERT_FAILED: t("common.error"),
              },
            }}
          />
        </AdminDrawer>
      )}
    </div>
  );
}
