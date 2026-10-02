/**
 * app/[locale]/admin/users/[id]/edit/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Three separate forms on one page — profile, password, delete — because
 * they carry very different consequences and should not share a submit.
 *
 * The delete form is hidden entirely for yourself and for the last active
 * super admin. The server refuses both anyway; hiding them is so the button
 * is never offered for an action that cannot succeed.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isDatabaseOffline, safeQuery } from "@/lib/db";
import { requireAdmin } from "@/lib/admin/guard";
import { deleteUser, resetUserTwoFactor, setUserPassword, updateUser } from "../../actions";
import UserForm from "@/components/admin/UserForm";
import PasswordForm from "@/components/admin/PasswordForm";
import DeleteUserForm from "@/components/admin/DeleteUserForm";
import ResetTwoFactorForm from "@/components/admin/ResetTwoFactorForm";
import AdminPageHeader from "@/components/admin/ui/AdminPageHeader";
import { zoneEyebrow } from "@/lib/admin/nav";

type Props = { params: Promise<{ locale: string; id: string }> };

export default async function EditUserPage(props: Props) {
  const params = await props.params;
  const { locale, id } = params;
  const actor = await requireAdmin(locale, Role.SUPER_ADMIN);

  const t = await getTranslations({ locale, namespace: "admin" });

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      salesPersonId: true,
      totpEnabledAt: true,
      _count: { select: { articles: true, projectProgresses: true } },
    },
  });

  if (!user) notFound();

  /*
    The profiles this account could be linked to: unclaimed ones, plus the
    one it already holds — without that second half, opening the edit page
    of a linked user would offer a list their own profile is missing from,
    and the select would fall back to "not linked".

    Ordered like the sales-team screen so the two lists read the same way.
  */
  const salesPeople = await safeQuery(
    "admin:users:salesPeople",
    () =>
      prisma.salesPerson.findMany({
        where: user.salesPersonId
          ? { OR: [{ staffAccount: { is: null } }, { id: user.salesPersonId }] }
          : { staffAccount: { is: null } },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: { id: true, nameEn: true, nameTh: true },
      }),
    [],
  );

  const otherSuperAdmins = await prisma.user.count({
    where: { role: Role.SUPER_ADMIN, isActive: true, id: { not: id } },
  });

  const isSelf = actor.id === user.id;
  const isLastSuperAdmin =
    user.role === Role.SUPER_ADMIN && user.isActive && otherSuperAdmins === 0;

  const authored = user._count.articles + user._count.projectProgresses;

  return (
    <div className="space-y-8">
      <AdminPageHeader
        back={{ href: `/${locale}/admin/users`, label: t("users.title") }}
        eyebrow={zoneEyebrow((key) => t(key as never), "users")}
        title={user.name}
        description={user.email}
      />

      {/*
        The only degrading read on this page is the sales-profile list, and
        an empty one is indistinguishable from "every profile is taken" —
        which would look like a reason to leave this account unlinked.
      */}
      {isDatabaseOffline() && (
        <p className="rounded-xs border border-adm-warning/30 bg-adm-warning-bg px-4 py-3 text-sm text-adm-warning">
          {t("common.offline")}
        </p>
      )}

      {/* ── Profile, role, access ───────────────────────────────────── */}
      <section className="admin-card">
        <h2 className="mb-5 text-base font-semibold text-adm-text">
          {t("users.editTitle")}
        </h2>

        <UserForm
          action={updateUser.bind(null, locale, user.id)}
          mode="edit"
          values={{
            name: user.name,
            email: user.email,
            role: user.role,
            isActive: user.isActive,
            salesPersonId: user.salesPersonId,
          }}
          salesPeople={salesPeople.map((person) => ({
            id: person.id,
            name: locale === "th" ? person.nameTh : person.nameEn,
          }))}
          isSelf={isSelf}
          isLastSuperAdmin={isLastSuperAdmin}
          submitLabel={t("common.save")}
        />
      </section>

      {/* ── Password reset ──────────────────────────────────────────── */}
      <section className="admin-card">
        <h2 className="text-base font-semibold text-adm-text">
          {t("users.resetPassword")}
        </h2>
        <p className="mb-5 mt-1 text-sm text-adm-muted">
          {isSelf ? t("users.resetOwnHint") : t("users.resetHint")}
        </p>

        <PasswordForm action={setUserPassword.bind(null, locale, user.id)} />
      </section>

      {/* ── Two-factor reset ────────────────────────────────────────── */}
      {user.totpEnabledAt && (
        <section className="admin-card">
          <h2 className="text-base font-semibold text-adm-text">
            {t("security.resetTitle")}
          </h2>
          <p className="mb-5 mt-1 text-sm text-adm-muted">
            {t("security.resetHint")}
          </p>

          <ResetTwoFactorForm
            action={resetUserTwoFactor.bind(null, locale, user.id)}
            label={t("security.reset")}
            confirmLabel={t("security.confirmReset", { name: user.name })}
          />
        </section>
      )}

      {/* ── Delete ──────────────────────────────────────────────────── */}
      {!isSelf && !isLastSuperAdmin && (
        <section className="admin-card border-adm-danger/30">
          <h2 className="text-base font-semibold text-adm-text">
            {t("users.deleteTitle")}
          </h2>
          <p className="mb-5 mt-1 text-sm text-adm-muted">
            {authored > 0 ? t("users.deleteHintAuthored") : t("users.deleteHint")}
          </p>

          <DeleteUserForm
            action={deleteUser.bind(null, locale, user.id)}
            label={t("common.delete")}
            confirmLabel={t("users.confirmDelete", { name: user.name })}
          />
        </section>
      )}
    </div>
  );
}
