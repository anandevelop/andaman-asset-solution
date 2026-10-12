/**
 * app/[locale]/admin/(content)/pages/about/figures/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * "ตัวเลขบริษัท" — the four figures in the About page's stat bar.
 *
 * They are counted (lib/about-stats.ts), and each one can be overridden
 * here. The placeholder in each box is the counted figure, in the admin's
 * language, so a blank box shows what the page will display. Stored as
 * SiteSetting aboutStats.* and saved through updateSettings, the same
 * arrangement as pages/projects: no migration, a site-wide purge on save,
 * and ADMIN to save, with everyone else reading.
 *
 * The labels under the figures ("Developments", "Years in Phuket") are site
 * copy (about.stats.*, /admin/pages/copy), not settings: they are words
 * and differ per language, while a figure is the same in all four.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Info } from "lucide-react";
import { Role } from "@prisma/client";
import { requireAdmin } from "@/lib/admin/guard";
import { hasRole } from "@/lib/role-rank";
import { getOverriddenKeys, getSettingsForEditing, type SettingKey } from "@/lib/settings";
import { getPublishedProjects } from "@/lib/projects";
import { getCompanyProfile } from "@/lib/company";
import { COMPANY_FOUNDED_YEAR } from "@/content/company-timeline";
import { ABOUT_STAT_KEYS, countedAboutStats } from "@/lib/about-stats";
import { updateSettings } from "@/app/[locale]/admin/(system)/settings/actions";
import SettingsForm, { type SettingGroup } from "@/components/admin/SettingsForm";

type Props = { params: Promise<{ locale: string }> };

export default async function AdminAboutFigures(props: Props) {
  const { locale } = await props.params;

  const session = await requireAdmin(locale, Role.VIEWER);
  const canWrite = hasRole(session.role, Role.ADMIN);

  const [t, tAbout, current, overridden, projects, profile] = await Promise.all([
    getTranslations({ locale, namespace: "admin" }),
    getTranslations({ locale, namespace: "about.stats" }),
    getSettingsForEditing(),
    getOverriddenKeys(),
    getPublishedProjects(locale),
    getCompanyProfile(locale),
  ]);

  const foundedYear = profile?.foundedYear ?? null;
  const counted = countedAboutStats(locale, projects, foundedYear);

  const groups: SettingGroup[] = [
    {
      title: t("pages.aboutFigures.group"),
      fields: ABOUT_STAT_KEYS.map((stat) => {
        const key = `aboutStats.${stat}` as SettingKey;
        const isOverridden = overridden.includes(key);
        return {
          key,
          label: tAbout(stat),
          placeholder: counted[stat],
          value: isOverridden ? current[key] : "",
          overridden: isOverridden,
          hint:
            stat === "years"
              ? t("pages.aboutFigures.yearsHint", { year: foundedYear ?? COMPANY_FOUNDED_YEAR })
              : t("pages.aboutFigures.hint"),
        };
      }),
    },
  ];

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-lg font-semibold text-adm-text">{t("pages.aboutFigures.heading")}</h2>
        <p className="mt-1 max-w-2xl text-sm text-adm-muted">{t("pages.aboutFigures.intro")}</p>
      </header>

      <p className="flex items-start gap-2.5 rounded-xs border border-adm-line bg-adm-text/4 px-4 py-3 text-sm text-adm-muted">
        <Info size={16} className="mt-0.5 shrink-0 text-adm-accent-ink" aria-hidden />
        <span>
          {t("pages.aboutFigures.blankNote")}{" "}
          <Link href={`/${locale}/admin/pages/copy?q=about.stats.`} className="underline">
            {t("tabs.pages.copy")}
          </Link>
        </span>
      </p>

      <fieldset disabled={!canWrite} className="contents">
        <SettingsForm
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
