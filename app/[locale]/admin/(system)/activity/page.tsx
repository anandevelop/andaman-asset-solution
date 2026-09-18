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
 * Read-only by construction. There is no action file here, and the only
 * two things that write to AuditLog anywhere are lib/audit/extension.ts,
 * which records changes by watching Prisma, and lib/audit/events.ts, which
 * records sign-ins and sign-outs because there is no write for the
 * extension to watch. Nothing deletes or edits a row — an audit trail an
 * administrator can rewrite answers no question worth asking.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import AuditDetailPanel, { type AuditEntryView } from "@/components/admin/AuditDetailPanel";
import { History } from "lucide-react";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { safeQuery, isDatabaseOffline } from "@/lib/db";
import { requireAdmin } from "@/lib/admin/guard";
import {
  AUTH_LOGIN,
  AUTH_LOGIN_FAILED,
  AUTH_LOGOUT,
  AUTH_TOTP_FAILED,
  isAuthEvent,
  isFailedAuth,
} from "@/lib/audit/events";
import { intlLocale } from "@/lib/format";

/** Entries are written constantly; a cached page would be a stale one. */
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string; actor?: string; model?: string; entry?: string }>;
};

/** 1-based, clamped — a hand-edited ?page=0 or ?page=abc lands on page one. */
function parsePage(raw: string | undefined): number {
  const value = Number(raw);
  return Number.isFinite(value) && value >= 1 ? Math.floor(value) : 1;
}

