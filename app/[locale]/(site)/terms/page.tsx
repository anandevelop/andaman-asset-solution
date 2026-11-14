import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { FileText } from "lucide-react";
import { siteConfig } from "@/config/site";
import { breadcrumbList, localizedAlternates, trailFor } from "@/lib/seo";
import { pageOpenGraph } from "@/lib/page-open-graph";
import JsonLd from "@/components/JsonLd";
import Breadcrumb from "@/components/Breadcrumb";
import LegalPolicyPage from "@/components/LegalPolicyPage";
import { getTermsOfService } from "@/content/terms";
import { intlLocale } from "@/lib/format";
import { metaDescription } from "@/lib/markdown-text";
import { robotsMetadata } from "@/lib/indexing";
import { withCopyOverrides } from "@/lib/site-copy";
import { getSiteSettings } from "@/lib/settings";

type Props = { params: Promise<{ locale: string }> };

/*
  Cached for an hour and rendered on the first request, never at build.

  The policy text is in the repository, but the header and footer around it
  are not: phone, address and tagline come from the database. The Docker
  build has none, so a prerendered copy carried config/site.ts's defaults —
  an old phone number and address — and every deploy shipped it again, to
  be served to the first visitor before the background refresh replaced it.
  `[]` registers the route for ISR without prerendering any path; see the
  note in app/[locale]/layout.tsx.
*/
export const revalidate = 3600;

export function generateStaticParams() {
  return [];
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params;

  const {
    locale
  } = params;

  const terms = await withCopyOverrides("terms", getTermsOfService(locale), locale);

  return {
    title: terms.title,
    // Whole sentences where they fit: slice(0, 160) ended the English
    // snippet mid-sentence on "…disclose and retain your".
    description: metaDescription(terms.intro[0]),
    alternates: localizedAlternates(locale, siteConfig.legal.termsPath),
    openGraph: await pageOpenGraph(locale, siteConfig.legal.termsPath),
    robots: robotsMetadata({ index: true }),
  };
}

export default async function TermsOfServicePage(props: Props) {
  const params = await props.params;

  const {
    locale
  } = params;

  setRequestLocale(locale);

  const terms = await withCopyOverrides("terms", getTermsOfService(locale), locale);

  const effectiveDate = new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(terms.effectiveDate));

  const [tNav, tFooter, tLegal, { contact }] = await Promise.all([
    getTranslations("nav"),
    getTranslations("footer"),
    getTranslations("legalPage"),
    getSiteSettings(),
  ]);

  /*
    One array for the trail a visitor reads and the one Google reads. This
    page had neither before — the legal pages were the two the breadcrumb
    work skipped, and the crumb's own name comes from the footer, which is
    the only place either page is linked from.
  */
  const trail = trailFor(locale, [
    { name: tNav("home"), path: "" },
    { name: tFooter("terms"), path: "/terms" },
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
          eyebrowIcon={<FileText size={14} />}
          eyebrowLabel={tLegal("eyebrow")}
          content={terms}
          contact={contact}
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
