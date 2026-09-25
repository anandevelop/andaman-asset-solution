/**
 * app/[locale]/admin/(content)/pages/contact/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * "ช่องทางติดต่อ" — the details a visitor uses to reach this company.
 *
 * These strings appear in the footer of every page, on the contact page, in
 * the WhatsApp CTA and inside the JSON-LD a search engine reads, so a wrong
 * number here is wrong everywhere at once.
 *
 * WHY IT MOVED OUT OF SETTINGS
 *
 * It was /admin/settings/contact. The blueprint had always put a `contact`
 * tab in this hub and lib/admin/nav.ts carried a comment saying the tab was
 * missing only because the screen did not exist yet. It does now: this is
 * the same page, and the same updateSettings action it always bound.
 *
 * THE ADDRESS IS FOUR FIELDS, NOT EIGHT
 *
 * The address and the office hours are stored one key per locale
 * (contact.addressTh, contact.addressEn, …) and were drawn as eight boxes
 * stacked down one screen — the only multi-language form in the back office
 * that did not use LanguageTabs, so "fill in the Chinese" meant a different
 * motion here than on every other translated page. It uses LanguageTabs
 * now, and the keys are untouched.
 *
 * That is safe because updateSettings skips any key the submitted form did
 * not carry (see the note at the top of its file): a save from the TH tab
 * writes contact.addressTh and leaves the other three exactly as they are.
 * Do not "fix" that null check.
 *
 * WRITE PERMISSION IS UNCHANGED
 *
 * ADMIN to save, as in settings. VIEWER and EDITOR can now open the page —
 * the (content) zone and this hub admit them, and a phone number is not a
 * secret — but the form is inside a disabled fieldset for anyone below
 * ADMIN, and the action re-checks regardless.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { getTranslations } from "next-intl/server";
import { Info } from "lucide-react";
import { Role } from "@prisma/client";
import { requireAdmin } from "@/lib/admin/guard";
import { hasRole } from "@/lib/role-rank";
import {
  defaultSettings,
  getOverriddenKeys,
  getSettingsForEditing,
  type SettingKey,
} from "@/lib/settings";
import { parseEditingLocale } from "@/lib/admin/translated-form";
import { updateSettings } from "@/app/[locale]/admin/(system)/settings/actions";
import SettingsForm, { type SettingGroup } from "@/components/admin/SettingsForm";
import LanguageTabs from "@/components/admin/LanguageTabs";
import type { Locale } from "@/i18n";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ lang?: string }>;
};

/** "th" → "Th", for the per-locale halves of the setting keys. */
const SUFFIX: Record<Locale, string> = { en: "En", th: "Th", zh: "Zh", ru: "Ru" };

export default async function AdminContactPage(props: Props) {
  const [{ locale }, searchParams] = await Promise.all([props.params, props.searchParams]);

  const session = await requireAdmin(locale, Role.VIEWER);
  const canWrite = hasRole(session.role, Role.ADMIN);

  const [t, current, overridden] = await Promise.all([
    getTranslations({ locale, namespace: "admin" }),
    getSettingsForEditing(),
    getOverriddenKeys(),
  ]);

  const lang = parseEditingLocale(searchParams.lang);
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

  /* A locale counts as filled when *something* is in force for it, an
     override or the config/site.ts default — which is what the public
     footer will actually print. Marking a locale incomplete because
     nobody has overridden its address would flag all four on a site that
     is entirely correct. */
  const addressKey = (l: Locale) => `contact.address${SUFFIX[l]}` as SettingKey;
  const hoursKey = (l: Locale) => `contact.officeHours${SUFFIX[l]}` as SettingKey;

  const filled = (l: Locale) =>
    (current[addressKey(l)] ?? "").trim().length > 0 && (current[hoursKey(l)] ?? "").trim().length > 0;

  const completeness = { en: filled("en"), th: filled("th"), zh: filled("zh"), ru: filled("ru") };

  const groups: SettingGroup[] = [
    {
      title: t("settings.groups.contactChannels"),
      fields: [
        field("contact.phone", t("settings.fields.phone"), {
          type: "tel",
          hint: t("settings.fields.phoneHint"),
        }),
        field("contact.phoneDisplay", t("settings.fields.phoneDisplay"), {
          hint: t("settings.fields.phoneDisplayHint"),
        }),
        field("contact.whatsapp", t("settings.fields.whatsapp"), {
          type: "tel",
          hint: t("settings.fields.whatsappHint"),
        }),
        field("contact.email", t("settings.fields.email"), { type: "email" }),
        field("contact.salesEmail", t("settings.fields.salesEmail"), { type: "email" }),
        field("contact.mapUrl", t("settings.fields.mapUrl"), { type: "url" }),
        /* The pin the contact map centres on and draws our marker at. Two
           separate boxes rather than one "7.99, 98.31" field: what people
           paste is whatever Google gave them, and a single field would
           have to guess at the separator. The hint says where to find
           them, because right-clicking the map is not obvious. */
        field("contact.latitude", t("settings.fields.latitude"), {
          hint: t("settings.fields.coordinatesHint"),
        }),
        field("contact.longitude", t("settings.fields.longitude")),
      ],
    },
    {
      // Only the selected language's two fields. The other six keys are
      // absent from the submitted form and therefore untouched by the save.
      title: t("pages.contact.addressGroup", { lang: lang.toUpperCase() }),
      fields: [
        field(addressKey(lang), t(`settings.fields.address${SUFFIX[lang]}` as never), {
          multiline: true,
        }),
        field(hoursKey(lang), t(`settings.fields.officeHours${SUFFIX[lang]}` as never)),
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
  ];

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-lg font-semibold text-primary">{t("settings.groups.contact")}</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">{t("settings.contactSubtitle")}</p>
      </header>

      {/* What is NOT editable here matters as much as what is. */}
      <p className="flex items-start gap-2.5 rounded-xs border border-primary/10 bg-surface-muted/60 px-4 py-3 text-sm text-ink-muted">
        <Info size={16} className="mt-0.5 shrink-0 text-accent-700" aria-hidden />
        {t("settings.scopeNote")}
      </p>

      <LanguageTabs
        active={lang}
        completeness={completeness}
        completeLabel={t("common.translationComplete")}
        missingLabel={t("common.translationMissing")}
      />

      <fieldset disabled={!canWrite} className="contents">
        {/* key={lang}, for the reason LanguageTabs' own header gives: every
            field below is uncontrolled, so switching language has to
            remount the form rather than re-use the old DOM nodes. */}
        <SettingsForm
          key={lang}
          action={updateSettings.bind(null, locale)}
          groups={groups}
          labels={{
            save: t("common.save"),
            overridden: t("settings.overridden"),
            usingDefault: t("settings.usingDefault"),
          }}
        />
      </fieldset>
    </div>
  );
}
