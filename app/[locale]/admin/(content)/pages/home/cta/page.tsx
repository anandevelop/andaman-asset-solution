/**
 * app/[locale]/admin/pages/home/cta/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The closing CTA — the band above the footer on every public page.
 *
 * Three things on one screen, in the order the questions get asked: what
 * blocks exist, what each one says in each language, and which pages show
 * which. The page assignment table is here rather than on a screen of its
 * own because the two decisions are made together — a new block is written
 * *in order to* put it somewhere.
 *
 * WHILE THE TABLE IS EMPTY the public site renders the copy that ships in
 * messages/*.json, which is what it did before any of this existed. The
 * empty state says so and offers to import that copy as a starting point,
 * rather than pretending the site currently has no CTA.
 */

import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Megaphone, Plus } from "lucide-react";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { safeQuery, isDatabaseOffline } from "@/lib/db";
import { requireAdmin } from "@/lib/admin/guard";
import { hasRole } from "@/lib/role-rank";
import { parseEditingLocale, pickEditingTranslation, translationCompleteness } from "@/lib/admin/translated-form";
import { getPublishedProjects } from "@/lib/projects";
import { CTA_PATHS } from "@/lib/site-cta";
import { PLACEMENT_DEFAULT, PLACEMENT_HIDDEN } from "@/lib/validations";
import { createCtaBlock, deleteCtaBlock, importCtaFileCopy, saveCtaPlacements, updateCtaBlock } from "./actions";
import SiteCtaForm from "@/components/admin/SiteCtaForm";
import CtaPlacementTable from "@/components/admin/CtaPlacementTable";
import CtaImportButton from "@/components/admin/CtaImportButton";
import LanguageTabs from "@/components/admin/LanguageTabs";
import AdminDrawer from "@/components/admin/ui/AdminDrawer";
import CollectionGrid, { collectionHref } from "@/components/admin/ui/CollectionGrid";
import AdminPageHeader from "@/components/admin/ui/AdminPageHeader";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ lang?: string; edit?: string }> };

