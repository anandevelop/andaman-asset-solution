/**
 * app/[locale]/admin/settings/integrations/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * "การเชื่อมต่อภายนอก" — the knobs for the services the card on the right
 * reports the state of.
 *
 * Only the ones that can honestly be changed without a deploy are here.
 * SMTP, Spaces, reCAPTCHA, Sentry and Redis are environment variables read
 * at boot; a form field for those would save a value nothing reads. The
 * status card names the variable instead, which is what somebody with
 * access to the deployment actually needs.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { getTranslations } from "next-intl/server";
import { Info } from "lucide-react";
import { Role } from "@prisma/client";
import { requireAdmin } from "@/lib/admin/guard";
import {
  defaultSettings,
  getOverriddenKeys,
  getSettingsForEditing,
  type SettingKey,
} from "@/lib/settings";
import { updateSettings } from "../actions";
import SettingsForm, { type SettingGroup } from "@/components/admin/SettingsForm";
import LineSettingsCard, { type LineCardLabels } from "@/components/admin/LineSettingsCard";
import { getLineConfig, getLineDeliveries } from "@/lib/line-config";
import { fetchLineBotInfo } from "@/lib/line";

type Props = { params: Promise<{ locale: string }> };

export default async function AdminIntegrationsSettingsPage(props: Props) {
  const { locale } = await props.params;

  await requireAdmin(locale, Role.ADMIN);

  const [t, current, overridden, line, deliveries] = await Promise.all([
    getTranslations({ locale, namespace: "admin" }),
    getSettingsForEditing(),
    getOverriddenKeys(),
    getLineConfig(),
    getLineDeliveries(),
  ]);

  // Asks LINE which OA the token belongs to: proof the token works, and
  // the name the card shows. Five-second timeout inside, never throws.
  const bot = line.accessToken ? await fetchLineBotInfo(line.accessToken) : null;

  const lineRaw = t.raw("settings.line") as Record<string, string> & {
    err: Record<string, string>;
    reason: Record<string, string>;
  };
  const lineLabels = {
    ...Object.fromEntries(Object.entries(lineRaw).filter(([, v]) => typeof v === "string")),
    ...Object.fromEntries(Object.entries(lineRaw.err).map(([k, v]) => [`err.${k}`, v])),
    ...Object.fromEntries(Object.entries(lineRaw.reason).map(([k, v]) => [`reason.${k}`, v])),
  } as LineCardLabels;

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://andamanassetsolution.com").replace(/\/+$/, "");

  const defaults = defaultSettings();

  const field = (key: SettingKey, label: string, hint?: string) => ({
    key,
    label,
    hint,
    placeholder: defaults[key],
    value: overridden.includes(key) ? current[key] : "",
    overridden: overridden.includes(key),
  });

  const groups: SettingGroup[] = [
    {
      title: t("settings.groups.analytics"),
      fields: [
        field(
          "analytics.gaMeasurementId",
          t("settings.fields.gaMeasurementId"),
          t("settings.fields.gaMeasurementIdHint"),
        ),
        field(
          "analytics.metaPixelId",
          t("settings.fields.metaPixelId"),
          t("settings.fields.metaPixelIdHint"),
        ),
        field(
          "analytics.googleSiteVerification",
          t("settings.fields.googleSiteVerification"),
          t("settings.fields.googleSiteVerificationHint"),
        ),
        field(
          "analytics.facebookDomainVerification",
          t("settings.fields.facebookDomainVerification"),
          t("settings.fields.facebookDomainVerificationHint"),
        ),
      ],
    },
  ];

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-lg font-semibold text-adm-text">{t("settings.groups.integrations")}</h2>
        <p className="mt-1 max-w-2xl text-sm text-adm-muted">
          {t("settings.integrationsSubtitle")}
        </p>
      </header>

      <p className="flex items-start gap-2.5 rounded-xs border border-adm-line bg-adm-text/4 px-4 py-3 text-sm text-adm-muted">
        <Info size={16} className="mt-0.5 shrink-0 text-adm-accent-ink" aria-hidden />
        {t("settings.integrationsEnvNote")}
      </p>

      <LineSettingsCard
        locale={locale}
        enabled={line.enabled}
        secretSource={line.secretSource}
        tokenSource={line.tokenSource}
        undecryptable={line.undecryptable}
        bot={bot}
        webhookUrl={`${siteUrl}/api/line/webhook`}
        destinations={line.destinations.map(({ id, type, name, enabled, source }) => ({
          id,
          type,
          name,
          enabled,
          source,
        }))}
        deliveries={deliveries}
        locale_tag={locale === "th" ? "th-TH-u-ca-buddhist" : locale}
        labels={lineLabels}
      />

      <SettingsForm
        action={updateSettings.bind(null, locale)}
        groups={groups}
        labels={{
          save: t("common.save"),
          overridden: t("settings.overridden"),
          usingDefault: t("settings.usingDefault"),
        }}
      />
    </div>
  );
}
