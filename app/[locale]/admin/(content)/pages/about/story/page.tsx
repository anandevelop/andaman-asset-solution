/**
 * app/[locale]/admin/(content)/pages/about/story/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The company story on /about — the "About Andaman Asset Solution" text,
 * the page's hero image, the story eyebrow/title/image and the founding
 * year the home page's stat row reads (CompanyProfile, one row).
 *
 * WHY IT IS A TAB HERE AND NOT A SETTINGS GROUP
 *
 * It was /admin/settings/company, which read like an entry about the
 * company rather than about a page. Every field on it is copy or imagery
 * rendered by /about — the same public page whose other five sections are
 * the tabs beside this one — so editing the About page meant two places,
 * in two different zones, with two different menus. There is no legal
 * entity name or tax number left behind in settings: there never was one
 * on this form, which is why the settings rail lost the row entirely
 * rather than keeping a thinned-out version of it.
 *
 * WRITE PERMISSION IS UNCHANGED
 *
 * The other About tabs let EDITOR write; this one did not and still does
 * not. ./actions.ts keeps requireAdminAction(Role.ADMIN), and `canWrite`
 * below matches it, so the move widened who can *read* the page (VIEWER,
 * like every other tab in this hub) and changed nothing about who can save
 * it. Opening it to EDITOR would be a policy decision, not a side effect
 * of moving a route.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { getTranslations } from "next-intl/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { safeQuery, isDatabaseOffline } from "@/lib/db";
import { requireAdmin } from "@/lib/admin/guard";
import { hasRole } from "@/lib/role-rank";
import { parseEditingLocale, pickEditingTranslation, translationCompleteness } from "@/lib/admin/translated-form";
import { updateCompanyProfile } from "./actions";
import CompanyProfileForm from "@/components/admin/CompanyProfileForm";
import LanguageTabs from "@/components/admin/LanguageTabs";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ lang?: string }> };

export default async function AdminAboutStoryPage(props: Props) {
  const searchParams = await props.searchParams;
  const params = await props.params;

  const { locale } = params;

  const session = await requireAdmin(locale, Role.VIEWER);
  const canWrite = hasRole(session.role, Role.ADMIN);

  const t = await getTranslations({ locale, namespace: "admin" });
  const lang = parseEditingLocale(searchParams.lang);

  const db = prisma;
  const profile = await safeQuery(
    "admin:companyProfile",
    () =>
      db.companyProfile.findUnique({
        where: { id: "default" },
        include: { translations: true },
      }),
    null,
  );
  const completeness = translationCompleteness<any>(profile?.translations ?? [], "aboutUs");
  const editing = pickEditingTranslation<any>(profile?.translations ?? [], lang);

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-lg font-semibold text-primary">{t("settings.company.title")}</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">{t("settings.company.subtitle")}</p>
      </header>

      {isDatabaseOffline() && (
        <p className="rounded-xs border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t("common.offline")}
        </p>
      )}

      <LanguageTabs
        active={lang}
        completeness={completeness}
        completeLabel={t("common.translationComplete")}
        missingLabel={t("common.translationMissing")}
      />

      <fieldset disabled={!canWrite} className="contents">
        <CompanyProfileForm
          key={lang}
          lang={lang}
          action={updateCompanyProfile.bind(null, locale)}
          values={{
            aboutUs: editing?.aboutUs ?? "",
            storyEyebrow: editing?.storyEyebrow ?? "",
            storyTitle: editing?.storyTitle ?? "",
            storyImageUrl: profile?.storyImageUrl ?? "",
            aboutHeroImageUrl: profile?.aboutHeroImageUrl ?? "",
            foundedYear: profile?.foundedYear ? String(profile.foundedYear) : "",
          }}
          submitLabel={t("common.save")}
        />
      </fieldset>
    </div>
  );
}
