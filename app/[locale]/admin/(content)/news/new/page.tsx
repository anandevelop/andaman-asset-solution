import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/admin/guard";
import { getArticleCategories } from "@/lib/news";
import { parseEditingLocale } from "@/lib/admin/translated-form";
import { createArticle } from "../actions";
import NewsForm from "@/components/admin/NewsForm";
import LanguageTabs from "@/components/admin/LanguageTabs";
import { addLinkOpportunity } from "@/app/[locale]/admin/(growth)/seo/links/actions";
import type { ArticleLinkPanel } from "@/lib/admin/link-opportunities";

/** A brand-new, unsaved article has no id to compute opportunities/inbound
 *  links/external statuses from — see NewsForm's own comment on why this
 *  prop is required rather than optional. */
const EMPTY_LINK_PANEL: ArticleLinkPanel = { opportunities: [], inboundLinks: [], externalStatuses: {} };

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ lang?: string }> };

export default async function NewArticlePage(props: Props) {
  const searchParams = await props.searchParams;
  const params = await props.params;

  const {
    locale
  } = params;

  const session = await requireAdmin(locale);

  const [t, categories] = await Promise.all([
    getTranslations({ locale, namespace: "admin" }),
    getArticleCategories(),
  ]);
  const lang = parseEditingLocale(searchParams.lang);

  return (
    <div className="space-y-8">
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
        role={session.role}
        action={createArticle.bind(null, locale)}
        categories={categories}
        submitLabel={t("common.create")}
        languageComplete={false}
        linkPanel={EMPTY_LINK_PANEL}
        addLinkAction={addLinkOpportunity}
        headerTitle={t("news.newTitle")}
        backHref={`/${locale}/admin/news`}
        backLabel={t("news.title")}
      />
    </div>
  );
}
