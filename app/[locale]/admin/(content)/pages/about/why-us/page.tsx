/**
 * app/[locale]/admin/pages/about/why-us/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * "Why us": add at the top, every existing point editable in place — same
 * arrangement as /admin/pages/about/awards. Reordering is the sortOrder field on each
 * form, not drag-and-drop, matching every other list in this admin.
 */

import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Plus, Sparkles } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { safeQuery, isDatabaseOffline } from "@/lib/db";
import { Role } from "@prisma/client";
import { requireAdmin } from "@/lib/admin/guard";
import { hasRole } from "@/lib/role-rank";
import { parseEditingLocale, pickEditingTranslation, translationCompleteness } from "@/lib/admin/translated-form";
import { createWhyUsPoint, deleteWhyUsPoint, updateWhyUsPoint } from "./actions";
import WhyUsPointForm from "@/components/admin/WhyUsPointForm";
import LanguageTabs from "@/components/admin/LanguageTabs";
import AdminDrawer from "@/components/admin/ui/AdminDrawer";
import CollectionGrid, { collectionHref } from "@/components/admin/ui/CollectionGrid";
import AdminPageHeader from "@/components/admin/ui/AdminPageHeader";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ lang?: string; edit?: string }> };

export default async function AdminWhyUsPage(props: Props) {
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

  const points = await safeQuery(
    "admin:whyUsPoints",
    () =>
      db.whyUsPoint.findMany({
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: { translations: true },
      }),
    [] as any[],
  );

  const base = `/${locale}/admin/pages/about/why-us`;
  const href = (edit: string | null) => collectionHref(base, searchParams.lang, edit);
  // "new" only for a role that can save it; an unknown id opens nothing.
  const target =
    searchParams.edit === "new"
      ? canWrite
        ? ("new" as const)
        : null
      : (points.find((row: any) => row.id === searchParams.edit) ?? null);
  const tr = target && target !== "new" ? pickEditingTranslation<any>(target.translations, lang) : undefined;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={t("whyUs.title")}
        description={t("whyUs.subtitle")}
        actions={
          canWrite ? (
            <Link href={href("new")} scroll={false} className="admin-btn">
              <Plus size={15} aria-hidden />
              {t("whyUs.newTitle")}
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
        columns={3}
        items={points.map((row: any) => ({
          id: row.id,
          href: href(row.id),
          title: pickEditingTranslation<any>(row.translations, locale)?.title || row.translations[0]?.title || row.id,
          subtitle: pickEditingTranslation<any>(row.translations, locale)?.body || null,
          imageUrl: null,
          tag: null,
          meta: `#${row.sortOrder}`,
          visible: row.isActive,
          completeness: translationCompleteness<any>(row.translations, "title"),
        }))}
        labels={{
          visible: t("whyUs.active"),
          hidden: t("whyUs.inactive"),
          missingThai: t("common.missingThai"),
          empty: t("whyUs.empty"),
        }}
      />

      {target && (
        <AdminDrawer
          title={
            target === "new"
              ? t("whyUs.newTitle")
              : pickEditingTranslation<any>(target.translations, locale)?.title || t("whyUs.newTitle")
          }
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
                  : translationCompleteness<any>(target.translations, "title")
              }
              completeLabel={t("common.translationComplete")}
              missingLabel={t("common.translationMissing")}
            />
            <fieldset disabled={!canWrite} className="contents">
              {target === "new" ? (
                <WhyUsPointForm
                  key={lang}
                  lang={lang}
                  action={createWhyUsPoint.bind(null, locale)}
                  submitLabel={t("common.create")}
                />
              ) : (
                <WhyUsPointForm
                  key={`${target.id}:${lang}`}
                  lang={lang}
                  action={updateWhyUsPoint.bind(null, locale, target.id)}
                  onDelete={deleteWhyUsPoint.bind(null, locale, target.id)}
                  values={{
                    icon: target.icon,
                    title: tr?.title ?? "",
                    body: tr?.body ?? "",
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
