/**
 * app/[locale]/admin/settings/company/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Edit CompanyProfile.aboutUsEn/Th — the "About Andaman Asset Solution"
 * text shared by /about (see app/[locale]/(site)/about/page.tsx) and, in
 * future, any project page that wants a company blurb.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { safeQuery, isDatabaseOffline } from "@/lib/db";
import { requireAdmin } from "@/lib/admin/guard";
import { parseEditingLocale, pickEditingTranslation, translationCompleteness } from "@/lib/admin/translated-form";
import { updateCompanyProfile } from "./actions";
import CompanyProfileForm from "@/components/admin/CompanyProfileForm";
import LanguageTabs from "@/components/admin/LanguageTabs";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ lang?: string }> };

export default async function AdminCompanyProfilePage(props: Props) {
  const searchParams = await props.searchParams;
  const params = await props.params;

  const {
    locale
  } = params;

  await requireAdmin(locale, Role.ADMIN);

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
    </div>
  );
}
