/** House-code sign-in: for when the card is not at hand. Leads to /verify. */
import { setRequestLocale, getTranslations } from "next-intl/server";
import { clubBase } from "@/lib/club/paths";
import { homeHref } from "@/lib/club/portal-actions-helpers";
import CodeForm from "@/components/club/CodeForm";
import { OfflineNotice, PageTop } from "@/components/club/PortalChrome";

export default async function HouseCodePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const base = await clubBase(locale);
  const t = await getTranslations({ locale, namespace: "club" });

  return (
    <main className="px-6 pb-10">
      <PageTop backHref={homeHref(base)} backLabel={t("common.back")} title={t("code.title")} sub={t("code.lead")} />
      <OfflineNotice locale={locale} variant="auth" />
      <CodeForm
        locale={locale}
        labels={{
          label: t("code.label"),
          next: t("code.next"),
          format: t("code.format"),
          notFound: t.raw("code.notFound") as string,
          locked: t("code.locked"),
        }}
      />
    </main>
  );
}
