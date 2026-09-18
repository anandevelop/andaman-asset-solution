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

type Props = { params: Promise<{ locale: string }> };

export default async function AdminIntegrationsSettingsPage(props: Props) {
  const { locale } = await props.params;

  await requireAdmin(locale, Role.ADMIN);

  const [t, current, overridden] = await Promise.all([
    getTranslations({ locale, namespace: "admin" }),
    getSettingsForEditing(),
    getOverriddenKeys(),
  ]);

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
      ],
    },
  ];

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-lg font-semibold text-primary">{t("settings.groups.integrations")}</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          {t("settings.integrationsSubtitle")}
        </p>
      </header>

      <p className="flex items-start gap-2.5 rounded-xs border border-primary/10 bg-surface-muted/60 px-4 py-3 text-sm text-ink-muted">
        <Info size={16} className="mt-0.5 shrink-0 text-accent-700" aria-hidden />
        {t("settings.integrationsEnvNote")}
      </p>

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
