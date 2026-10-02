/**
 * app/[locale]/admin/pages/about/awards/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Awards: a card per award, and the form for one in a drawer (`?edit=<id>`,
 * `?edit=new`) — see CollectionGrid for why the forms no longer sit inline.
 * Reordering is the sortOrder field on the form, not drag-and-drop,
 * matching every other list in this admin.
 */

import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Plus, Trophy } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { safeQuery, isDatabaseOffline } from "@/lib/db";
import { Role } from "@prisma/client";
import { requireAdmin } from "@/lib/admin/guard";
import { hasRole } from "@/lib/role-rank";
import { parseEditingLocale, pickEditingTranslation, translationCompleteness } from "@/lib/admin/translated-form";
import { createAward, deleteAward, updateAward } from "./actions";
import AwardForm from "@/components/admin/AwardForm";
import LanguageTabs from "@/components/admin/LanguageTabs";
import AdminDrawer from "@/components/admin/ui/AdminDrawer";
import CollectionGrid, { collectionHref } from "@/components/admin/ui/CollectionGrid";
import AdminPageHeader from "@/components/admin/ui/AdminPageHeader";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ lang?: string; edit?: string }> };

export default async function AdminAwardsPage(props: Props) {
  const searchParams = await props.searchParams;
  const params = await props.params;

  const { locale } = params;

  /* VIEWER may open this page to see what is published; only EDITOR
     and above may submit either form below (canWrite gates both with a
     disabled fieldset, matching the zone's real minimum, unchanged from
     before this phase — see the actions in ./actions.ts). */
  const session = await requireAdmin(locale, Role.VIEWER);
  const canWrite = hasRole(session.role, Role.EDITOR);

  const t = await getTranslations({ locale, namespace: "admin" });
  const db = prisma;
  const lang = parseEditingLocale(searchParams.lang);

  const awards = await safeQuery(
    "admin:awards",
    () =>
      db.award.findMany({
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: { translations: true },
      }),
    [] as any[],
  );

  const base = `/${locale}/admin/pages/about/awards`;
  const href = (edit: string | null) => collectionHref(base, searchParams.lang, edit);
  // "new" only for a role that can save it; an unknown id opens nothing.
  const editing =
    searchParams.edit === "new"
      ? canWrite
        ? ("new" as const)
        : null
      : (awards.find((award: any) => award.id === searchParams.edit) ?? null);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={t("awards.title")}
        description={t("awards.subtitle")}
        actions={
          canWrite ? (
            <Link href={href("new")} scroll={false} className="admin-btn">
              <Plus size={15} aria-hidden />
              {t("awards.newTitle")}
            </Link>
          ) : undefined
        }
      />

      {isDatabaseOffline() && (
        <p className="rounded-control border border-adm-warning/30 bg-adm-warning-bg px-4 py-3 text-sm text-adm-warning">
          {t("common.offline")}
        </p>
      )}

      <CollectionGrid
        hasImages
        items={awards.map((award: any) => ({
          id: award.id,
          href: href(award.id),
          title:
            pickEditingTranslation<{ locale: string; title: string }>(award.translations, locale)?.title ||
            award.titleEn,
          subtitle: award.projectName,
          imageUrl: award.trophyImageUrl,
          tag: award.organization,
          meta: String(award.year),
          visible: award.isActive,
          completeness: translationCompleteness<any>(award.translations, "title"),
        }))}
        labels={{
          visible: t("awards.active"),
          hidden: t("awards.inactive"),
          missingThai: t("common.missingThai"),
          empty: t("awards.empty"),
        }}
      />

      {editing && (
        <AdminDrawer
          title={editing === "new" ? t("awards.newTitle") : editing.titleEn}
          icon={<Trophy size={18} aria-hidden />}
          closeHref={href(null)}
          closeLabel={t("leadDrawer.close")}
        >
          <div className="space-y-5">
            <LanguageTabs
              active={lang}
              completeness={
                editing === "new"
                  ? { en: true, th: true, zh: true, ru: true }
                  : translationCompleteness<any>(editing.translations, "title")
              }
              completeLabel={t("common.translationComplete")}
              missingLabel={t("common.translationMissing")}
            />
            <fieldset disabled={!canWrite} className="contents">
              {editing === "new" ? (
                <AwardForm
                  key={lang}
                  lang={lang}
                  action={createAward.bind(null, locale)}
                  submitLabel={t("common.create")}
                />
              ) : (
                <AwardForm
                  key={`${editing.id}:${lang}`}
                  lang={lang}
                  action={updateAward.bind(null, locale, editing.id)}
                  onDelete={deleteAward.bind(null, locale, editing.id)}
                  values={{
                    title: pickEditingTranslation<any>(editing.translations, lang)?.title ?? "",
                    organization: editing.organization,
                    projectName: editing.projectName ?? "",
                    year: String(editing.year),
                    trophyImageUrl: editing.trophyImageUrl ?? "",
                    isActive: editing.isActive,
                    sortOrder: String(editing.sortOrder),
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
