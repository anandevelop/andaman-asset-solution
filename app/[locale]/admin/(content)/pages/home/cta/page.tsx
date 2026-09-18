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
import { Plus } from "lucide-react";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { safeQuery, isDatabaseOffline } from "@/lib/db";
import { requireAdmin } from "@/lib/admin/guard";
import { hasRole } from "@/lib/role-rank";
import {
  parseEditingLocale,
  pickEditingTranslation,
  translationCompleteness,
} from "@/lib/admin/translated-form";
import { getPublishedProjects } from "@/lib/projects";
import { CTA_PATHS } from "@/lib/site-cta";
import { PLACEMENT_DEFAULT, PLACEMENT_HIDDEN } from "@/lib/validations";
import {
  createCtaBlock,
  deleteCtaBlock,
  importCtaFileCopy,
  saveCtaPlacements,
  updateCtaBlock,
} from "./actions";
import SiteCtaForm from "@/components/admin/SiteCtaForm";
import CtaPlacementTable from "@/components/admin/CtaPlacementTable";
import CtaImportButton from "@/components/admin/CtaImportButton";
import LanguageTabs from "@/components/admin/LanguageTabs";
import TranslationStatusBadges from "@/components/admin/TranslationStatusBadges";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ lang?: string }> };

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
    value: assigned.has(path)
      ? (assigned.get(path) ?? PLACEMENT_HIDDEN)
      : PLACEMENT_DEFAULT,
  }));

  const options = blocks.map((block: any) => ({
    id: block.id,
    name: block.name,
    isActive: block.isActive,
    isDefault: block.isDefault,
  }));

  return (
    <div className="space-y-8">
      <header>
        <p className="admin-section-title">{t("brand")}</p>
        <h1 className="mt-2 text-2xl font-semibold text-primary sm:text-3xl">{t("cta.title")}</h1>
        <p className="mt-2 text-sm text-ink-muted">{t("cta.subtitle")}</p>
      </header>

      {isDatabaseOffline() && (
        <p className="rounded-xs border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t("common.offline")}
        </p>
      )}

      <LanguageTabs
        active={lang}
        completeness={{ en: true, th: true, zh: true, ru: true }}
        completeLabel={t("common.translationComplete")}
        missingLabel={t("common.translationMissing")}
      />

      {blocks.length === 0 && (
        <section className="admin-card">
          <h2 className="text-base font-semibold text-primary">{t("cta.importTitle")}</h2>
          <p className="mt-2 max-w-2xl text-sm text-ink-muted">{t("cta.importBody")}</p>
          <div className="mt-5">
            <fieldset disabled={!canWrite} className="contents">
              <CtaImportButton action={importCtaFileCopy.bind(null, locale)} />
            </fieldset>
          </div>
        </section>
      )}

      {/* ── Add ─────────────────────────────────────────────────────── */}
      <section className="admin-card">
        <h2 className="mb-5 flex items-center gap-2 text-base font-semibold text-primary">
          <Plus size={16} className="text-accent-700" aria-hidden />
          {t("cta.newTitle")}
        </h2>

        <fieldset disabled={!canWrite} className="contents">
          <SiteCtaForm
            key={`new-${lang}`}
            lang={lang}
            action={createCtaBlock.bind(null, locale)}
            submitLabel={t("common.create")}
            projectCount={projects.length}
            pagePaths={CTA_PATHS}
          />
        </fieldset>
      </section>

      {/* ── Existing ────────────────────────────────────────────────── */}
      {blocks.map((block: any) => {
        const completeness = translationCompleteness<any>(block.translations, "title");
        const editing = pickEditingTranslation<any>(block.translations, lang);

        return (
          <section key={block.id} className="admin-card">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-base font-semibold text-primary">{block.name}</h2>
                <TranslationStatusBadges completeness={completeness} />
                {block.isDefault && (
                  <span className="rounded-xs bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                    {t("cta.defaultBadge")}
                  </span>
                )}
              </div>

              <span
                className={
                  block.isActive
                    ? "rounded-xs bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800"
                    : "rounded-xs bg-surface-muted px-2 py-1 text-xs font-medium text-ink-muted"
                }
              >
                {block.isActive ? t("cta.active") : t("cta.inactive")}
              </span>
            </div>

            <fieldset disabled={!canWrite} className="contents">
              <SiteCtaForm
                key={`${block.id}-${lang}`}
                lang={lang}
                action={updateCtaBlock.bind(null, locale, block.id)}
                onDelete={deleteCtaBlock.bind(null, locale, block.id)}
                deleteLocked={block.isDefault}
                values={{
                  name: block.name,
                  isActive: block.isActive,
                  isDefault: block.isDefault,
                  sortOrder: String(block.sortOrder),
                  backgroundImageUrl: block.backgroundImageUrl ?? "",
                  primaryKind: block.primaryKind,
                  primaryHref: block.primaryHref ?? "",
                  secondaryKind: block.secondaryKind,
                  secondaryHref: block.secondaryHref ?? "",
                  eyebrow: editing?.eyebrow ?? "",
                  title: editing?.title ?? "",
                  subtitle: editing?.subtitle ?? "",
                  primaryLabel: editing?.primaryLabel ?? "",
                  secondaryLabel: editing?.secondaryLabel ?? "",
                }}
                submitLabel={t("common.save")}
                projectCount={projects.length}
                pagePaths={CTA_PATHS}
              />
            </fieldset>
          </section>
        );
      })}

      {/* ── Where each one appears ──────────────────────────────────── */}
      {blocks.length > 0 && (
        <section className="admin-card">
          <h2 className="text-base font-semibold text-primary">{t("cta.placementsTitle")}</h2>
          <p className="mt-2 max-w-2xl text-sm text-ink-muted">{t("cta.placementsBody")}</p>

          <div className="mt-5">
            <fieldset disabled={!canWrite} className="contents">
              <CtaPlacementTable
                rows={rows}
                blocks={options}
                action={saveCtaPlacements.bind(null, locale)}
              />
            </fieldset>
          </div>
        </section>
      )}
    </div>
  );
}
