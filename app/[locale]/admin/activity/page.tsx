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
 * Read-only by construction. There is no action file here and no route
 * that writes to AuditLog outside lib/audit/extension.ts — an audit trail
 * an administrator can edit answers no question worth asking.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { History } from "lucide-react";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { safeQuery, isDatabaseOffline } from "@/lib/db";
import { requireAdmin } from "@/lib/admin/guard";
import { intlLocale } from "@/lib/format";

/** Entries are written constantly; a cached page would be a stale one. */
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string; actor?: string; model?: string }>;
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

  const page = parsePage(searchParams.page);
  const actorFilter = searchParams.actor?.trim() || undefined;
  const modelFilter = searchParams.model?.trim() || undefined;

  const where = {
    ...(actorFilter ? { actorId: actorFilter } : {}),
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
          by: ["actorId", "actorEmail"],
          orderBy: { actorEmail: "asc" },
        }),
      [] as { actorId: string | null; actorEmail: string }[],
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

  const actionLabel = (action: string) =>
    action === "create"
      ? t("activity.actionCreate")
      : action === "delete"
        ? t("activity.actionDelete")
        : t("activity.actionUpdate");

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
              <option key={person.actorId ?? person.actorEmail} value={person.actorId ?? ""}>
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
        <p className="rounded-sm border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t("common.offline")}
        </p>
      )}

      {entries.length === 0 ? (
        <p className="rounded-sm border border-primary/10 bg-white p-6 text-sm text-ink/60">
          {t("activity.empty")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-sm border border-primary/10 bg-white">
          <table className="w-full min-w-[52rem] text-left text-sm">
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
                <tr key={entry.id} className="align-top">
                  <td className="whitespace-nowrap px-4 py-3 text-ink/70">
                    <time dateTime={entry.createdAt.toISOString()}>
                      {formatter.format(entry.createdAt)}
                    </time>
                  </td>
                  <td className="px-4 py-3">
                    <span className="block text-ink">{entry.actorEmail}</span>
                    <span className="text-xs text-ink/50">
                      {entry.actorRole}
                      {/* The account can be gone; the entry is not. */}
                      {entry.actorId === null && ` · ${t("activity.deletedActor")}`}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-ink">
                    {actionLabel(entry.action)}
                    <span className="ml-1 text-ink/50">{entry.model}</span>
                  </td>
                  <td className="px-4 py-3 text-ink/70">
                    {entry.count !== null
                      ? t("activity.bulk", { count: entry.count })
                      : (entry.recordLabel ?? (
                          <span className="text-ink/40">{t("activity.noLabel")}</span>
                        ))}
                  </td>
                  <td className="px-4 py-3 text-xs text-ink/50">
                    {entry.changedFields.join(", ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
