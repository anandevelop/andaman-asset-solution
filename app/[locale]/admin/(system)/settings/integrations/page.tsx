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
import AiSettingsCard, { type AiCardLabels } from "@/components/admin/AiSettingsCard";
import { DEFAULT_GEMINI_MODEL, getAiConfig } from "@/lib/ai-config";
import { saveAiSettingsAction } from "./ai-actions";
import GoogleSettingsCard from "@/components/admin/GoogleSettingsCard";
import { getGoogleConfig } from "@/lib/google-config";
import { saveGoogleSettingsAction, testGoogleConnectionAction } from "./google-actions";
import PageSpeedSettingsCard from "@/components/admin/PageSpeedSettingsCard";
import { GOOGLE_DAILY_QUOTA, getPsiConfig } from "@/lib/pagespeed/config";
import { callsToday } from "@/lib/pagespeed/run";
import { savePsiSettingsAction, testPsiAction } from "./psi-actions";
import { getLineConfig, getLineDeliveries } from "@/lib/line-config";
import { fetchLineBotInfo } from "@/lib/line";

type Props = { params: Promise<{ locale: string }> };

export default async function AdminIntegrationsSettingsPage(props: Props) {
  const { locale } = await props.params;

  await requireAdmin(locale, Role.ADMIN);

  const [t, current, overridden, line, deliveries, ai, google, psi, psiUsage] = await Promise.all([
    getTranslations({ locale, namespace: "admin" }),
    getSettingsForEditing(),
    getOverriddenKeys(),
    getLineConfig(),
    getLineDeliveries(),
    getAiConfig(),
    getGoogleConfig(),
    getPsiConfig(),
    callsToday().catch(() => 0),
  ]);

  const flatten = (raw: Record<string, unknown>, prefix = ""): Record<string, string> =>
    Object.fromEntries(
      Object.entries(raw).flatMap(([k, v]) =>
        typeof v === "string" ? [[`${prefix}${k}`, v]] : Object.entries(flatten(v as Record<string, unknown>, `${prefix}${k}.`)),
      ),
    );
  const psiLabels = flatten(t.raw("settings.pagespeed") as Record<string, unknown>);

  const googleRaw = t.raw("settings.google") as Record<string, unknown>;
  const googleLabels: Record<string, string> = {};
  for (const [key, value] of Object.entries(googleRaw)) {
    if (typeof value === "string") googleLabels[key] = value;
    else for (const [sub, text] of Object.entries(value as Record<string, string>)) googleLabels[`${key}.${sub}`] = text;
  }

  const aiRaw = t.raw("settings.ai") as Record<string, string> & { err: Record<string, string> };
  const aiLabels = {
    ...Object.fromEntries(Object.entries(aiRaw).filter(([, v]) => typeof v === "string")),
    ...Object.fromEntries(Object.entries(aiRaw.err).map(([k, v]) => [`err.${k}`, v])),
  } as AiCardLabels;

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

      {/* GA4 tag + property, Search Console, service account. The tag ID
          used to be a field in the analytics group below; it lives with
          the rest of the Google connection now. */}
      <GoogleSettingsCard
        initial={{
          gaMeasurementId: overridden.includes("analytics.gaMeasurementId") ? current["analytics.gaMeasurementId"] : "",
          ga4PropertyId: google.ga4Source === "admin" ? (google.ga4PropertyId ?? "") : "",
          gscSiteUrl: google.gscSource === "admin" ? (google.gscSiteUrl ?? "") : "",
        }}
        account={{
          email: google.credentials?.email ?? null,
          source: google.credentialsSource,
          undecryptable: google.undecryptable,
        }}
        envHints={{
          ga4PropertyId: google.ga4Source === "env" ? google.ga4PropertyId : null,
          gscSiteUrl: google.gscSource === "env" ? google.gscSiteUrl : null,
        }}
        labels={googleLabels}
        save={saveGoogleSettingsAction.bind(null, locale)}
        test={testGoogleConnectionAction}
      />

      <PageSpeedSettingsCard
        keySource={psi.keySource}
        keyHint={psi.keyHint}
        undecryptable={psi.undecryptable}
        schedule={psi.schedule}
        strategies={psi.strategies}
        alertBelow={psi.alertBelow}
        dailyCap={psi.dailyCap}
        usageToday={psiUsage}
        googleQuota={GOOGLE_DAILY_QUOTA}
        labels={psiLabels}
        save={savePsiSettingsAction.bind(null, locale)}
        test={testPsiAction}
      />

      <AiSettingsCard
        locale={locale}
        keySource={ai.keySource}
        model={ai.model}
        modelIsSaved={ai.modelSource === "admin"}
        defaultModel={DEFAULT_GEMINI_MODEL}
        undecryptable={ai.undecryptable}
        labels={aiLabels}
        save={saveAiSettingsAction.bind(null, locale)}
      />

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
