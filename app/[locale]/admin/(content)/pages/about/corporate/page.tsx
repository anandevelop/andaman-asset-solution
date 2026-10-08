/**
 * app/[locale]/admin/pages/about/corporate/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Corporate services: add at the top, every existing service editable in
 * place — same arrangement as /admin/pages/about/awards. Reordering is the sortOrder
 * field on each form, not drag-and-drop, matching every other list in
 * this admin.
 *
 * The public page sets these as a row of four tall cards — see
 * CorporateService's schema.prisma comment — so a 5th active row wraps and
 * leaves one card alone on a second line. Worth knowing before adding one;
 * not enforced here. The section's heading counts the active rows, so
 * switching one off is safe: the heading follows.
 */

import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Plus, Briefcase } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { safeQuery, isDatabaseOffline } from "@/lib/db";
import { Role } from "@prisma/client";
import { requireAdmin } from "@/lib/admin/guard";
import { hasRole } from "@/lib/role-rank";
import { parseEditingLocale, pickEditingTranslation, translationCompleteness } from "@/lib/admin/translated-form";
import { createCorporateService, deleteCorporateService, updateCorporateService } from "./actions";
import CorporateServiceForm from "@/components/admin/CorporateServiceForm";
import LanguageTabs from "@/components/admin/LanguageTabs";
import AdminDrawer from "@/components/admin/ui/AdminDrawer";
import CollectionGrid, { collectionHref } from "@/components/admin/ui/CollectionGrid";
import AdminPageHeader from "@/components/admin/ui/AdminPageHeader";
import SectionCopyLink from "@/components/admin/SectionCopyLink";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ lang?: string; edit?: string }> };

export default async function AdminCorporatePage(props: Props) {
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

  const services = await safeQuery(
    "admin:corporateServices",
    () =>
      db.corporateService.findMany({
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: { translations: true },
      }),
    [] as any[],
  );

  const base = `/${locale}/admin/pages/about/corporate`;
  const href = (edit: string | null) => collectionHref(base, searchParams.lang, edit);
  // "new" only for a role that can save it; an unknown id opens nothing.
  const target =
    searchParams.edit === "new"
      ? canWrite
        ? ("new" as const)
        : null
      : (services.find((row: any) => row.id === searchParams.edit) ?? null);
  const tr = target && target !== "new" ? pickEditingTranslation<any>(target.translations, lang) : undefined;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={t("corporate.title")}
        description={t("corporate.subtitle")}
        actions={
          canWrite ? (
            <Link href={href("new")} scroll={false} className="admin-btn">
              <Plus size={15} aria-hidden />
              {t("corporate.newTitle")}
            </Link>
          ) : undefined
        }
      />

      <SectionCopyLink locale={locale} prefix="home.corporate." lang={searchParams.lang} />

      {isDatabaseOffline() && (
        <p className="rounded-control border border-adm-warning/30 bg-adm-warning-bg px-4 py-3 text-sm text-adm-warning">
          {t("common.offline")}
        </p>
      )}

      <CollectionGrid
        columns={3}
        hasImages
        items={services.map((row: any) => ({
          id: row.id,
          href: href(row.id),
          title: pickEditingTranslation<any>(row.translations, locale)?.label || row.translations[0]?.label || row.id,
          subtitle: null,
          imageUrl: row.imageUrl,
          tag: null,
          meta: null,
          visible: row.isActive,
          completeness: translationCompleteness<any>(row.translations, "label"),
        }))}
        labels={{
          visible: t("corporate.active"),
          hidden: t("corporate.inactive"),
          missingThai: t("common.missingThai"),
          empty: t("corporate.empty"),
        }}
      />

      {target && (
        <AdminDrawer
          title={
            target === "new"
              ? t("corporate.newTitle")
              : pickEditingTranslation<any>(target.translations, locale)?.label || t("corporate.newTitle")
          }
          icon={<Briefcase size={18} aria-hidden />}
          closeHref={href(null)}
          closeLabel={t("leadDrawer.close")}
        >
          <div className="space-y-5">
            <LanguageTabs
              active={lang}
              completeness={
                target === "new"
                  ? { en: true, th: true, zh: true, ru: true }
                  : translationCompleteness<any>(target.translations, "label")
              }
              completeLabel={t("common.translationComplete")}
              missingLabel={t("common.translationMissing")}
            />
            <fieldset disabled={!canWrite} className="contents">
              {target === "new" ? (
                <CorporateServiceForm
                  key={lang}
                  lang={lang}
                  action={createCorporateService.bind(null, locale)}
                  submitLabel={t("common.create")}
                />
              ) : (
                <CorporateServiceForm
                  key={`${target.id}:${lang}`}
                  lang={lang}
                  action={updateCorporateService.bind(null, locale, target.id)}
                  onDelete={deleteCorporateService.bind(null, locale, target.id)}
                  values={{
                    label: tr?.label ?? "",
                    imageAlt: tr?.imageAlt ?? "",
                    imageUrl: target.imageUrl,
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
