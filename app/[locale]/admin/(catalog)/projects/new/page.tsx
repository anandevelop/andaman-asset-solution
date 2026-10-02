/**
 * app/[locale]/admin/projects/new/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Create form. The action is bound to the locale here so ProjectForm stays
 * a dumb renderer that works for both create and edit.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Role } from "@prisma/client";
import { requireAdmin } from "@/lib/admin/guard";
import { parseEditingLocale } from "@/lib/admin/translated-form";
import { createProject } from "../actions";
import ProjectForm from "@/components/admin/ProjectForm";
import LanguageTabs from "@/components/admin/LanguageTabs";
import AdminPageHeader from "@/components/admin/ui/AdminPageHeader";
import { zoneEyebrow } from "@/lib/admin/nav";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ lang?: string }> };

export default async function NewProjectPage(props: Props) {
  const searchParams = await props.searchParams;
  const params = await props.params;

  const {
    locale
  } = params;

  // Creating a project is an ADMIN-level act; editors may only edit.
  await requireAdmin(locale, Role.ADMIN);

  const t = await getTranslations({ locale, namespace: "admin" });
  const action = createProject.bind(null, locale);
  const lang = parseEditingLocale(searchParams.lang);

  return (
    <div className="space-y-8">
      <AdminPageHeader
        back={{ href: `/${locale}/admin/projects`, label: t("projects.title") }}
        eyebrow={zoneEyebrow((key) => t(key as never), "projects")}
        title={t("projects.newTitle")}
      />

      <LanguageTabs
        active={lang}
        completeness={{ en: false, th: false, zh: false, ru: false }}
        completeLabel={t("common.translationComplete")}
        missingLabel={t("common.translationMissing")}
      />

      <ProjectForm
        key={lang}
        locale={locale}
        lang={lang}
        action={action}
        submitLabel={t("common.create")}
      />
    </div>
  );
}
