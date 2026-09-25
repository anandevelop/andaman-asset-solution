import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/admin/guard";
import { getBrochureProjectOptions } from "@/lib/brochures";
import { parseEditingLocale } from "@/lib/admin/translated-form";
import { createBrochure } from "../actions";
import EBrochureForm, { EMPTY_BROCHURE } from "@/components/admin/EBrochureForm";
import LanguageTabs from "@/components/admin/LanguageTabs";

type Props = {
  params: Promise<{ locale: string }>;
  /** `projectId` prefills the project select — the project workspace's
   *  brochures tab links here with it set, so "add a brochure for this
   *  project" does not ask you to find the project again in a dropdown.
   *  An id that matches no option simply leaves the select on its
   *  placeholder; the action validates it either way. */
  searchParams: Promise<{ lang?: string; projectId?: string }>;
};

export default async function NewEBrochurePage(props: Props) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const { locale } = params;

  await requireAdmin(locale);

  const [t, projects] = await Promise.all([
    getTranslations({ locale, namespace: "admin" }),
    getBrochureProjectOptions(),
  ]);
  const lang = parseEditingLocale(searchParams.lang);

  const presetProjectId = projects.some((project) => project.id === searchParams.projectId)
    ? searchParams.projectId!
    : "";

  return (
    <div className="space-y-8">
      <header>
        <Link
          href={`/${locale}/admin/e-brochures`}
          className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-primary"
        >
          <ArrowLeft size={14} aria-hidden />
          {t("eBrochures.title")}
        </Link>

        <h1 className="mt-3 text-2xl font-semibold text-primary sm:text-3xl">
          {t("eBrochures.newTitle")}
        </h1>
      </header>

      <LanguageTabs
        active={lang}
        completeness={{ en: false, th: false, zh: false, ru: false }}
        completeLabel={t("common.translationComplete")}
        missingLabel={t("common.translationMissing")}
      />

      <EBrochureForm
        key={`${lang}:${presetProjectId}`}
        lang={lang}
        action={createBrochure.bind(null, locale)}
        projects={projects}
        values={{ ...EMPTY_BROCHURE, projectId: presetProjectId }}
        submitLabel={t("common.create")}
      />
    </div>
  );
}
