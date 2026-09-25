import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CheckCircle2 } from "lucide-react";
import { ContentStatus, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin/guard";
import { hasRole } from "@/lib/role-rank";
import { getArticleCategories, isArticleLiveNow } from "@/lib/news";
import { toDateTimeLocal } from "@/lib/format";
import { locales } from "@/i18n";
import {
  parseEditingLocale,
  pickEditingTranslation,
  translationCompleteness,
  translationCompletenessPercent,
} from "@/lib/admin/translated-form";
import { NEWS_COMPLETENESS_FIELDS } from "@/lib/admin/news-list";
import { deleteArticle, updateArticleAndTransition } from "../../actions";
import NewsForm, { type NewsFormValues } from "@/components/admin/NewsForm";
import LanguageTabs from "@/components/admin/LanguageTabs";
import SaveToast from "@/components/admin/SaveToast";
import PublishingRevisionPanel from "@/components/admin/PublishingRevisionPanel";
import { getArticleLinkPanel } from "@/lib/admin/link-opportunities";
import { addLinkOpportunity } from "@/app/[locale]/admin/(growth)/seo/links/actions";
import { REVISION_RETENTION_DAYS } from "@/lib/publishing";

/** Which workflow transition (if any) the top-right button should attempt
 *  after saving, given the article's current status and the viewer's
 *  role. submitForReview/approveAndPublish each independently re-check
 *  both regardless of what this returns — see updateArticleAndTransition's
 *  own comment in actions.ts. */
function transitionFor(contentStatus: ContentStatus, role: Role): "submitForReview" | "approveAndPublish" | null {
  if (contentStatus === ContentStatus.DRAFT && hasRole(role, Role.EDITOR)) return "submitForReview";
  if (contentStatus === ContentStatus.IN_REVIEW && hasRole(role, Role.ADMIN)) return "approveAndPublish";
  return null;
}

type Props = {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ created?: string; lang?: string }>;
};

export default async function EditArticlePage(props: Props) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const { locale, id } = params;
  // VIEWER may open this to read the article; saving or deleting stays
  // behind a disabled fieldset for anyone below EDITOR.
  const session = await requireAdmin(locale, Role.VIEWER);
  const canWrite = hasRole(session.role, Role.EDITOR);

  const lang = parseEditingLocale(searchParams.lang);

  const [t, article, categories] = await Promise.all([
    getTranslations({ locale, namespace: "admin" }),
    prisma.newsArticle.findFirst({
      where: { id, deletedAt: null },
      include: { translations: true },
    }),
    getArticleCategories(),
  ]);

  if (!article) notFound();

  const linkPanel = await getArticleLinkPanel({ id: article.id, locale: lang, publicPath: `/news/${article.slug}` });

  const live = isArticleLiveNow(article);
  // TODO: a shareable, unauthenticated preview link for a still-draft
  // article, for a reviewer without an admin account.

  const completeness = translationCompleteness<any>(article.translations, "title");
  const editing = pickEditingTranslation<any>(article.translations, lang);

  // Every locale needs both a title and a body for the SEO checklist's
  // "all languages complete" row — a plain boolean, computed here because
  // the real per-locale logic (lib/admin/news-list.ts) is "server-only"
  // and NewsForm/NewsSeoPanel are not.
  const bodyComplete = translationCompleteness<any>(article.translations, "content");
  const languageComplete = locales.every((code) => completeness[code] && bodyComplete[code]);

  const completenessPercent = translationCompletenessPercent<any>(article.translations, NEWS_COMPLETENESS_FIELDS);

  // The top-right button's label and what it attempts on submit — see
  // transitionFor() above and updateArticleAndTransition in actions.ts.
  // IN_REVIEW + below-ADMIN keeps the plain "update" wording (they can't
  // publish) but the button still always saves; the pill next to it is
  // what tells them why it isn't offering to publish.
  const transition = transitionFor(article.contentStatus, session.role);
  const workflowLabel =
    article.contentStatus === ContentStatus.DRAFT
      ? t("publishing.actions.submit")
      : article.contentStatus === ContentStatus.IN_REVIEW && hasRole(session.role, Role.ADMIN)
        ? t("news.workflow.publish")
        : t("news.workflow.updateArticle");
  const statusPillLabel = article.contentStatus === ContentStatus.IN_REVIEW ? t("news.statusInReview") : null;

  const values: NewsFormValues = {
    slug: article.slug,
    title: editing?.title ?? "",
    excerpt: editing?.excerpt ?? "",
    content: editing?.content ?? "",
    contentFormat: article.contentFormat,
    coverImageUrl: article.coverImageUrl ?? "",
    ogImageUrl: article.ogImageUrl ?? "",
    category: article.category ?? "",
    // The form edits tags as a comma-separated list.
    tags: article.tags.join(", "),
    metaTitle: editing?.metaTitle ?? "",
    metaDescription: editing?.metaDescription ?? "",
    focusKeyword: editing?.focusKeyword ?? "",
    noIndex: editing?.noIndex ?? false,
    isPublished: article.isPublished,
    publishedAt: toDateTimeLocal(article.publishedAt),
    schemaType: article.schemaType ?? "NewsArticle",
    canonicalUrl: article.canonicalUrl ?? "",
    secondaryKeywords: article.secondaryKeywords.join(", "),
  };

  return (
    <div className="space-y-8">
      {searchParams.created && (
        <SaveToast tone="success" token="created">
          <CheckCircle2 size={16} aria-hidden />
          {t("common.saved")}
        </SaveToast>
      )}

      {/* Same panel /admin/publishing shows in its review queue — see the
          file comment on PublishingRevisionPanel for why this is "compare
          + history", not a second preview renderer. */}
      <PublishingRevisionPanel
        locale={locale}
        type="NEWS_ARTICLE"
        id={article.id}
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
        historyModal={{ label: t("publishing.revision.fullHistoryButton"), retentionDays: REVISION_RETENTION_DAYS }}
      />

      <LanguageTabs
        active={lang}
        completeness={completeness}
        completeLabel={t("common.translationComplete")}
        missingLabel={t("common.translationMissing")}
        percent={completenessPercent}
      />

      <fieldset disabled={!canWrite} className="contents">
        <NewsForm
          key={lang}
          locale={locale}
          lang={lang}
          role={session.role}
          action={updateArticleAndTransition.bind(null, locale, article.id, transition)}
          values={values}
          onDelete={deleteArticle.bind(null, locale, article.id)}
          categories={categories}
          submitLabel={workflowLabel}
          languageComplete={languageComplete}
          linkPanel={linkPanel}
          addLinkAction={addLinkOpportunity}
          headerTitle={t("news.editTitle")}
          backHref={`/${locale}/admin/news`}
          backLabel={t("news.title")}
          live={live ? { href: `/${locale}/news/${article.slug}`, path: `/news/${article.slug}` } : null}
          statusPillLabel={statusPillLabel}
          articleId={article.id}
          serverUpdatedAt={article.updatedAt.toISOString()}
        />
      </fieldset>
    </div>
  );
}
