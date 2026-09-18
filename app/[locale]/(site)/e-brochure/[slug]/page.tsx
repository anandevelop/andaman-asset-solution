/**
 * app/[locale]/(site)/e-brochure/[slug]/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * One brochure, read in the browser.
 *
 * A Server Component. The viewer below it has to be a Client Component —
 * it drives pdf.js and a canvas — and reads its own strings through
 * next-intl's client provider rather than taking them as props; see its
 * header for why passing them down did not survive first contact.
 *
 * The <noscript> block is not decoration: a visitor with JavaScript off
 * gets the title, the description and a working download link rather than
 * an empty page.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { redirectIfMoved } from "@/lib/redirects";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { FileDown } from "lucide-react";
import EBrochureViewer from "@/components/EBrochureViewer";
import { localizedAlternates, breadcrumbList, trailFor } from "@/lib/seo";
import Breadcrumb from "@/components/Breadcrumb";
import JsonLd from "@/components/JsonLd";
import { siteConfig } from "@/config/site";
import { getBrochureBySlug, getPublishedBrochureSlugs } from "@/lib/brochures";
import { DatabaseUnavailableError, isDatabaseOffline } from "@/lib/db";

export const revalidate = 3600;

// Prerender published slugs; an unknown one is resolved on demand and
// notFound()-ed if it is not published.
export const dynamicParams = true;

type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateStaticParams() {
  const slugs = await getPublishedBrochureSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params;
  const { locale, slug } = params;

  const brochure = await getBrochureBySlug(slug, locale);

  if (!brochure) return { title: "Not found", robots: { index: false } };

  return {
    title: brochure.title,
    description: brochure.description ?? undefined,
    alternates: localizedAlternates(locale, `/e-brochure/${brochure.slug}`),
    openGraph: {
      title: brochure.title,
      description: brochure.description ?? undefined,
      type: "article",
      // No `images` here: opengraph-image.tsx in this same folder
      // generates the card (title, cover photo) and, per Next's
      // file-convention precedence, replaces whatever this field would
      // have set anyway.
    },
  };
}

export default async function EBrochurePage(props: Props) {
  const params = await props.params;
  const { locale, slug } = params;

  setRequestLocale(locale);

  const brochure = await getBrochureBySlug(slug, locale);

  if (!brochure) {
    // A missing record and an unreachable database look identical here.
    // Only the former is a real 404 — the latter must not be cached as one.
    if (isDatabaseOffline()) throw new DatabaseUnavailableError(`e-brochure/${slug}`);
    await redirectIfMoved(locale, `/e-brochure/${slug}`);
    notFound();
  }

  const [t, tNav] = await Promise.all([
    getTranslations({ locale, namespace: "eBrochure" }),
    getTranslations("nav"),
  ]);
  const url = `${siteConfig.url}/${locale}/e-brochure/${brochure.slug}`;

  // One array for the trail a visitor reads and the one Google reads.
  const trail = trailFor(locale, [
    { name: tNav("home"), path: "" },
    { name: tNav("eBrochure"), path: "/e-brochure" },
    { name: brochure.title, path: `/e-brochure/${brochure.slug}` },
  ]);

  return (
    <>
      <JsonLd
        id="breadcrumb-schema"
        data={breadcrumbList(trail)}
      />
      <section className="container-luxe pb-6 pt-28 sm:pt-36">
        {/* The trail's middle crumb goes where the back arrow used to.
            ink/55 on the trail's own links, not the ink/60 that failed
            WCAG AA here — see the contrast table in docs/TESTING.md and
            the axe scan in e2e/e-brochure.spec.ts that caught it. */}
        <Breadcrumb items={trail} />

        {brochure.projectName && (
          <p className="eyebrow mt-6">{brochure.projectName}</p>
        )}

        <h1 className="mt-3 max-w-2xl text-3xl font-light text-primary sm:text-4xl">
          {brochure.title}
        </h1>

        {brochure.description && (
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-ink/70">
            {brochure.description}
          </p>
        )}
      </section>

      <noscript>
        <div className="container-luxe pb-10">
          <p className="text-sm leading-relaxed text-ink/70">{t("noJs")}</p>
          <a
            href={brochure.fileUrl}
            download
            className="mt-4 inline-flex items-center gap-2 rounded-xs border border-primary/15 bg-white px-4 py-2 text-sm font-medium text-primary"
          >
            <FileDown size={16} aria-hidden />
            {t("download")}
          </a>
        </div>
      </noscript>

      <section className="container-luxe pb-20">
        {/* The viewer reads its own strings from next-intl — see its
            header for why they are not passed down from here. */}
        <EBrochureViewer fileUrl={brochure.fileUrl} />
      </section>
    </>
  );
}
