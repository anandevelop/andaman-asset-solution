/**
 * app/[locale]/admin/settings/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Site settings — the contact details that change without a deploy.
 *
 * ADMIN and above. These strings appear in the footer of every page, in the
 * contact page, in the WhatsApp CTA and inside the JSON-LD a search engine
 * reads, so a wrong phone number here is wrong everywhere at once.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ChevronRight, Info } from "lucide-react";
import { Role } from "@prisma/client";
import { requireAdmin } from "@/lib/admin/guard";
import {
  defaultSettings,
  getOverriddenKeys,
  getSettingsForEditing,
  type SettingKey,
} from "@/lib/settings";
import { updateSettings } from "./actions";
import SettingsForm, { type SettingGroup } from "@/components/admin/SettingsForm";

type Props = { params: Promise<{ locale: string }> };

export default async function AdminSettingsPage(props: Props) {
  const params = await props.params;

  const {
    locale
  } = params;

  await requireAdmin(locale, Role.ADMIN);

  const [t, current, overridden] = await Promise.all([
    getTranslations({ locale, namespace: "admin" }),
    getSettingsForEditing(),
    getOverriddenKeys(),
  ]);

  const defaults = defaultSettings();
  const isOverridden = (key: SettingKey) => overridden.includes(key);

  /**
   * A field shows its stored value only when it differs from the default.
   * Pre-filling every box with the default would make "clear to reset"
   * meaningless — everything would look overridden.
   */
  const field = (
    key: SettingKey,
    label: string,
    options: {
      hint?: string;
      type?: "text" | "url" | "email" | "tel";
      multiline?: boolean;
    } = {},
  ) => ({
    key,
    label,
    placeholder: defaults[key],
    value: isOverridden(key) ? current[key] : "",
    overridden: isOverridden(key),
    ...options,
  });

  const groups: SettingGroup[] = [
    {
      title: t("settings.groups.contact"),
      fields: [
        field("contact.phone", t("settings.fields.phone"), {
          type: "tel",
          hint: t("settings.fields.phoneHint"),
        }),
        field("contact.phoneDisplay", t("settings.fields.phoneDisplay"), {
          hint: t("settings.fields.phoneDisplayHint"),
        }),
        field("contact.whatsapp", t("settings.fields.whatsapp"), { type: "tel" }),
        field("contact.email", t("settings.fields.email"), { type: "email" }),
        field("contact.salesEmail", t("settings.fields.salesEmail"), {
          type: "email",
        }),
        field("contact.mapUrl", t("settings.fields.mapUrl"), { type: "url" }),
      ],
    },
    {
      title: t("settings.groups.address"),
      fields: [
        field("contact.addressTh", t("settings.fields.addressTh"), {
          multiline: true,
        }),
        field("contact.addressEn", t("settings.fields.addressEn"), {
          multiline: true,
        }),
        field("contact.addressZh", t("settings.fields.addressZh"), {
          multiline: true,
        }),
        field("contact.addressRu", t("settings.fields.addressRu"), {
          multiline: true,
        }),
        field("contact.officeHoursTh", t("settings.fields.officeHoursTh")),
        field("contact.officeHoursEn", t("settings.fields.officeHoursEn")),
        field("contact.officeHoursZh", t("settings.fields.officeHoursZh")),
        field("contact.officeHoursRu", t("settings.fields.officeHoursRu")),
      ],
    },
    {
      title: t("settings.groups.social"),
      fields: [
        field("social.facebook", t("settings.fields.facebook"), { type: "url" }),
        field("social.instagram", t("settings.fields.instagram"), { type: "url" }),
        field("social.youtube", t("settings.fields.youtube"), { type: "url" }),
      ],
    },
    {
      title: t("settings.groups.analytics"),
      fields: [
        field("analytics.metaPixelId", t("settings.fields.metaPixelId"), {
          hint: t("settings.fields.metaPixelIdHint"),
        }),
        field(
          "analytics.googleSiteVerification",
          t("settings.fields.googleSiteVerification"),
          { hint: t("settings.fields.googleSiteVerificationHint") },
        ),
      ],
    },
  ];

  return (
    <div className="space-y-8">
      <header>
        <p className="admin-section-title">{t("brand")}</p>
        <h1 className="mt-2 text-2xl font-semibold text-primary sm:text-3xl">
          {t("settings.title")}
        </h1>
        <p className="mt-2 text-sm text-ink-muted">{t("settings.subtitle")}</p>
      </header>

      {/* What is NOT editable here matters as much as what is. */}
      <p className="flex items-start gap-2.5 rounded-sm border border-primary/10 bg-surface-muted/60 px-4 py-3 text-sm text-ink-muted">
        <Info size={16} className="mt-0.5 shrink-0 text-accent-700" aria-hidden />
        {t("settings.scopeNote")}
      </p>

      <Link
        href={`/${locale}/admin/settings/company`}
        className="flex items-center justify-between gap-3 rounded-sm border border-primary/10 bg-white px-5 py-4 text-sm transition-colors hover:bg-primary-900/[0.02]"
      >
        <span>
          <span className="block font-medium text-primary">
            {t("settings.company.title")}
          </span>
          <span className="mt-0.5 block text-ink-muted">
            {t("settings.company.linkHint")}
          </span>
        </span>
        <ChevronRight size={16} className="shrink-0 text-ink-muted" aria-hidden />
      </Link>

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
