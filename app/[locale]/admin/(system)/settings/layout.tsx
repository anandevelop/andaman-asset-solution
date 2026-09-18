/**
 * app/[locale]/admin/settings/layout.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The settings workspace (Settings.dc.html): a left rail of groups, the
 * section being edited in the middle, and two read-only cards on the right
 * that are true wherever you are — what is connected, and where PDPA
 * stands.
 *
 * A layout rather than one page with tabs, because the seven groups are
 * genuinely different things: three of them already existed as their own
 * routes with their own forms and their own guards, and folding those into
 * one component would have meant merging four independent Server
 * Components' data loading for the sake of a tab bar. Every group is a real
 * URL, so a link to one is a link to what the sender was looking at.
 *
 * The right-hand cards live here rather than on a single section because
 * they are the context for all of them — "your email is not configured" is
 * exactly as relevant while editing a phone number as while looking at the
 * notification switches.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { Role } from "@prisma/client";
import { requireAdmin } from "@/lib/admin/guard";
import { getSystemHealth } from "@/lib/admin/system-health";
import { getPdpaOverview, PDPA_RETENTION_YEARS } from "@/lib/pdpa";
import { getCookieConsentStats } from "@/lib/cookie-consent-stats";
import { siteConfig } from "@/config/site";
import SettingsNav from "@/components/admin/SettingsNav";
import ConnectionStatusCard from "@/components/admin/ConnectionStatusCard";
import PrivacyStatusCard from "@/components/admin/PrivacyStatusCard";

type Props = { children: ReactNode; params: Promise<{ locale: string }> };

export default async function AdminSettingsLayout({ children, params }: Props) {
  const { locale } = await params;

  await requireAdmin(locale, Role.ADMIN);

  const [t, health, pdpa, cookies] = await Promise.all([
    getTranslations({ locale, namespace: "admin" }),
    getSystemHealth(),
    getPdpaOverview(),
    getCookieConsentStats(),
  ]);

  const outdatedConsent = pdpa.leads.outdatedVersion + pdpa.eventRegistrations.outdatedVersion;

  return (
    <div className="space-y-6">
      <header>
        <p className="admin-section-title">{t("settings.section")}</p>
        <h1 className="mt-2 text-2xl font-semibold text-primary sm:text-3xl">
          {t("settings.title")}
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-ink-muted">{t("settings.subtitle")}</p>
      </header>

      <div className="grid gap-6 xl:grid-cols-[220px_minmax(0,1fr)_320px]">
        <SettingsNav
          locale={locale}
          labels={{
            company: t("settings.groups.company"),
            contact: t("settings.groups.contact"),
            seo: t("settings.groups.brandSeo"),
            notifications: t("settings.groups.notifications"),
            integrations: t("settings.groups.integrations"),
            privacy: t("settings.groups.privacy"),
            system: t("settings.groups.system"),
          }}
        />

        <div className="min-w-0">{children}</div>

        <aside className="space-y-5">
          <ConnectionStatusCard
            locale={locale}
            rows={health.rows}
            title={t("settings.health.title")}
            /* Each detail line is formatted here, on the server that
               counted it, so nothing is interpolated in the browser. */
            details={Object.fromEntries(
              health.rows.map((row) => [
                row.key,
                t(`settings.health.${row.detailKey}`, row.detailValues ?? {}),
              ]),
            )}
            names={Object.fromEntries(
              health.rows.map((row) => [row.key, t(`settings.health.name.${row.key}`)]),
            )}
            labels={{
              test: t("settings.health.test"),
              open: t("settings.health.open"),
              notConfigured: t("settings.health.notConfigured"),
              setVia: t("settings.health.setVia"),
              storageNote: t("settings.health.storageNote"),
            }}
          />

          <PrivacyStatusCard
            locale={locale}
            title={t("settings.privacyCard.title")}
            rows={[
              {
                key: "policyVersion",
                label: t("settings.privacyCard.policyVersion"),
                value: siteConfig.legal.consentVersion,
              },
              {
                key: "retention",
                label: t("settings.privacyCard.retention"),
                value: t("settings.privacyCard.retentionValue", { years: PDPA_RETENTION_YEARS }),
                muted: true,
              },
              {
                key: "outdated",
                label: t("settings.privacyCard.outdatedConsent"),
                value: String(outdatedConsent),
                highlight: outdatedConsent > 0,
              },
              {
                key: "cookies",
                label: t("settings.privacyCard.cookieAcceptance"),
                value:
                  cookies.total === 0
                    ? t("settings.privacyCard.noDecisionsYet")
                    : t("settings.privacyCard.cookiePercent", {
                        percent: Math.round((cookies.analyticsGranted / cookies.total) * 100),
                        total: cookies.total,
                      }),
              },
            ]}
            note={t("settings.privacyCard.note")}
            cta={{ href: `/${locale}/admin/settings/privacy`, label: t("settings.privacyCard.cta") }}
          />
        </aside>
      </div>
    </div>
  );
}