export default async function AdminActivityPage(props: Props) {
  const [params, searchParams] = await Promise.all([props.params, props.searchParams]);
  const { locale } = params;

  await requireAdmin(locale, Role.SUPER_ADMIN);

  const t = await getTranslations({ locale, namespace: "admin" });
  // Field labels are already written for the publishing screen; one
  // vocabulary for "which field changed" across the admin, not two.
  const tPublishing = await getTranslations({ locale, namespace: "admin.publishing" });

  const page = parsePage(searchParams.page);
  const actorFilter = searchParams.actor?.trim() || undefined;
  const modelFilter = searchParams.model?.trim() || undefined;

  const where = {
    /*
      Filtered by address, not by actorId.

      Two kinds of entry have no actorId: one whose account was deleted,
      and a failed sign-in against an address that never had an account —
      and the second kind is precisely what somebody comes to this filter
      for. Keying on the id rendered both as an option with an empty value,
      which silently selected "Everyone".

      The cost is that an account which later changes address appears
      twice. That is the honest reading anyway: each entry stores the
      address as it was at the time, and "what was done under this address"
      is the question this table can actually answer.
    */
    ...(actorFilter ? { actorEmail: actorFilter } : {}),
    ...(modelFilter ? { model: modelFilter } : {}),
  };

  const [entries, total, people, types] = await Promise.all([
    safeQuery(
      "admin:activity",
      () =>
        prisma.auditLog.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * PAGE_SIZE,
          take: PAGE_SIZE,
        }),
      [] as Awaited<ReturnType<typeof prisma.auditLog.findMany>>,
    ),
    safeQuery("admin:activity:count", () => prisma.auditLog.count({ where }), 0),
    /*
      Filter options come from the log itself, not from the user table: the
      point of a name in this list is that they did something, and an actor
      whose account has since been deleted still has entries worth reading.
    */
    safeQuery(
      "admin:activity:people",
      () =>
        prisma.auditLog.groupBy({
          by: ["actorEmail"],
          orderBy: { actorEmail: "asc" },
        }),
      [] as { actorEmail: string }[],
    ),
    safeQuery(
      "admin:activity:types",
      () => prisma.auditLog.groupBy({ by: ["model"], orderBy: { model: "asc" } }),
      [] as { model: string }[],
    ),
  ]);

  const offline = isDatabaseOffline();
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const formatter = new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: "medium",
    timeStyle: "short",
  });

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
  };

  const actionLabel = (action: string) => actionLabels[action] ?? action;

  /**
   * The small line under the address.
   *
   * It carries the one thing a reader could otherwise get wrong. On a
   * failed sign-in the address is a string someone typed, not an identity
   * the application confirmed, and a row that looks like "super@… ·
   * SUPER_ADMIN" beside "failed sign-in" invites exactly the wrong reading
   * — that a known administrator did something — when it may have been a
   * stranger typing a known address.
   */
  const actorNote = (entry: {
    action: string;
    actorRole: Role | null;
    actorId: string | null;
  }) =>
    [
      entry.actorRole,
      isFailedAuth(entry.action)
        ? t("activity.unverified")
        : // The account can be gone; the entry is not.
          entry.actorId === null
          ? t("activity.deletedActor")
          : null,
    ]
      .filter(Boolean)
      .join(" · ");

  /*
    The entry the panel is showing. Defaults to the newest one so the panel
    is never an empty box on arrival, matching how the leads and publishing
    screens seed their own side panels.
  */
  const selected = entries.find((row) => row.id === searchParams.entry) ?? entries[0] ?? null;

  const EDIT_PATHS: Record<string, string> = {
    Project: "projects",
    NewsArticle: "news",
    Event: "events",
    EBrochure: "e-brochures",
  };

  const CUSTOMER_MODELS = new Set(["LeadInquiry", "EventRegistration", "LeadNote"]);

  const printable = (value: unknown): string => {
    if (value === null || value === undefined) return "";
    if (typeof value === "string") return value;
    if (typeof value === "boolean") return value ? "✓" : "✗";
    return JSON.stringify(value);
  };

  const selectedView: AuditEntryView | null = selected
    ? (() => {
        const changes = (selected.changes ?? null) as Record<
          string,
          { before: unknown; after: unknown }
        > | null;

        const rows = Object.entries(changes ?? {}).map(([field, change]) => ({
          field,
          // The publishing screen already names these fields; reuse those
          // labels rather than inventing a second vocabulary.
          label: tPublishing.has(`changed.field.${field}` as never)
            ? tPublishing(`changed.field.${field}` as never)
            : field,
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
          modelLabel: selected.model,
          actionLabel: actionLabels[selected.action] ?? selected.action,
          actorName: selected.actorEmail,
          actorRole: selected.actorRole,
          at: formatter.format(selected.createdAt),
          ip: selected.ipAddress,
          userAgent: null,
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

  /** Selects one entry without dropping the current filters or page. */
  const entryHref = (id: string) => {
    const query = new URLSearchParams();
    if (actorFilter) query.set("actor", actorFilter);
    if (modelFilter) query.set("model", modelFilter);
    if (page > 1) query.set("page", String(page));
    query.set("entry", id);
    return `/${locale}/admin/activity?${query.toString()}`;
  };

  /** Keeps the current filters when only the page changes. */
  const pageHref = (target: number) => {
    const query = new URLSearchParams();
    if (actorFilter) query.set("actor", actorFilter);
    if (modelFilter) query.set("model", modelFilter);
    if (target > 1) query.set("page", String(target));
    const suffix = query.toString();
    return `/${locale}/admin/activity${suffix ? `?${suffix}` : ""}`;
  };

  return (
    <div className="space-y-6">
      <header className="flex items-start gap-3">
        <History className="mt-1 h-5 w-5 text-primary" aria-hidden />
        <div>
          <h1 className="text-xl font-semibold text-ink">{t("activity.title")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink/70">{t("activity.subtitle")}</p>
        </div>
      </header>

      {/* A plain GET form: the selections land in the query string, so a
          filtered view can be sent to someone, the back button works, and
          the page needs no client JavaScript to filter. */}
      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-medium text-ink/70">
          <span className="mb-1 block">{t("activity.filterPerson")}</span>
          <select
            name="actor"
            defaultValue={actorFilter ?? ""}
            className="admin-input min-w-56"
          >
            <option value="">{t("activity.allPeople")}</option>
            {people.map((person) => (
              <option key={person.actorEmail} value={person.actorEmail}>
                {person.actorEmail}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs font-medium text-ink/70">
          <span className="mb-1 block">{t("activity.filterType")}</span>
          <select
            name="model"
            defaultValue={modelFilter ?? ""}
            className="admin-input min-w-48"
          >
            <option value="">{t("activity.allTypes")}</option>
            {types.map((type) => (
              <option key={type.model} value={type.model}>
                {type.model}
              </option>
            ))}
          </select>
        </label>

        <button type="submit" className="admin-btn">
          {t("common.search")}
        </button>
      </form>

      {/* Shown above the table, not instead of it: a stale page with a
          warning is more use than a blank one, and the same banner appears
          on every other admin index. */}
      {offline && (
        <p className="rounded-xs border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t("common.offline")}
        </p>
      )}

      {entries.length === 0 ? (
        <p className="rounded-xs border border-primary/10 bg-white p-6 text-sm text-ink/60">
          {t("activity.empty")}
        </p>
      ) : (
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="overflow-x-auto rounded-xs border border-primary/10 bg-white">
            <table className="w-full min-w-208 text-left text-sm">
              <thead className="border-b border-primary/10 text-xs uppercase tracking-wide text-ink/50">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">{t("activity.when")}</th>
                  <th scope="col" className="px-4 py-3 font-medium">{t("activity.who")}</th>
                  <th scope="col" className="px-4 py-3 font-medium">{t("activity.what")}</th>
                  <th scope="col" className="px-4 py-3 font-medium">{t("activity.record")}</th>
                  <th scope="col" className="px-4 py-3 font-medium">{t("activity.fields")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-primary/5">
                {entries.map((entry) => (
                  <tr
                    key={entry.id}
                    className={`align-top transition-colors ${
                      selected?.id === entry.id ? "bg-accent/6" : "hover:bg-surface-muted/60"
                    }`}
                  >
                    {/* The time cell is the row's own link: a plain <a>
                        keeps the selection in the URL, so a particular
                        entry can be sent to someone. */}
                    <td className="whitespace-nowrap px-4 py-3 text-ink/70">
                      <Link href={entryHref(entry.id)} className="hover:text-primary">
                        <time dateTime={entry.createdAt.toISOString()}>
                          {formatter.format(entry.createdAt)}
                        </time>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className="block text-ink">{entry.actorEmail}</span>
                      <span className="block text-xs text-ink/50">{actorNote(entry)}</span>
                      {/* Under the name rather than in a column of its own:
                          it is only ever read together with the person, and a
                          sixth column pushed the table into a horizontal
                          scroll on every laptop. */}
                      {entry.ipAddress && (
                        <span className="block font-mono text-[11px] text-ink/40">
                          {entry.ipAddress}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-ink">
                      {actionLabel(entry.action)}
                      {/* "signed in" says it all; "signed in Session" does not. */}
                      {!isAuthEvent(entry.model) && (
                        <span className="ml-1 text-ink/50">{entry.model}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-ink/70">
                      {/* An auth event is about a person, not a row. "no name
                          recorded" would read as a fault; there was never a
                          record to name. */}
                      {isAuthEvent(entry.model) ? (
                        <span className="text-ink/40">{t("common.none")}</span>
                      ) : entry.count !== null ? (
                        t("activity.bulk", { count: entry.count })
                      ) : (
                        (entry.recordLabel ?? (
                          <span className="text-ink/40">{t("activity.noLabel")}</span>
                        ))
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-ink/50">
                      {entry.changedFields.join(", ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <AuditDetailPanel
          locale={locale}
          entry={selectedView}
          labels={{
            title: t("activity.detail.title"),
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
      </div>
      )}

      {pageCount > 1 && (
        <nav className="flex items-center justify-between text-sm" aria-label={t("activity.title")}>
          {page > 1 ? (
            <Link href={pageHref(page - 1)} className="text-primary hover:underline">
              {t("activity.newer")}
            </Link>
          ) : (
            <span />
          )}
          <span className="text-ink/50">
            {page} / {pageCount}
          </span>
          {page < pageCount ? (
            <Link href={pageHref(page + 1)} className="text-primary hover:underline">
              {t("activity.older")}
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
