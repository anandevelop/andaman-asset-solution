/**
 * app/[locale]/admin/account/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Self-service password change, open to every role. Without this, an editor
 * who suspects their password is compromised has to find a super admin
 * before they can do anything about it.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/admin/guard";
import { changeOwnPassword } from "../users/actions";
import PasswordForm from "@/components/admin/PasswordForm";

type Props = { params: { locale: string } };

export default async function AdminAccountPage({ params: { locale } }: Props) {
  const actor = await requireAdmin(locale);

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
