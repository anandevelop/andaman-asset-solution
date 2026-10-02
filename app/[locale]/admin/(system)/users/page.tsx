/**
 * app/[locale]/admin/users/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Account list plus the create form. SUPER_ADMIN only — requireAdmin
 * redirects anyone else to the dashboard with ?denied=1.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AlertCircle, Pencil, Plus, ShieldCheck } from "lucide-react";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { safeQuery, isDatabaseOffline } from "@/lib/db";
import { requireAdmin } from "@/lib/admin/guard";
import { intlLocale } from "@/lib/format";
import { relativeTime } from "@/lib/relative-time";
import { AUTH_LOGIN } from "@/lib/audit/events";
import { PERMISSION_MATRIX, CAPABILITIES, ROLE_ORDER } from "@/lib/permissions";
import { createUser } from "./actions";
import UserForm from "@/components/admin/UserForm";
import AdminPageHeader from "@/components/admin/ui/AdminPageHeader";
import Avatar from "@/components/admin/ui/Avatar";
import { zoneEyebrow } from "@/lib/admin/nav";

type Props = { params: Promise<{ locale: string }> };

export default async function AdminUsersPage(props: Props) {
  const params = await props.params;

  const {
    locale
  } = params;

  const actor = await requireAdmin(locale, Role.SUPER_ADMIN);

  const t = await getTranslations({ locale, namespace: "admin" });

  const users = await safeQuery(
    "admin:users",
    () =>
      prisma.user.findMany({
        orderBy: [{ isActive: "desc" }, { role: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          createdAt: true,
          totpEnabledAt: true,
          scopedProjects: { select: { id: true, nameEn: true, nameTh: true } },
          salesPerson: { select: { id: true, nameEn: true, nameTh: true } },
        },
      }),
    [],
  );

  /*
    Only the unclaimed profiles, because this list feeds the *create* form —
    there is no existing link to keep in the options. The edit page has to
    add the account's own profile back; see its own query.
  */
  const salesPeople = await safeQuery(
    "admin:users:salesPeople",
    () =>
      prisma.salesPerson.findMany({
        where: { staffAccount: { is: null } },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: { id: true, nameEn: true, nameTh: true },
      }),
    [],
  );

  /*
    Last sign-in is read from AuditLog rather than stored on the user: the
    trail already records every sign-in (lib/audit), and a second copy on
    the row would be one more thing to keep in step with it.
  */
  const lastSignIns = await safeQuery(
    "admin:users:lastSignIn",
    () =>
      prisma.auditLog.findMany({
        where: { action: AUTH_LOGIN, actorId: { in: users.map((user) => user.id) } },
        orderBy: { createdAt: "desc" },
        distinct: ["actorId"],
        select: { actorId: true, createdAt: true },
      }),
    [],
  );
  const lastSignInBy = new Map(lastSignIns.map((row) => [row.actorId, row.createdAt]));

  const offline = isDatabaseOffline();

  const dateFormat = new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="space-y-8">
      <AdminPageHeader
        eyebrow={zoneEyebrow((key) => t(key as never), "users")}
        title={t("users.title")}
        description={t("users.subtitle")}
      />

      {offline && (
        <p className="rounded-xs border border-adm-warning/30 bg-adm-warning-bg px-4 py-3 text-sm text-adm-warning">
          {t("common.offline")}
        </p>
      )}

      {/* ── Existing accounts ───────────────────────────────────────── */}
      {users.length > 0 && (
        <div className="overflow-x-auto rounded-card border border-adm-line bg-adm-solid">
          <table className="w-full min-w-[840px] border-collapse">
            <thead className="border-b border-adm-line bg-adm-text/4">
              <tr>
                <th className="admin-th">{t("users.name")}</th>
                <th className="admin-th">{t("users.role")}</th>
                <th className="admin-th">{t("users.scope")}</th>
                <th className="admin-th">{t("users.salesPerson")}</th>
                <th className="admin-th">{t("users.twoFactor")}</th>
                <th className="admin-th">{t("users.lastSignIn")}</th>
                <th className="admin-th">{t("users.status")}</th>
                <th className="admin-th" />
              </tr>
            </thead>

            <tbody className="divide-y divide-adm-line">
              {users.map((user) => (
                <tr
                  key={user.id}
                  className="transition-colors"
                >
                  <td className="admin-td">
                    <span className="flex items-center gap-2.5">
                      <Avatar id={user.id} name={user.name} />
                      <span className="min-w-0">
                        <span className="flex items-center gap-2 font-medium text-adm-text">
                          {user.name}
                          {user.id === actor.id && (
                            <span className="rounded-full bg-adm-fill/20 px-1.5 py-0.5 text-[11px] font-medium text-adm-accent-ink">
                              {t("users.you")}
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block text-xs text-adm-muted">{user.email}</span>
                      </span>
                    </span>
                  </td>

                  <td className="admin-td whitespace-nowrap">
                    <span
                      className={[
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-medium",
                        user.role === Role.SUPER_ADMIN
                          ? "bg-adm-fill/20 text-adm-accent-ink"
                          : "bg-adm-status-info-bg text-adm-status-info",
                      ].join(" ")}
                    >
                      {user.role === Role.SUPER_ADMIN && <ShieldCheck size={12} aria-hidden />}
                      {t(`roles.${user.role}` as never)}
                    </span>
                  </td>

                  {/* Empty means unscoped — the whole company, not
                      nothing. See User.scopedProjects. */}
                  <td className="admin-td max-w-[220px] truncate text-xs text-adm-muted">
                    {user.scopedProjects.length > 0
                      ? user.scopedProjects
                          .map((project) => (locale === "th" ? project.nameTh : project.nameEn))
                          .join(", ")
                      : t("users.scopeAll")}
                  </td>

                  {/* Unlinked is the common case and not a fault — an em
                      dash, not a warning. */}
                  <td className="admin-td max-w-[180px] truncate text-xs text-adm-muted">
                    {user.salesPerson
                      ? locale === "th"
                        ? user.salesPerson.nameTh
                        : user.salesPerson.nameEn
                      : "—"}
                  </td>

                  <td className="admin-td whitespace-nowrap text-xs">
                    {user.totpEnabledAt ? (
                      <span className="flex items-center gap-1.5 text-adm-success">
                        <ShieldCheck size={13} aria-hidden />
                        {t("users.twoFactorOn")}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-adm-danger">
                        <AlertCircle size={13} aria-hidden />
                        {t("users.twoFactorOff")}
                      </span>
                    )}
                  </td>

                  <td className="admin-td whitespace-nowrap text-xs text-adm-muted">
                    {lastSignInBy.has(user.id)
                      ? relativeTime(locale, lastSignInBy.get(user.id) as Date)
                      : t("users.neverSignedIn")}
                  </td>

                  <td className="admin-td whitespace-nowrap">
                    <span
                      className={
                        user.isActive
                          ? "rounded-xs bg-adm-success-bg px-2 py-1 text-xs font-medium text-adm-success"
                          : "rounded-xs bg-adm-text/4 px-2 py-1 text-xs font-medium text-adm-muted"
                      }
                    >
                      {user.isActive ? t("users.active") : t("users.disabled")}
                    </span>
                  </td>

                  <td className="admin-td whitespace-nowrap text-right">
                    <Link
                      href={`/${locale}/admin/users/${user.id}/edit`}
                      className="inline-flex items-center gap-1.5 text-sm text-adm-accent-ink hover:text-adm-accent-ink"
                    >
                      <Pencil size={14} aria-hidden />
                      {t("common.edit")}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── What each role may do ───────────────────────────────────
          Drawn from lib/permissions.ts, which is the same table the
          guards call — so this cannot describe a rule the app does not
          actually enforce. */}
      <section className="admin-card overflow-hidden p-0!">
        <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-adm-line px-4 py-3">
          <h2 className="text-sm font-semibold text-adm-text">{t("users.matrix.title")}</h2>
          <p className="text-xs text-adm-muted">{t("users.matrix.sourceNote")}</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse">
            <thead className="border-b border-adm-line bg-adm-text/4">
              <tr>
                <th className="admin-th">{t("users.matrix.capability")}</th>
                {ROLE_ORDER.map((role) => (
                  <th key={role} className="admin-th text-center">
                    {t(`roles.${role}` as never)}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-adm-line">
              {CAPABILITIES.map((capability) => (
                <tr key={capability}>
                  <td className="admin-td text-adm-text">
                    {t(`users.matrix.capabilities.${capability}` as never)}
                  </td>

                  {ROLE_ORDER.map((role) => {
                    const grant = PERMISSION_MATRIX[capability][role];

                    return (
                      <td key={role} className="admin-td text-center">
                        {grant === true ? (
                          <span className="inline-flex h-5 w-6 items-center justify-center rounded-xs bg-adm-success-bg text-adm-success">
                            ✓
                          </span>
                        ) : grant === false ? (
                          <span className="text-adm-muted/50">—</span>
                        ) : (
                          /* Allowed, but narrower than a plain yes — the
                             string names how, and the narrowing is enforced
                             in the query or the gate it refers to. */
                          <span className="inline-block rounded-xs bg-adm-fill/15 px-2 py-1 text-[11px] font-medium text-adm-accent-ink">
                            {t(`users.matrix.limit.${grant}` as never)}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Create ──────────────────────────────────────────────────── */}
      <section className="admin-card">
        <h2 className="mb-5 flex items-center gap-2 text-base font-semibold text-adm-text">
          <Plus size={16} className="text-adm-accent-ink" aria-hidden />
          {t("users.newTitle")}
        </h2>

        <UserForm
          action={createUser.bind(null, locale)}
          mode="create"
          salesPeople={salesPeople.map((person) => ({
            id: person.id,
            name: locale === "th" ? person.nameTh : person.nameEn,
          }))}
          submitLabel={t("common.create")}
        />
      </section>
    </div>
  );
}
