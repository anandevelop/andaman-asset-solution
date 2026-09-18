/**
 * app/[locale]/admin/users/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Account list plus the create form. SUPER_ADMIN only — requireAdmin
 * redirects anyone else to the dashboard with ?denied=1.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Pencil, Plus, ShieldCheck } from "lucide-react";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { safeQuery, isDatabaseOffline } from "@/lib/db";
import { requireAdmin } from "@/lib/admin/guard";
import { intlLocale } from "@/lib/format";
import { createUser } from "./actions";
import UserForm from "@/components/admin/UserForm";

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
        },
      }),
    [],
  );

  const offline = isDatabaseOffline();

  const dateFormat = new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="space-y-8">
      <header>
        <p className="admin-section-title">{t("brand")}</p>
        <h1 className="mt-2 text-2xl font-semibold text-primary sm:text-3xl">
          {t("users.title")}
        </h1>
        <p className="mt-2 text-sm text-ink-muted">{t("users.subtitle")}</p>
      </header>

      {offline && (
        <p className="rounded-sm border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t("common.offline")}
        </p>
      )}

      {/* ── Existing accounts ───────────────────────────────────────── */}
      {users.length > 0 && (
        <div className="overflow-x-auto rounded-sm border border-primary/10 bg-surface-raised shadow-card">
          <table className="w-full min-w-[720px] border-collapse">
            <thead className="border-b border-primary/10 bg-surface-muted">
              <tr>
                <th className="admin-th">{t("users.name")}</th>
                <th className="admin-th">{t("users.role")}</th>
                <th className="admin-th">{t("users.status")}</th>
                <th className="admin-th">{t("users.created")}</th>
                <th className="admin-th" />
              </tr>
            </thead>

            <tbody className="divide-y divide-primary/5">
              {users.map((user) => (
                <tr
                  key={user.id}
                  className="transition-colors hover:bg-surface-muted/60"
                >
                  <td className="admin-td">
                    <p className="flex items-center gap-2 font-medium text-primary">
                      {user.name}
                      {user.id === actor.id && (
                        <span className="rounded-sm bg-accent-50 px-1.5 py-0.5 text-[11px] font-medium text-accent-700">
                          {t("users.you")}
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-muted">{user.email}</p>
                  </td>

                  <td className="admin-td whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5 text-ink-muted">
                      {user.role === Role.SUPER_ADMIN && (
                        <ShieldCheck size={14} className="text-accent-700" aria-hidden />
                      )}
                      {t(`roles.${user.role}` as never)}
                    </span>
                  </td>

                  <td className="admin-td whitespace-nowrap">
                    <span
                      className={
                        user.isActive
                          ? "rounded-sm bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800"
                          : "rounded-sm bg-surface-muted px-2 py-1 text-xs font-medium text-ink-muted"
                      }
                    >
                      {user.isActive ? t("users.active") : t("users.disabled")}
                    </span>
                  </td>

                  <td className="admin-td whitespace-nowrap text-xs text-ink-muted">
                    <time dateTime={user.createdAt.toISOString()}>
                      {dateFormat.format(user.createdAt)}
                    </time>
                  </td>

                  <td className="admin-td whitespace-nowrap text-right">
                    <Link
                      href={`/${locale}/admin/users/${user.id}/edit`}
                      className="inline-flex items-center gap-1.5 text-sm text-accent-700 hover:text-accent-800"
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

      {/* ── Create ──────────────────────────────────────────────────── */}
      <section className="admin-card">
        <h2 className="mb-5 flex items-center gap-2 text-base font-semibold text-primary">
          <Plus size={16} className="text-accent-700" aria-hidden />
          {t("users.newTitle")}
        </h2>

        <UserForm
          action={createUser.bind(null, locale)}
          mode="create"
          submitLabel={t("common.create")}
        />
      </section>
    </div>
  );
}
