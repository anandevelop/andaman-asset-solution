import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, CheckCircle2, ExternalLink } from "lucide-react";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin/guard";
import { hasRole } from "@/lib/role-rank";
import { getBrochureProjectOptions } from "@/lib/brochures";
import {
  parseEditingLocale,
  pickEditingTranslation,
  translationCompleteness,
} from "@/lib/admin/translated-form";
import { deleteBrochure, updateBrochure } from "../../actions";
import EBrochureForm, { type EBrochureValues } from "@/components/admin/EBrochureForm";
import LanguageTabs from "@/components/admin/LanguageTabs";
import SaveToast from "@/components/admin/SaveToast";
import PublishingRevisionPanel from "@/components/admin/PublishingRevisionPanel";

type Props = {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ created?: string; lang?: string }>;
};

type Translation = { locale: string; title: string; description: string | null };

export default async function EditEBrochurePage(props: Props) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const { locale, id } = params;

  // VIEWER may open this to see the brochure's own details; saving or
  // deleting stays behind a disabled fieldset for anyone below EDITOR.
  const session = await requireAdmin(locale, Role.VIEWER);
  const canWrite = hasRole(session.role, Role.EDITOR);

  const lang = parseEditingLocale(searchParams.lang);

  const [t, brochure, projects] = await Promise.all([
    getTranslations({ locale, namespace: "admin" }),
    prisma.eBrochure.findUnique({
      where: { id },
      include: { translations: true },
    }),
    getBrochureProjectOptions(),
  ]);

  if (!brochure) notFound();

  const translations = brochure.translations as Translation[];

  const completeness = translationCompleteness(translations, "title");
  // Exact match, not the public fallback chain: an admin editing zh who saw
  // English text in the zh fields would reasonably believe zh was already
  // translated. Blank is what prompts them to fill it in.
  const editing = pickEditingTranslation(translations, lang);

  const values: EBrochureValues = {
    slug: brochure.slug,
    title: editing?.title ?? "",
    description: editing?.description ?? "",
    fileUrl: brochure.fileUrl,
    coverImageUrl: brochure.coverImageUrl ?? "",
    projectId: brochure.projectId ?? "",
    isPublished: brochure.isPublished,
    sortOrder: String(brochure.sortOrder),
  };

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
          {t("eBrochures.editTitle")}
        </h1>

        {brochure.isPublished && (
          <Link
            href={`/${locale}/e-brochure/${brochure.slug}`}
            target="_blank"
            className="mt-3 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-primary"
          >
            <ExternalLink size={14} aria-hidden />
            /e-brochure/{brochure.slug}
          </Link>
        )}
      </header>

      {searchParams.created && (
        <SaveToast tone="success" token="created">
          <CheckCircle2 size={16} aria-hidden />
          {t("common.saved")}
        </SaveToast>
      )}

      <PublishingRevisionPanel
        locale={locale}
        type="E_BROCHURE"
        id={brochure.id}
        labels={{
          toggle: t("publishing.revision.toggle"),
          compareTitle: t("publishing.revision.compareTitle"),
          noRevisionYet: t("publishing.revision.noRevisionYet"),
          currentLabel: t("publishing.revision.currentLabel"),
          publishedLabel: t("publishing.revision.publishedLabel"),
          historyTitle: t("publishing.revision.historyTitle"),
          historyEmpty: t("publishing.revision.historyEmpty"),
          revertAction: t("publishing.revision.revertAction"),
          confirmRevert: t("publishing.revision.confirmRevert"),
          error: t("common.error"),
          autoEditBadge: t("publishing.revision.autoEditBadge"),
        }}
      />

      <LanguageTabs
        active={lang}
        completeness={completeness}
        completeLabel={t("common.translationComplete")}
        missingLabel={t("common.translationMissing")}
      />

      <fieldset disabled={!canWrite} className="contents">
        <EBrochureForm
          key={lang}
          lang={lang}
          action={updateBrochure.bind(null, locale, brochure.id)}
          onDelete={deleteBrochure.bind(null, locale, brochure.id)}
          values={values}
          projects={projects}
          submitLabel={t("common.save")}
        />
      </fieldset>
    </div>
  );
}
