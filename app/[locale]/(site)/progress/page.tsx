/**
 * app/[locale]/(site)/progress/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Construction progress index.
 *
 * siteConfig.nav.main has linked here since Phase 1 with nothing behind it,
 * so this closes a 404 in the primary navigation.
 *
 * It is a directory, not a gallery: the month-by-month photographs live on
 * each project's own page, where they sit next to the specification a
 * viewer needs to read them. Duplicating the galleries here would split the
 * same content across two URLs competing for the same search terms.
 *
 * The published-monthly promise on the homepage is only credible if it is
 * verifiable in one place. This is that place.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { Metadata } from "next";
import ImageWithSkeleton from "@/components/ImageWithSkeleton";
import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowRight, Camera, HardHat, MapPin } from "lucide-react";
import Reveal from "@/components/Reveal";
import DbOfflineNotice from "@/components/DbOfflineNotice";
import { siteConfig } from "@/config/site";
import { localizedAlternates, breadcrumbList, trailFor } from "@/lib/seo";
import Breadcrumb from "@/components/Breadcrumb";
import JsonLd from "@/components/JsonLd";
import { getProjectsWithProgress } from "@/lib/projects";
import { isDatabaseOffline } from "@/lib/db";
import { formatMonthYear } from "@/lib/format";

// Shorter than the marketing pages: a new month of photographs should
// appear without waiting out a long cache.
export const revalidate = 300;

type Props = { params: Promise<{ locale: string }> };

// Nothing is prerendered at build (see app/[locale]/layout.tsx). The empty
// array — rather than no function at all — is what keeps this route
// ISR-cached: with none, Next renders it on every request.
export function generateStaticParams() {
  return [];
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params;

  const {
    locale
  } = params;

  const t = await getTranslations({ locale, namespace: "progress" });

  return {
    title: t("title"),
    description: t("subtitle"),
    alternates: localizedAlternates(locale, "/progress"),
  };
}

export default async function ProgressIndexPage(props: Props) {
  const params = await props.params;

  const {
    locale
  } = params;

  setRequestLocale(locale);

  const [t, tProjects, tNav, projects] = await Promise.all([
    getTranslations("progress"),
    getTranslations("projects"),
    getTranslations("nav"),
    getProjectsWithProgress(locale),
  ]);

  // One array for the trail a visitor reads and the one Google reads.
  const trail = trailFor(locale, [
    { name: tNav("home"), path: "" },
    { name: tNav("progress"), path: "/progress" },
  ]);

  return (
    <>
      <JsonLd
        id="breadcrumb-schema"
        data={breadcrumbList(trail)}
      />
      {/* ── Header ───────────────────────────────────────────────────── */}
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

      {/* ── Projects ─────────────────────────────────────────────────── */}
      <section className="container-luxe py-14 sm:py-20">
        {isDatabaseOffline() && <DbOfflineNotice />}

        {projects.length === 0 ? (
          <div className="border border-dashed border-primary/15 bg-white/50 p-12 text-center">
            <HardHat size={26} strokeWidth={1.5} className="mx-auto text-ink/30" aria-hidden />
            <p className="mt-3 text-sm text-ink/65">{t("empty")}</p>
            <Link
              href={`/${locale}/projects`}
              className="mt-5 inline-block text-xs font-medium uppercase tracking-wide text-accent-700 hover:text-accent-800"
            >
              {t("emptyCta")}
            </Link>
          </div>
        ) : (
          <div className="space-y-8">
            {projects.map((project, index) => (
              <Reveal key={project.id} delay={index * 0.08}>
                <Link
                  href={`/${locale}/projects/${project.slug}#progress`}
                  className="group grid overflow-hidden rounded-xs border border-primary/10 bg-white shadow-card transition-shadow hover:shadow-lg sm:grid-cols-[42%_1fr] sm:items-center"
                >
                  {/* A fixed 16:9 at every breakpoint, not just a box that
                      happened to be 4:3 on a phone and then stretched to
                      whatever height the text column dictated on desktop
                      (sm:aspect-auto sm:h-full, the previous rule) — that
                      let a short "no update yet" card squash this into a
                      narrow, cropped-looking strip. A true aspect ratio
                      plus sm:items-center on the row keeps the image its
                      own natural height instead of stretching to match. */}
                  <div className="relative aspect-video w-full overflow-hidden bg-primary/5">
                    {(project.latest?.image ?? project.heroImageUrl) && (
                      <ImageWithSkeleton
                        src={(project.latest?.image ?? project.heroImageUrl)!}
                        alt={project.name}
                        fill
                        sizes="(max-width: 640px) 100vw, 42vw"
                        className="object-cover transition-transform duration-700 group-hover:scale-105"
                      />
                    )}
                  </div>

                  <div className="flex flex-col justify-center p-6 sm:p-8">
                    <p className="flex items-center gap-1.5 text-xs text-ink/65">
                      <MapPin size={12} aria-hidden /> {project.location}
                    </p>

                    <h2 className="mt-2 text-xl font-light text-primary sm:text-2xl">
                      {project.name}
                    </h2>

                    <p className="mt-1.5 text-xs uppercase tracking-wide text-accent-700">
                      {tProjects(`status.${project.status}` as never)}
                    </p>

                    {project.latest && (
                      <div className="mt-5 border-t border-primary/10 pt-5">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-ink/65">
                          {t("latestUpdate")}
                        </p>
                        <p className="mt-1 text-sm font-medium text-primary">
                          {formatMonthYear(locale, project.latest.year, project.latest.month)}
                        </p>
                        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-ink/65">
                          <Camera size={12} aria-hidden />
                          {t("updateCount", { count: project.updateCount })}
                        </p>
                      </div>
                    )}

                    <span className="mt-6 inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-accent-700">
                      {t("viewGallery")}
                      <ArrowRight
                        size={14}
                        className="transition-transform group-hover:translate-x-1"
                        aria-hidden
                      />
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
