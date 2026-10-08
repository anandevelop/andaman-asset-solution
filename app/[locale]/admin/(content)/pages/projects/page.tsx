/**
 * app/[locale]/admin/(content)/pages/projects/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * "โครงการ" — the banner atop the public /projects page.
 *
 * Its background photo, the caption in its corner, and the eyebrow, heading
 * and subheading in each language. Every field is optional: blank means the
 * built-in, which is what the page showed before this screen existed — the
 * copy in messages/ (shown here as the grey placeholder, in the language
 * being edited) and the first published project's photograph. The figures
 * and the shortcut bar are counted from the projects and are not here.
 *
 * WHY SETTINGS AND NOT A TABLE OF ITS OWN
 *
 * Fourteen strings and a URL, with exactly the shape lib/settings.ts was
 * built for: one key per locale, "" as the default, a merge that falls back
 * whatever the database says, and an admin form (SettingsForm) and action
 * (updateSettings) that already handle per-locale keys, image uploads and
 * "clear to reset". A model would have meant a migration, a reader with its
 * own fallback rules, and a second form doing the same thing. The
 * precedence rules live in lib/projects-hero.ts.
 *
 * updateSettings skips every key the form did not carry, so a save from the
 * TH tab writes the Thai copy and the image fields and leaves the other
 * three languages as they were — the same arrangement as pages/contact.
 * It is also an ADMIN action, so EDITOR and VIEWER can open this page but
 * see it read-only, as on contact.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { getTranslations } from "next-intl/server";
import { Info } from "lucide-react";
import { Role } from "@prisma/client";
import { requireAdmin } from "@/lib/admin/guard";
import { hasRole } from "@/lib/role-rank";
import { getOverriddenKeys, getSettingsForEditing, type SettingKey } from "@/lib/settings";
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

export default async function AdminProjectsPageBanner(props: Props) {
  const [{ locale }, searchParams] = await Promise.all([props.params, props.searchParams]);

  const session = await requireAdmin(locale, Role.VIEWER);
  const canWrite = hasRole(session.role, Role.ADMIN);

  const lang = parseEditingLocale(searchParams.lang);

  const [t, tPublic, current, overridden] = await Promise.all([
    getTranslations({ locale, namespace: "admin" }),
    // The built-in copy in the language being edited, as the placeholder:
    // what the public page shows in that language while the box is empty.
    getTranslations({ locale: lang, namespace: "projects" }),
    getSettingsForEditing(),
    getOverriddenKeys(),
  ]);

  const isOverridden = (key: SettingKey) => overridden.includes(key);

  const text = (
    key: SettingKey,
    label: string,
    placeholder: string,
    options: { hint?: string; multiline?: boolean } = {},
  ) => ({
    key,
    label,
    placeholder,
    value: isOverridden(key) ? current[key] : "",
    overridden: isOverridden(key),
    ...options,
  });

  const localKey = (field: "eyebrow" | "title" | "subtitle") =>
    `projectsHero.${field}${SUFFIX[lang]}` as SettingKey;

  const groups: SettingGroup[] = [
    {
      title: t("pages.projectsHero.imageGroup"),
      fields: [
        {
          key: "projectsHero.imageUrl",
          label: t("pages.projectsHero.image"),
          hint: t("pages.projectsHero.imageHint"),
          kind: "image",
          // "" when nothing is uploaded: the uploader then shows an empty
          // slot, and the public page uses the first project's photograph.
          effective: current["projectsHero.imageUrl"],
          placeholder: "",
          value: current["projectsHero.imageUrl"],
          overridden: isOverridden("projectsHero.imageUrl"),
        },
        text("projectsHero.imageCaption", t("pages.projectsHero.caption"), "", {
          hint: t("pages.projectsHero.captionHint"),
        }),
      ],
    },
    {
      // Only the selected language's three fields; the other nine keys are
      // absent from the submitted form and therefore untouched by the save.
      title: t("pages.projectsHero.textGroup", { lang: lang.toUpperCase() }),
      fields: [
        text(localKey("eyebrow"), t("pages.projectsHero.eyebrow"), tPublic("eyebrow")),
        text(localKey("title"), t("pages.projectsHero.title"), tPublic("title")),
        text(localKey("subtitle"), t("pages.projectsHero.subtitle"), tPublic("subtitle"), {
          multiline: true,
        }),
      ],
    },
  ];

  /* Every language is complete: a blank field shows the built-in copy,
     which exists in all four, so nothing on the public page is missing. */
  const completeness = { en: true, th: true, zh: true, ru: true };

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-lg font-semibold text-adm-text">{t("pages.projectsHero.heading")}</h2>
        <p className="mt-1 max-w-2xl text-sm text-adm-muted">{t("pages.projectsHero.intro")}</p>
      </header>

      <p className="flex items-start gap-2.5 rounded-xs border border-adm-line bg-adm-text/4 px-4 py-3 text-sm text-adm-muted">
        <Info size={16} className="mt-0.5 shrink-0 text-adm-accent-ink" aria-hidden />
        {t("pages.projectsHero.blankNote")}
      </p>

      <LanguageTabs
        active={lang}
        completeness={completeness}
        completeLabel={t("common.translationComplete")}
        missingLabel={t("common.translationMissing")}
      />

      <fieldset disabled={!canWrite} className="contents">
        {/* key={lang}: the fields are uncontrolled, so switching language
            has to remount the form — see LanguageTabs. */}
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
