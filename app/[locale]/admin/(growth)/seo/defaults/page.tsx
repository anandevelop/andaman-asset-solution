/**
 * app/[locale]/admin/(growth)/seo/defaults/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Sitewide SEO defaults — how the site looks in a search result, a share
 * preview and a browser tab when a page has said nothing more specific.
 *
 * WHY IT LEFT SETTINGS
 *
 * It was /admin/settings/seo: the title template, the default OG image and
 * the Search Console token, in the drawer people open to fix a phone
 * number, while every other SEO control lived under /admin/seo. Two places
 * for one job, and the settings one was the place the SEO overview's own
 * "fix this" link had to send you. It is a tab of the SEO hub now, and
 * lib/seo-audit.ts points at it here.
 *
 * It still binds the *same* updateSettings action, imported rather than
 * copied. That works because the action iterates SETTING_KEYS and skips
 * any key the submitted form did not carry, so each page writes only its
 * own subset and neither can wipe the other's values — see the note at the
 * top of that file, and the revalidatePath for this path beside it.
 *
 * ADMIN and above, which is also the (growth) zone's floor: a meta title
 * is the company's public identity in exactly the way a phone number is.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { getTranslations } from "next-intl/server";
import { Info } from "lucide-react";
import { Role } from "@prisma/client";
import { requireAdmin } from "@/lib/admin/guard";
import { isDatabaseOffline } from "@/lib/db";
import {
  defaultSettings,
  getOverriddenKeys,
  getSettingsForEditing,
  type SettingKey,
} from "@/lib/settings";
import { updateSettings } from "@/app/[locale]/admin/(system)/settings/actions";
import SettingsForm, { type SettingGroup } from "@/components/admin/SettingsForm";

type Props = { params: Promise<{ locale: string }> };

/**
 * What Google typically shows before it truncates.
 *
 * Advice rendered as a counter, not a limit — the validators cap far
 * higher on purpose, because truncation happens on pixel width and these
 * fields hold four scripts of very different widths.
 */
const TITLE_BUDGET = 60;
const DESCRIPTION_BUDGET = 155;

export default async function AdminSeoDefaultsPage(props: Props) {
  const params = await props.params;

  const { locale } = params;

  await requireAdmin(locale, Role.ADMIN);

  const [t, current, overridden] = await Promise.all([
    getTranslations({ locale, namespace: "admin" }),
    getSettingsForEditing(),
    getOverriddenKeys(),
  ]);

  const defaults = defaultSettings();
  const isOverridden = (key: SettingKey) => overridden.includes(key);

  /** Text field: shows its stored value only when it differs from the
   *  default, so "clear to reset" stays meaningful. */
  const field = (
    key: SettingKey,
    label: string,
    options: {
      hint?: string;
      multiline?: boolean;
      recommendedLength?: number;
    } = {},
  ) => ({
    key,
    label,
    placeholder: defaults[key],
    value: isOverridden(key) ? current[key] : "",
    overridden: isOverridden(key),
    ...options,
  });

  /** Image field: previews whatever is in force, override or default. */
  const imageField = (key: SettingKey, label: string, hint: string) => ({
    key,
    label,
    hint,
    placeholder: defaults[key],
    value: "",
    effective: current[key],
    overridden: isOverridden(key),
    kind: "image" as const,
  });

  const groups: SettingGroup[] = [
    {
      title: t("settings.groups.branding"),
      fields: [
        imageField(
          "branding.faviconUrl",
          t("settings.fields.favicon"),
          t("settings.fields.faviconHint"),
        ),
        imageField(
          "branding.ogImageUrl",
          t("settings.fields.ogImage"),
          t("settings.fields.ogImageHint"),
        ),
        imageField(
          "branding.logoUrl",
          t("settings.fields.logo"),
          t("settings.fields.logoHint"),
        ),
      ],
    },
    {
      title: t("settings.groups.searchResults"),
      fields: [
        field("seo.titleTemplate", t("settings.fields.titleTemplate"), {
          hint: t("settings.fields.titleTemplateHint"),
        }),
        field("seo.twitterHandle", t("settings.fields.twitterHandle"), {
          hint: t("settings.fields.twitterHandleHint"),
        }),
      ],
    },
    {
      title: t("settings.groups.metaTitle"),
      fields: [
        field("seo.metaTitleTh", t("settings.fields.metaTitleTh"), {
          recommendedLength: TITLE_BUDGET,
        }),
        field("seo.metaTitleEn", t("settings.fields.metaTitleEn"), {
          recommendedLength: TITLE_BUDGET,
        }),
        field("seo.metaTitleZh", t("settings.fields.metaTitleZh"), {
          recommendedLength: TITLE_BUDGET,
        }),
        field("seo.metaTitleRu", t("settings.fields.metaTitleRu"), {
          recommendedLength: TITLE_BUDGET,
        }),
      ],
    },
    {
      title: t("settings.groups.metaDescription"),
      fields: [
        field("seo.metaDescriptionTh", t("settings.fields.metaDescriptionTh"), {
          multiline: true,
          recommendedLength: DESCRIPTION_BUDGET,
        }),
        field("seo.metaDescriptionEn", t("settings.fields.metaDescriptionEn"), {
          multiline: true,
          recommendedLength: DESCRIPTION_BUDGET,
        }),
        field("seo.metaDescriptionZh", t("settings.fields.metaDescriptionZh"), {
          multiline: true,
          recommendedLength: DESCRIPTION_BUDGET,
        }),
        field("seo.metaDescriptionRu", t("settings.fields.metaDescriptionRu"), {
          multiline: true,
          recommendedLength: DESCRIPTION_BUDGET,
        }),
      ],
    },
  ];

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-lg font-semibold text-primary">{t("settings.seo.title")}</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">{t("settings.seo.subtitle")}</p>
      </header>

      {isDatabaseOffline() && (
        <p className="rounded-xs border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t("common.offline")}
        </p>
      )}

      {/* How long a change takes to show up is the first thing anyone asks
          after saving, and every answer here is "not immediately". */}
      <p className="flex items-start gap-2.5 rounded-xs border border-primary/10 bg-surface-muted/60 px-4 py-3 text-sm text-ink-muted">
        <Info size={16} className="mt-0.5 shrink-0 text-accent-700" aria-hidden />
        {t("settings.seo.scopeNote")}
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
