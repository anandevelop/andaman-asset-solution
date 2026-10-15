/**
 * app/[locale]/admin/projects/[id]/facilities/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * A project's facility photo cards: a grid of cards to find one in, and a
 * drawer to add or change one (`?edit=<id>` / `?edit=new`) — the same
 * arrangement as /admin/pages/about/corporate (CollectionGrid +
 * AdminDrawer). This page used to put the "add" form on top and every
 * facility's full form below it, which made a project with a dozen
 * facilities a long wall of inputs.
 *
 * Scoped to one project rather than global: a "Clubhouse" card on this
 * project can carry a different photo, or none, from "Clubhouse" on
 * another — see the model comment on ProjectFacility in schema.prisma.
 * The form and actions are unchanged; only where the form renders moved.
 */

import ProjectHubTabs from "@/components/admin/ProjectHubTabs";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Plus, Sparkles } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { requireAdmin } from "@/lib/admin/guard";
import { hasRole } from "@/lib/role-rank";
import { parseEditingLocale, pickEditingTranslation, translationCompleteness } from "@/lib/admin/translated-form";
import { createProjectFacility, deleteProjectFacility, updateProjectFacility } from "./actions";
import ProjectFacilityForm from "@/components/admin/ProjectFacilityForm";
import LanguageTabs from "@/components/admin/LanguageTabs";
import AdminDrawer from "@/components/admin/ui/AdminDrawer";
import CollectionGrid, { collectionHref } from "@/components/admin/ui/CollectionGrid";

type Props = {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ lang?: string; edit?: string }>;
};

export default async function AdminProjectFacilitiesPage(props: Props) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const { locale, id: projectId } = params;
  /* VIEWER may open this to see a project's facilities; only EDITOR
     and above may add one or submit the drawer's form (canWrite gates
     both — the add button is hidden, the form sits in a disabled
     fieldset). */
  const session = await requireAdmin(locale, Role.VIEWER);
  const canWrite = hasRole(session.role, Role.EDITOR);

  const t = await getTranslations({ locale, namespace: "admin" });
  const db = prisma;
  const lang = parseEditingLocale(searchParams.lang);

  const project = await db.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: { id: true, slug: true, nameEn: true, nameTh: true },
  });
  if (!project) notFound();

  const facilities = await db.projectFacility.findMany({
    where: { projectId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: { translations: true },
  });

  const base = `/${locale}/admin/projects/${project.id}/facilities`;
  const href = (edit: string | null) => collectionHref(base, searchParams.lang, edit);
  // "new" only for a role that can save it; an unknown id opens nothing.
  const target =
    searchParams.edit === "new"
      ? canWrite
        ? ("new" as const)
        : null
      : (facilities.find((row: any) => row.id === searchParams.edit) ?? null);
  const editing = target && target !== "new" ? pickEditingTranslation<any>(target.translations, lang) : undefined;

  // The name shown on a card or the drawer's title: the admin's own
  // language, else whichever translation exists, else the legacy column.
  const displayName = (row: any) =>
    pickEditingTranslation<any>(row.translations, locale)?.name ||
    row.translations[0]?.name ||
    row.nameEn ||
    row.nameTh ||
    t("facilities.title");

  return (
    <div className="space-y-6">
      <ProjectHubTabs locale={locale} projectId={project.id} active="facilities" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-adm-muted">{t("facilities.subtitle")}</p>
        {canWrite && (
          <Link href={href("new")} scroll={false} className="admin-btn">
            <Plus size={15} aria-hidden />
            {t("facilities.newTitle")}
          </Link>
        )}
      </div>

      <CollectionGrid
        columns={3}
        hasImages
        items={facilities.map((row: any) => ({
          id: row.id,
          href: href(row.id),
          title: displayName(row),
          subtitle: null,
          imageUrl: row.imageUrl,
          tag: null,
          meta: null,
          visible: row.isActive,
          completeness: translationCompleteness<any>(row.translations, "name"),
        }))}
        labels={{
          visible: t("facilities.active"),
          hidden: t("facilities.inactive"),
          missingThai: t("common.missingThai"),
          empty: t("facilities.empty"),
        }}
      />

      {target && (
        <AdminDrawer
          title={target === "new" ? t("facilities.newTitle") : displayName(target)}
          icon={<Sparkles size={18} aria-hidden />}
          closeHref={href(null)}
          closeLabel={t("leadDrawer.close")}
        >
          <div className="space-y-5">
            <LanguageTabs
              active={lang}
              completeness={
                target === "new"
                  ? { en: true, th: true, zh: true, ru: true }
                  : translationCompleteness<any>(target.translations, "name")
              }
              completeLabel={t("common.translationComplete")}
              missingLabel={t("common.translationMissing")}
            />
            <fieldset disabled={!canWrite} className="contents">
              {target === "new" ? (
                <ProjectFacilityForm
                  key={lang}
                  lang={lang}
                  action={createProjectFacility.bind(null, locale, project.id, project.slug)}
                  submitLabel={t("common.create")}
                />
              ) : (
                <ProjectFacilityForm
                  key={`${target.id}:${lang}`}
                  lang={lang}
                  action={updateProjectFacility.bind(null, locale, project.id, project.slug, target.id)}
                  onDelete={deleteProjectFacility.bind(null, locale, project.id, project.slug, target.id)}
                  values={{
                    name: editing?.name ?? "",
                    imageUrl: target.imageUrl ?? "",
                    isActive: target.isActive,
                    sortOrder: String(target.sortOrder),
                  }}
                  submitLabel={t("common.save")}
                />
              )}
            </fieldset>
          </div>
        </AdminDrawer>
      )}
    </div>
  );
}
