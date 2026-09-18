/**
 * app/[locale]/(site)/e-brochure/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The brochure catalogue.
 *
 * Cards link to the viewer rather than to the PDF: a visitor who wanted
 * the file can download it from inside, and one who did not gets to read
 * it without a 30MB download and a PDF reader.
 *
 * Reached from the footer (siteConfig.nav.secondary) rather than the
 * header, which is already at seven items — see the note beside that list.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { Metadata } from "next";
import Link from "next/link";
import ImageWithSkeleton from "@/components/ImageWithSkeleton";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowRight, BookOpen } from "lucide-react";
import Reveal from "@/components/Reveal";
import DbOfflineNotice from "@/components/DbOfflineNotice";
import { siteConfig } from "@/config/site";
import { locales } from "@/i18n";
import { localizedAlternates, breadcrumbList, trailFor } from "@/lib/seo";
import Breadcrumb from "@/components/Breadcrumb";
import JsonLd from "@/components/JsonLd";
import { getPublishedBrochures } from "@/lib/brochures";
import { isDatabaseOffline } from "@/lib/db";

// An hour, like the other catalogues. Publishing calls revalidatePath, so
// this is the backstop rather than the mechanism.
export const revalidate = 3600;

type Props = { params: Promise<{ locale: string }> };

export async function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params;
  const { locale } = params;

  const t = await getTranslations({ locale, namespace: "eBrochure" });

  return {
    title: t("title"),
    description: t("metaDescription"),
    alternates: localizedAlternates(locale, "/e-brochure"),
  };
}

export default async function EBrochureIndexPage(props: Props) {
  const params = await props.params;
  const { locale } = params;

  setRequestLocale(locale);

  const [t, tNav, brochures] = await Promise.all([
    getTranslations({ locale, namespace: "eBrochure" }),
    getTranslations("nav"),
    getPublishedBrochures(locale),
  ]);

  // One array for the trail a visitor reads and the one Google reads.
  const trail = trailFor(locale, [
    { name: tNav("home"), path: "" },
    { name: tNav("eBrochure"), path: "/e-brochure" },
  ]);

  return (
    <>
      <JsonLd
        id="breadcrumb-schema"
        data={breadcrumbList(trail)}
      />
      <section className="container-luxe pb-4 pt-28 sm:pt-36">
        <Reveal>
          <Breadcrumb items={trail} className="mb-5" />

          <p className="eyebrow">{t("eyebrow")}</p>
          <h1 className="mt-3 max-w-2xl text-4xl font-light text-primary sm:text-5xl">
            {t("title")}
          </h1>
          <p className="mt-6 max-w-lg text-sm leading-relaxed text-ink/70 sm:text-base">
            {t("subtitle")}
          </p>
        </Reveal>
      </section>

      <section className="container-luxe py-14 sm:py-20">
        {isDatabaseOffline() && <DbOfflineNotice />}

        {brochures.length === 0 ? (
          <p className="border border-dashed border-primary/15 bg-white/50 p-12 text-center text-sm text-ink/65">
            {t("empty")}
          </p>
        ) : (
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {brochures.map((brochure, index) => (
              <Reveal key={brochure.id} delay={(index % 6) * 0.07}>
                <Link
                  href={`/${locale}/e-brochure/${brochure.slug}`}
                  className="group block"
                >
                  <div className="relative aspect-3/4 w-full overflow-hidden rounded-xs bg-primary-900/6 shadow-card">
                    {brochure.coverImageUrl ? (
                      <ImageWithSkeleton
                        src={brochure.coverImageUrl}
                        alt=""
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        className="object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                      />
                    ) : (
                      /*
                        No cover uploaded. An icon tile rather than a stock
                        photograph — the same choice AwardsSection makes for
                        a missing trophy image, and the reason nothing in
                        app/ references an external photo host.
                      */
                      <div className="flex h-full w-full items-center justify-center text-primary/25">
                        <BookOpen size={48} strokeWidth={1} aria-hidden />
                      </div>
                    )}
                  </div>

                  <div className="mt-4">
                    {brochure.projectName && (
                      <p className="text-xs uppercase tracking-wide text-accent-700">
                        {brochure.projectName}
                      </p>
                    )}

                    <h2 className="mt-1.5 text-lg font-light text-primary">
                      {brochure.title}
                    </h2>

                    {brochure.description && (
                      <p className="mt-2 text-sm leading-relaxed text-ink/70">
                        {brochure.description}
                      </p>
                    )}

                    <span className="mt-3 inline-flex items-center gap-1.5 text-sm text-accent-700 transition-colors group-hover:text-accent-800">
                      {t("open")}
                      <ArrowRight size={15} aria-hidden />
                    </span>
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
