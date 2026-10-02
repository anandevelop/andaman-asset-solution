import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { requireAdmin } from "@/lib/admin/guard";
import { getBrochureProjectOptions } from "@/lib/brochures";
import { parseEditingLocale } from "@/lib/admin/translated-form";
import { createBrochure } from "../actions";
import EBrochureForm, { EMPTY_BROCHURE } from "@/components/admin/EBrochureForm";
import LanguageTabs from "@/components/admin/LanguageTabs";
import AdminPageHeader from "@/components/admin/ui/AdminPageHeader";
import { zoneEyebrow } from "@/lib/admin/nav";

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
      <AdminPageHeader
        back={{ href: `/${locale}/admin/e-brochures`, label: t("eBrochures.title") }}
        eyebrow={zoneEyebrow((key) => t(key as never), "projects")}
        title={t("eBrochures.newTitle")}
      />

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