export default async function AdminCtaPage(props: Props) {
  const searchParams = await props.searchParams;
  const { locale } = await props.params;

  /* VIEWER may open this page to see the CTA blocks and where each is
     placed; only EDITOR and above may write (canWrite disables the import
     button, both block forms, and the placement table — the actions
     themselves are unchanged). */
  const session = await requireAdmin(locale, Role.VIEWER);
  const canWrite = hasRole(session.role, Role.EDITOR);

  const t = await getTranslations({ locale, namespace: "admin" });
  const lang = parseEditingLocale(searchParams.lang);

  const [blocks, placements, projects] = await Promise.all([
    safeQuery(
      "admin:ctaBlocks",
      () =>
        prisma.siteCtaBlock.findMany({
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          include: { translations: true },
        }),
      [] as any[],
    ),
    safeQuery(
      "admin:ctaPlacements",
      () => prisma.siteCtaPlacement.findMany(),
      [] as { path: string; blockId: string | null }[],
    ),
    getPublishedProjects(locale),
  ]);

  const assigned = new Map(placements.map((row) => [row.path, row.blockId]));

  const rows = CTA_PATHS.map((path) => ({
    path,
    value: assigned.has(path) ? (assigned.get(path) ?? PLACEMENT_HIDDEN) : PLACEMENT_DEFAULT,
  }));

  const options = blocks.map((block: any) => ({
    id: block.id,
    name: block.name,
    isActive: block.isActive,
    isDefault: block.isDefault,
  }));

  const base = `/${locale}/admin/pages/home/cta`;
  const href = (edit: string | null) => collectionHref(base, searchParams.lang, edit);
  // "new" only for a role that can save it; an unknown id opens nothing.
  const target =
    searchParams.edit === "new"
      ? canWrite
        ? ("new" as const)
        : null
      : (blocks.find((block: any) => block.id === searchParams.edit) ?? null);
  const tr = target && target !== "new" ? pickEditingTranslation<any>(target.translations, lang) : undefined;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={t("cta.title")}
        description={t("cta.subtitle")}
        actions={
          canWrite ? (
            <Link href={href("new")} scroll={false} className="admin-btn">
              <Plus size={15} aria-hidden />
              {t("cta.newTitle")}
            </Link>
          ) : undefined
        }
      />

      {isDatabaseOffline() && (
        <p className="rounded-xs border border-adm-warning/30 bg-adm-warning-bg px-4 py-3 text-sm text-adm-warning">
          {t("common.offline")}
        </p>
      )}

      {blocks.length === 0 && (
        <section className="admin-card">
          <h2 className="text-base font-semibold text-adm-text">{t("cta.importTitle")}</h2>
          <p className="mt-2 max-w-2xl text-sm text-adm-muted">{t("cta.importBody")}</p>
          <div className="mt-5">
            <fieldset disabled={!canWrite} className="contents">
              <CtaImportButton action={importCtaFileCopy.bind(null, locale)} />
            </fieldset>
          </div>
        </section>
      )}

      <CollectionGrid
        columns={2}
        hasImages
        items={blocks.map((block: any) => ({
          id: block.id,
          href: href(block.id),
          title: block.name,
          subtitle: pickEditingTranslation<any>(block.translations, locale)?.title ?? null,
          imageUrl: block.backgroundImageUrl,
          tag: block.isDefault ? t("cta.defaultBadge") : null,
          meta: `#${block.sortOrder}`,
          visible: block.isActive,
          completeness: translationCompleteness<any>(block.translations, "title"),
        }))}
        labels={{
          visible: t("cta.active"),
          hidden: t("cta.inactive"),
          missingThai: t("common.missingThai"),
          empty: t("cta.empty"),
        }}
      />

      {/* ── Where each one appears ──────────────────────────────────── */}
      {blocks.length > 0 && (
        <section className="admin-card">
          <h2 className="text-base font-semibold text-adm-text">{t("cta.placementsTitle")}</h2>
          <p className="mt-2 max-w-2xl text-sm text-adm-muted">{t("cta.placementsBody")}</p>

          <div className="mt-5">
            <fieldset disabled={!canWrite} className="contents">
              <CtaPlacementTable rows={rows} blocks={options} action={saveCtaPlacements.bind(null, locale)} />
            </fieldset>
          </div>
        </section>
      )}

      {target && (
        <AdminDrawer
          title={target === "new" ? t("cta.newTitle") : target.name}
          icon={<Megaphone size={18} aria-hidden />}
          closeHref={href(null)}
          closeLabel={t("leadDrawer.close")}
          width={640}
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
                <SiteCtaForm
                  key={`new-${lang}`}
                  lang={lang}
                  action={createCtaBlock.bind(null, locale)}
                  submitLabel={t("common.create")}
                  projectCount={projects.length}
                  pagePaths={CTA_PATHS}
                />
              ) : (
                <SiteCtaForm
                  key={`${target.id}-${lang}`}
                  lang={lang}
                  action={updateCtaBlock.bind(null, locale, target.id)}
                  onDelete={deleteCtaBlock.bind(null, locale, target.id)}
                  deleteLocked={target.isDefault}
                  values={{
                    name: target.name,
                    isActive: target.isActive,
                    isDefault: target.isDefault,
                    sortOrder: String(target.sortOrder),
                    backgroundImageUrl: target.backgroundImageUrl ?? "",
                    primaryKind: target.primaryKind,
                    primaryHref: target.primaryHref ?? "",
                    secondaryKind: target.secondaryKind,
                    secondaryHref: target.secondaryHref ?? "",
                    eyebrow: tr?.eyebrow ?? "",
                    title: tr?.title ?? "",
                    subtitle: tr?.subtitle ?? "",
                    primaryLabel: tr?.primaryLabel ?? "",
                    secondaryLabel: tr?.secondaryLabel ?? "",
                  }}
                  submitLabel={t("common.save")}
                  projectCount={projects.length}
                  pagePaths={CTA_PATHS}
                />
              )}
            </fieldset>
          </div>
        </AdminDrawer>
      )}
    </div>
  );
}
