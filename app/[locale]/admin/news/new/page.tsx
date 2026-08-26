import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/admin/guard";
import { getArticleCategories } from "@/lib/news";
import { parseEditingLocale } from "@/lib/admin/translated-form";
import { createArticle } from "../actions";
import NewsForm from "@/components/admin/NewsForm";
import LanguageTabs from "@/components/admin/LanguageTabs";

type Props = { params: { locale: string }; searchParams: { lang?: string } };

export default async function NewArticlePage({ params: { locale }, searchParams }: Props) {
  await requireAdmin(locale);

  const [t, categories] = await Promise.all([
    getTranslations({ locale, namespace: "admin" }),
    getArticleCategories(),
  ]);
  const lang = parseEditingLocale(searchParams.lang);

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
          {t("news.newTitle")}
        </h1>
      </header>

      <LanguageTabs
        active={lang}
        completeness={{ en: false, th: false, zh: false, ru: false }}
        completeLabel={t("common.translationComplete")}
        missingLabel={t("common.translationMissing")}
      />

      <NewsForm
        key={lang}
        locale={locale}
        lang={lang}
        action={createArticle.bind(null, locale)}
        categories={categories}
        submitLabel={t("common.create")}
      />
    </div>
  );
}
