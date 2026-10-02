/**
 * app/[locale]/admin/settings/privacy/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Privacy & PDPA overview — read-only. See lib/pdpa.ts for what these
 * numbers are and, just as importantly, what they deliberately are not
 * (there is no automated retention/deletion job in this application).
 */

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ShieldCheck, Info } from "lucide-react";
import { Role } from "@prisma/client";
import { requireAdmin } from "@/lib/admin/guard";
import { getPdpaOverview, type ConsentSourceSummary } from "@/lib/pdpa";

type Props = { params: Promise<{ locale: string }> };

export default async function AdminPrivacySettingsPage(props: Props) {
  const params = await props.params;

  const { locale } = params;

  await requireAdmin(locale, Role.ADMIN);

  const t = await getTranslations({ locale, namespace: "admin" });
  const overview = await getPdpaOverview();

  const renderSummary = (title: string, summary: ConsentSourceSummary) => (
    <div className="rounded-xs border border-adm-line bg-adm-solid p-5">
      <h3 className="text-sm font-semibold text-adm-text">{title}</h3>
      <dl className="mt-3 space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <dt className="text-adm-muted">{t("settings.privacy.total")}</dt>
          <dd className="font-medium text-adm-text">{summary.total}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-adm-muted">{t("settings.privacy.consented")}</dt>
          <dd className="font-medium text-adm-success">{summary.consented}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-adm-muted">{t("settings.privacy.notConsented")}</dt>
          <dd className="font-medium text-adm-text">{summary.notConsented}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-adm-muted">{t("settings.privacy.outdatedVersion")}</dt>
          <dd className={summary.outdatedVersion > 0 ? "font-medium text-adm-accent-ink" : "font-medium text-adm-text"}>
            {summary.outdatedVersion}
          </dd>
        </div>
      </dl>
    </div>
  );

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-lg font-semibold text-adm-text">{t("settings.privacy.title")}</h2>
        <p className="mt-1 max-w-2xl text-sm text-adm-muted">{t("settings.privacy.subtitle")}</p>
      </header>

      <section className="admin-card">
        <div className="flex items-start gap-3">
          <ShieldCheck size={20} className="mt-0.5 shrink-0 text-adm-success" aria-hidden />
          <div>
            <h2 className="text-base font-semibold text-adm-text">
              {t("settings.privacy.policyVersionTitle")}
            </h2>
            <p className="mt-1 text-sm text-adm-muted">
              {t("settings.privacy.policyVersionValue", { version: overview.currentPolicyVersion })}
            </p>
          </div>
        </div>

        <Link
          href={`/${locale}/privacy-policy`}
          target="_blank"
          rel="noopener noreferrer"
          className="admin-btn-ghost mt-4 inline-flex"
        >
          {t("settings.privacy.viewPolicy")}
        </Link>
      </section>

      <div className="grid gap-5 sm:grid-cols-2">
        {renderSummary(t("settings.privacy.leadsTitle"), overview.leads)}
        {renderSummary(t("settings.privacy.eventsTitle"), overview.eventRegistrations)}
      </div>

      <p className="flex items-start gap-2.5 rounded-xs border border-adm-line bg-adm-text/4 px-4 py-3 text-sm text-adm-muted">
        <Info size={16} className="mt-0.5 shrink-0 text-adm-accent-ink" aria-hidden />
        {t("settings.privacy.scopeNote")}
      </p>

      <Link
        href={`/${locale}/admin/leads`}
        className="flex items-center justify-between gap-3 rounded-xs border border-adm-line bg-adm-solid px-5 py-4 text-sm transition-colors hover:bg-adm-text/2"
      >
        <span>
          <span className="block font-medium text-adm-text">{t("settings.privacy.manageRequestsTitle")}</span>
          <span className="mt-0.5 block text-adm-muted">{t("settings.privacy.manageRequestsHint")}</span>
        </span>
      </Link>
    </div>
  );
}
