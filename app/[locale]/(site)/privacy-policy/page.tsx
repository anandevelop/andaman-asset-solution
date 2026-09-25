import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ShieldCheck } from "lucide-react";
import { siteConfig } from "@/config/site";
import { locales } from "@/i18n";
import { breadcrumbList, localizedAlternates, trailFor } from "@/lib/seo";
import JsonLd from "@/components/JsonLd";
import Breadcrumb from "@/components/Breadcrumb";
import LegalPolicyPage from "@/components/LegalPolicyPage";
import { getPrivacyPolicy } from "@/content/privacy-policy";
import { intlLocale } from "@/lib/format";
import { robotsMetadata } from "@/lib/indexing";

type Props = { params: Promise<{ locale: string }> };

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params;

  const {
    locale
  } = params;

  const policy = getPrivacyPolicy(locale);

  return {
    title: policy.title,
    description: policy.intro[0].slice(0, 160),
    alternates: localizedAlternates(locale, siteConfig.legal.privacyPolicyPath),
    robots: robotsMetadata({ index: true }),
  };
}

export default async function PrivacyPolicyPage(props: Props) {
  const params = await props.params;

  const {
    locale
  } = params;

  setRequestLocale(locale);

  const policy = getPrivacyPolicy(locale);

  const effectiveDate = new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(policy.effectiveDate));

  const [tNav, tFooter, tLegal] = await Promise.all([
    getTranslations("nav"),
    getTranslations("footer"),
    getTranslations("legalPage"),
  ]);

  /*
    One array for the trail a visitor reads and the one Google reads. This
    page had neither before — the legal pages were the two the breadcrumb
    work skipped, and the crumb's own name comes from the footer, which is
    the only place either page is linked from.
  */
  const trail = trailFor(locale, [
    { name: tNav("home"), path: "" },
    { name: tFooter("privacyPolicy"), path: "/privacy-policy" },
  ]);

  return (
    <>
      <JsonLd id="breadcrumb-schema" data={breadcrumbList(trail)} />

      {/* print:pt-0: the normal top padding exists only to clear the fixed
          Navbar, which (site)/layout.tsx hides for print. */}
      <article className="container-luxe max-w-6xl pb-24 pt-28 sm:pt-36 print:pb-0 print:pt-0">
        <Breadcrumb items={trail} className="mb-5 print:hidden" />

        <LegalPolicyPage
          locale={locale}
          eyebrowIcon={<ShieldCheck size={14} />}
          eyebrowLabel="PDPA"
          content={policy}
          effectiveDateFormatted={effectiveDate}
          strings={{
            tableOfContents: tLegal("tableOfContents"),
            downloadPdf: tLegal("downloadPdf"),
            print: tLegal("print"),
            needHelp: tLegal("needHelp"),
            needHelpBody: tLegal("needHelpBody"),
            contactCta: tLegal("contactCta"),
          }}
        />
      </article>
    </>
  );
}
