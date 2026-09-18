import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, CheckCircle2, ExternalLink } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin/guard";
import { getArticleCategories } from "@/lib/news";
import { toDateTimeLocal } from "@/lib/format";
import {
  parseEditingLocale,
  pickEditingTranslation,
  translationCompleteness,
} from "@/lib/admin/translated-form";
import { deleteArticle, updateArticle } from "../../actions";
import NewsForm, { type NewsFormValues } from "@/components/admin/NewsForm";
import LanguageTabs from "@/components/admin/LanguageTabs";
import SaveToast from "@/components/admin/SaveToast";

type Props = {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ created?: string; lang?: string }>;
};

export default async function EditArticlePage(props: Props) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const { locale, id } = params;
  await requireAdmin(locale);

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

  const live =
    article.isPublished &&
    article.publishedAt !== null &&
    article.publishedAt <= new Date();

  const completeness = translationCompleteness<any>(article.translations, "title");
  const editing = pickEditingTranslation<any>(article.translations, lang);

  const values: NewsFormValues = {
    slug: article.slug,
    title: editing?.title ?? "",
    excerpt: editing?.excerpt ?? "",
    content: editing?.content ?? "",
    coverImageUrl: article.coverImageUrl ?? "",
    category: article.category ?? "",
    // The form edits tags as a comma-separated list.
    tags: article.tags.join(", "),
    metaTitle: editing?.metaTitle ?? "",
    metaDescription: editing?.metaDescription ?? "",
    isPublished: article.isPublished,
    publishedAt: toDateTimeLocal(article.publishedAt),
  };

  return (
    <div className="space-y-8">
      <header>
        <Link
          href={`/${locale}/admin/news`}
          className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-primary"
        >
          <ArrowLeft size={14} aria-hidden />
          {t("news.title")}
        </Link>

        <h1 className="mt-3 text-2xl font-semibold text-primary sm:text-3xl">
          {t("news.editTitle")}
        </h1>

        {live && (
          <Link
            href={`/${locale}/news/${article.slug}`}
            target="_blank"
            className="mt-3 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-primary"
          >
            <ExternalLink size={14} aria-hidden />
            /news/{article.slug}
          </Link>
        )}
      </header>

      {searchParams.created && (
        <SaveToast tone="success" token="created">
          <CheckCircle2 size={16} aria-hidden />
          {t("common.saved")}
        </SaveToast>
      )}

      <LanguageTabs
        active={lang}
        completeness={completeness}
        completeLabel={t("common.translationComplete")}
        missingLabel={t("common.translationMissing")}
      />

      <NewsForm
        key={lang}
        locale={locale}
        lang={lang}
        action={updateArticle.bind(null, locale, article.id)}
        values={values}
        onDelete={deleteArticle.bind(null, locale, article.id)}
        categories={categories}
        submitLabel={t("common.save")}
      />
    </div>
  );
}
