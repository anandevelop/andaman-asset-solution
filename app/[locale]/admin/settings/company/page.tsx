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
import { ArrowLeft } from "lucide-react";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
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

  // sandbox: as-any — CompanyProfile predates a runnable `prisma generate`
  // here; see the cast note in ./actions.ts.
  const db = prisma as any;
  const profile = await db.companyProfile.findUnique({
    where: { id: "default" },
    include: { translations: true },
  });
  const completeness = translationCompleteness<any>(profile?.translations ?? [], "aboutUs");
  const editing = pickEditingTranslation<any>(profile?.translations ?? [], lang);

  return (
    <div className="space-y-8">
      <header>
        <Link
          href={`/${locale}/admin/settings`}
          className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-primary"
        >
          <ArrowLeft size={14} aria-hidden />
          {t("settings.title")}
        </Link>

        <p className="admin-section-title mt-4">{t("settings.company.title")}</p>
        <h1 className="mt-2 text-2xl font-semibold text-primary sm:text-3xl">
          {t("settings.company.title")}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-muted">
          {t("settings.company.subtitle")}
        </p>
      </header>

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
        aboutUs={editing?.aboutUs ?? ""}
        submitLabel={t("common.save")}
      />
    </div>
  );
}
