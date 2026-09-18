/**
 * app/[locale]/admin/account/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Self-service password change, open to every role. Without this, an editor
 * who suspects their password is compromised has to find a super admin
 * before they can do anything about it.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ShieldCheck } from "lucide-react";
import { Role } from "@prisma/client";
import { requireAdmin } from "@/lib/admin/guard";
import { changeOwnPassword } from "@/app/[locale]/admin/(system)/users/actions";
import PasswordForm from "@/components/admin/PasswordForm";

type Props = { params: Promise<{ locale: string }> };

export default async function AdminAccountPage(props: Props) {
  const params = await props.params;

  const {
    locale
  } = params;

  // Role.VIEWER, not the requireAdmin() default of EDITOR — the file
  // header above says "open to every role" and the bare call did not
  // deliver that, leaving VIEWER and SALES unable to change their own
  // password even though this page exists precisely so nobody in that
  // position has to wait on a super admin.
  const actor = await requireAdmin(locale, Role.VIEWER);

  const t = await getTranslations({ locale, namespace: "admin" });

  return (
    <div className="space-y-8">
      <header>
        <p className="admin-section-title">{t("brand")}</p>
        <h1 className="mt-2 text-2xl font-semibold text-primary sm:text-3xl">
          {t("account.title")}
        </h1>
      </header>

      <section className="admin-card">
        <dl className="grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="admin-label">{t("users.name")}</dt>
            <dd className="text-sm text-ink">{actor.name}</dd>
          </div>
          <div>
            <dt className="admin-label">{t("users.email")}</dt>
            <dd className="text-sm text-ink">{actor.email}</dd>
          </div>
          <div>
            <dt className="admin-label">{t("users.role")}</dt>
            <dd className="text-sm text-ink">{t(`roles.${actor.role}` as never)}</dd>
          </div>
        </dl>
        <p className="admin-hint mt-4">{t("account.contactHint")}</p>
      </section>

      <section className="admin-card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-primary">
              {t("security.title")}
            </h2>
            <p className="mt-1 text-sm text-ink-muted">{t("security.cardHint")}</p>
          </div>

          <Link href={`/${locale}/admin/account/security`} className="admin-btn">
            <ShieldCheck size={15} aria-hidden />
            {t("security.manage")}
          </Link>
        </div>
      </section>

      <section className="admin-card">
        <h2 className="text-base font-semibold text-primary">
          {t("account.changePassword")}
        </h2>
        <p className="mb-5 mt-1 text-sm text-ink-muted">
          {t("account.changePasswordHint")}
        </p>

        <PasswordForm
          action={changeOwnPassword.bind(null, locale)}
          requireCurrent
        />
      </section>
    </div>
  );
}
