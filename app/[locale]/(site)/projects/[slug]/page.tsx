import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getTranslations, unstable_setRequestLocale } from "next-intl/server";
import { ChevronDown, FileDown, MapPin, Navigation } from "lucide-react";
import Reveal from "@/components/Reveal";
import StatBar from "@/components/StatBar";
import SitePlanMap from "@/components/SitePlanMap";
import ProgressGallery from "@/components/ProgressGallery";
import LeadForm from "@/components/LeadForm";
import JsonLd from "@/components/JsonLd";
import FaqAccordion from "@/components/FaqAccordion";
import FacilityCard from "@/components/FacilityCard";
import FacilityScroller from "@/components/FacilityScroller";
import ProjectGallery from "@/components/ProjectGallery";
import FloorPlanViewer from "@/components/FloorPlanViewer";
import { getFaqs } from "@/lib/faqs";
import { getAwards } from "@/lib/awards";
import { getSiteSettings } from "@/lib/settings";
import { siteConfig } from "@/config/site";
import { locales } from "@/i18n";
import {
  getProjectBySlug,
  getProjectProgress,
  getPublishedProjectSlugs,
  getUnitTypesForProject,
  getProjectUnits,
  getNearbyAttractions,
  getProjectFacilities,
} from "@/lib/projects";
import { isDatabaseOffline, DatabaseUnavailableError } from "@/lib/db";
import { formatNumber } from "@/lib/format";
import { resolveMapEmbedSrc } from "@/lib/google-maps";

// Prerender published slugs; unknown slugs are resolved on demand and
// notFound()-ed if they aren't published.
export const dynamicParams = true;

/*
  One hour.

  Project detail pages change rarely — a spec update or a new gallery
  image, a few times a year — and the admin calls revalidatePath the moment
  either happens, so this window only matters as a backstop for edits made
  outside the app. Serving from cache for an hour is the difference between
  a database round trip per visitor and none.

  The construction gallery below is the one part that ages, and it is
  published monthly.
*/
export const revalidate = 3600;

/** The year the company started in Phuket — same figure the "years" stat
 *  on /about is built from (FOUNDED_YEAR there); duplicated here rather
 *  than shared from a lib module since it's one constant and this page's
 *  brief was scoped to this file only. */
const FOUNDED_YEAR = 2019;

/** Site Plan + Unit Status legend/chip styling, keyed by the UnitStatus enum. */
const UNIT_STATUS_STYLE: Record<string, string> = {
  AVAILABLE: "bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200",
  RESERVED: "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200",
  SOLD: "bg-ink/5 text-ink/40 ring-1 ring-inset ring-ink/10",
};
const UNIT_STATUS_DOT: Record<string, string> = {
  AVAILABLE: "bg-emerald-500",
  RESERVED: "bg-amber-500",
  SOLD: "bg-ink/30",
};

type Props = { params: { locale: string; slug: string } };

export async function generateStaticParams() {
  const slugs = await getPublishedProjectSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params: { locale, slug },
}: Props): Promise<Metadata> {
  const project = await getProjectBySlug(slug, locale);
  if (!project) return { title: "Not found", robots: { index: false } };

  const title = project.metaTitle || `${project.name} — ${project.location}`;
  const description = project.metaDescription || project.tagline;

  return {
    title,
    description,
    alternates: {
      canonical: `${siteConfig.url}/${locale}/projects/${project.slug}`,
      languages: Object.fromEntries(
        locales.map((l) => [l, `${siteConfig.url}/${l}/projects/${project.slug}`]),
      ),
    },
    openGraph: {
      title,
      description,
      type: "article",
      url: `${siteConfig.url}/${locale}/projects/${project.slug}`,
      images: project.heroImageUrl ? [{ url: project.heroImageUrl }] : undefined,
    },
  };
}

export default async function ProjectPage({ params: { locale, slug } }: Props) {
  unstable_setRequestLocale(locale);

  const project = await getProjectBySlug(slug, locale);

  if (!project) {
    // A missing record and an unreachable database look identical here.
    // Only the former is a real 404 — the latter must not be cached as one.
    if (isDatabaseOffline()) throw new DatabaseUnavailableError(`projects/${slug}`);
    notFound();
  }

  const [t, progress, faqs, settings, unitTypes, units, attractionCategories, awards, facilities] =
    await Promise.all([
      getTranslations("projects"),
      getProjectProgress(project.id, locale),
      // The questions a buyer asks while looking at one development, rather
      // than the whole FAQ — the rest lives on the home page.
      getFaqs(locale, { categories: ["ownership", "payment", "construction"] }),
      getSiteSettings(),
      getUnitTypesForProject(project.id, locale),
      getProjectUnits(project.id),
      getNearbyAttractions(project.id, locale),
      // Company-wide trust signal for the lead-form mini stat row below —
      // same source as the home page Awards section, not project-specific
      // (Award has no project relation).
      getAwards(locale),
      // Photo cards for the Facilities section below — supersedes reading
      // project.facilities (the deprecated string array) directly.
      getProjectFacilities(project.id, locale),
    ]);

  // Site Plan + Unit Status groups individual plots under their type name
  // rather than a flat list of 30–60+ rows — see the section below.
  const unitsByType = units.reduce<Record<string, typeof units>>((acc, u) => {
    const key = u.unitTypeName ?? t("unitTypeLabels.unspecified");
    (acc[key] ??= []).push(u);
    return acc;
  }, {});

  const stats = [
    { label: t("specs.type"), value: t(`propertyType.${project.propertyType}` as any) },
    {
      label: t("specs.landArea"),
      value: `${formatNumber(locale, project.landAreaSqm)} ${t("units.sqm")}`,
    },
    { label: t("specs.units"), value: formatNumber(locale, project.totalUnits) },
    // Counts the new ProjectFacility rows, not the deprecated
    // project.facilities array — the number here has to match what the
    // Facilities section below actually renders.
    { label: t("specs.facilities"), value: `${facilities.length}` },
  ];

  // Small trust-signal row next to the lead form — real figures, not
  // hardcoded copy: unit count from this project, company founding year
  // (FOUNDED_YEAR, same source as /about), active award count company-wide.
  const totalUnits = project.totalUnits ?? 0;
  const miniStats = [
    totalUnits > 0 ? t("miniStats.units", { count: totalUnits }) : null,
    t("miniStats.since", { year: FOUNDED_YEAR }),
    awards.length > 0 ? t("miniStats.awards", { count: awards.length }) : null,
  ].filter((value): value is string => value !== null);

  // First gallery image no longer has a dedicated use (the Overview
  // section's aerial photo it used to feed is gone — see the Facilities
  // section comment below); the rest still drives the gallery strip.
  const [, ...villaImages] = project.gallery;
  const url = `${siteConfig.url}/${locale}/projects/${project.slug}`;

  // Hero background — VIDEO only takes effect once both the admin's
  // media-type choice AND an actual video file are present; a project
  // switched to VIDEO before uploading one just falls back to the image,
  // same defensive pattern as StoryBanner's per-slide mediaType.
  const heroIsVideo = project.heroMediaType === "VIDEO" && Boolean(project.heroVideoUrl);

  // Location & Map section, below. Two independent admin inputs feed it:
  //  - latitude/longitude, when set, drive the embedded preview directly
  //    (Google's no-API-key `output=embed` endpoint takes a coordinate
  //    pair as-is — cheapest and most precise option when available).
  //  - googleMapsUrl otherwise — resolved to an embeddable URL by
  //    resolveMapEmbedSrc (see lib/google-maps.ts for why a plain pasted
  //    share link can't just be dropped into an <iframe> src as-is).
  //  - googleMapsUrl is also what "Get Directions" opens directly (not
  //    embed-resolved — the button just needs the original link), since
  //    the admin's pasted pin/place is more precise than a directions URL
  //    built from the coordinate pair alone. Falls back to a directions
  //    URL from the coordinates, then a text search on the project's
  //    address, so the button always has somewhere to send people even
  //    for older projects that only ever had one of the two inputs.
  const hasCoords = project.latitude !== null && project.longitude !== null;
  const mapEmbedSrc = hasCoords
    ? `https://www.google.com/maps?q=${project.latitude},${project.longitude}&z=15&output=embed`
    : await resolveMapEmbedSrc(project.googleMapsUrl);
  const directionsUrl =
    project.googleMapsUrl ||
    (hasCoords
      ? `https://www.google.com/maps/dir/?api=1&destination=${project.latitude},${project.longitude}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(project.location)}`);

  return (
    <>
      {/*
        RealEstateListing extends Place, so address/geo describe the
        development itself. No `offers` block — the site doesn't publish
        prices, and an Offer without one isn't meaningful structured data.
      */}
      <JsonLd
        id="project-schema"
        data={{
          "@context": "https://schema.org",
          "@type": "RealEstateListing",
          "@id": url,
          url,
          name: project.name,
          description: project.description || project.tagline,
          inLanguage: locale === "th" ? "th-TH" : "en-US",
          datePosted: undefined,
          image: [project.heroImageUrl, ...project.gallery].filter(Boolean),
          address: {
            "@type": "PostalAddress",
            streetAddress: project.location,
            addressRegion: "Phuket",
            addressCountry: "TH",
          },
          geo:
            project.latitude !== null && project.longitude !== null
              ? {
                  "@type": "GeoCoordinates",
                  latitude: project.latitude,
                  longitude: project.longitude,
                }
              : undefined,
          numberOfAccommodationUnits: project.totalUnits ?? undefined,
          amenityFeature: project.facilities.map((key) => ({
            "@type": "LocationFeatureSpecification",
            name: t.has(`facilities.${key}` as any)
              ? t(`facilities.${key}` as any)
              : key,
            value: true,
          })),
          floorSize:
            project.landAreaSqm !== null
              ? {
                  "@type": "QuantitativeValue",
                  value: project.landAreaSqm,
                  unitCode: "MTK", // UN/CEFACT code for square metre
                }
              : undefined,
          provider: {
            "@type": "RealEstateAgent",
            name: siteConfig.legalName,
            url: siteConfig.url,
            telephone: settings.contact.phone,
            email: settings.contact.salesEmail,
          },
        }}
      />

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      {/* Background is an image OR a video — project.heroMediaType (admin
          toggle, see ProjectForm) picks which. VIDEO only actually renders
          as a video when a file has been uploaded (heroIsVideo, computed
          above); a project switched to VIDEO with nothing uploaded yet
          quietly falls back to heroImageUrl, same defensive pattern
          StoryBanner already uses per-slide. heroImageUrl doubles as the
          <video>'s poster either way, so there's no blank flash before
          the file can play.

          Content is anchored to the bottom (items-end) rather than
          vertically centered — centered was tried first to match the
          reference layout, but with a video background it sat directly
          over the middle of the footage and obscured it; bottom-anchored
          keeps the upper two-thirds of the video clear while still
          reading as "photo/video + overlapping white stat card" thanks to
          the extra bottom clearance (pb-28/36), which is what keeps this
          text block from colliding with the stat card pulled up onto the
          hero's bottom edge by that section's own negative margin below. */}
      <section className="relative flex h-[78vh] min-h-[560px] w-full items-end overflow-hidden sm:h-[88vh]">
        {heroIsVideo ? (
          <video
            className="absolute inset-0 h-full w-full object-cover"
            src={project.heroVideoUrl!}
            poster={project.heroImageUrl ?? undefined}
            autoPlay
            muted
            loop
            playsInline
          />
        ) : (
          project.heroImageUrl && (
            <Image
              src={project.heroImageUrl}
              alt={`${project.name} — ${project.location}`}
              fill
              priority
              sizes="100vw"
              className="object-cover"
            />
          )
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-primary-900/85 via-primary-900/20 to-primary-900/10" />

        <div className="container-luxe relative z-10 flex flex-col items-center pb-28 text-center text-white sm:pb-36">
          <Reveal>
            {/* Location strings run long (e.g. "Laguna Area (Ban
                Don-Cherngtalay, Phuket)") — the shared .eyebrow class's
                text-xs + very wide tracking-widest2 letter-spacing was
                sized for short one-word eyebrows elsewhere on the site, so
                on a narrow mobile screen this line wrapped into a cramped,
                unevenly-spaced two-liner. Smaller size + tighter tracking
                below sm: only affects this instance, not the shared class. */}
            <p className="eyebrow flex items-center justify-center gap-1.5 text-center text-[10px] tracking-wide text-accent-200 sm:gap-2 sm:text-sm sm:tracking-widest2">
              <MapPin size={13} className="shrink-0 sm:hidden" aria-hidden />
              <MapPin size={14} className="hidden shrink-0 sm:block" aria-hidden />
              {project.location}
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <h1 className="mt-3 max-w-2xl text-white text-4xl font-light leading-[1.05] sm:text-6xl">
              {project.name}
            </h1>
          </Reveal>
          <Reveal delay={0.2}>
            <p className="mt-4 max-w-md text-sm text-white/80 sm:text-base">
              {project.tagline}
            </p>
          </Reveal>
          <Reveal delay={0.3}>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <a
                href="#enquire"
                className="rounded-full border border-white/70 px-7 py-3 text-sm font-medium uppercase tracking-wide text-white transition-colors hover:bg-white hover:text-primary"
              >
                {t("formTitle")}
              </a>

              {/*
                A brochure download is a lower-commitment action than the
                enquiry form, so it sits beside it rather than replacing it.
                No gate: asking for an email before a PDF costs more leads
                than it captures when the same page already has a form.

                `download` is advisory — the real behaviour comes from the
                Content-Disposition header set on upload in lib/s3.ts.
              */}
              {project.brochureUrl && (
                <a
                  href={project.brochureUrl}
                  download
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-full px-4 py-3 text-sm font-medium text-white/85 underline-offset-4 transition-colors hover:text-white hover:underline"
                >
                  <FileDown size={16} aria-hidden />
                  {t("downloadBrochure")}
                </a>
              )}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Stat bar (overlaps the Hero's bottom edge) ──────────────────
          Pulled up on top of the photo/video by the negative top margin,
          same trick this section used lower down the page before — moved
          up here and restyled to StatBar's "elevated" tone (rounded,
          shadowed, icons) to read as the reference layout's white card
          rather than a plain content-width strip. */}
      <section className="container-luxe -mt-14 relative z-10 sm:-mt-16">
        <Reveal>
          <StatBar stats={stats} tone="elevated" />
        </Reveal>
      </section>

      {/* ── Concept Design (Sale Kit narrative) ──────────────────────────
          Image left / text right when a conceptDesignImageUrl is set —
          same split-layout pattern as the Overview section below (Reveal +
          aspect-[4/5] image + horizon-divider). Falls back to the original
          full-width text block when there's no image, so a project seeded
          before this field existed still renders without a layout gap. ── */}
      {project.conceptDesign && (
        <section className="container-luxe py-20 sm:py-28">
          {project.conceptDesignImageUrl ? (
            <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
              <Reveal>
                <div className="relative aspect-[4/5] w-full overflow-hidden rounded-sm shadow-card sm:aspect-[5/6]">
                  <Image
                    src={project.conceptDesignImageUrl}
                    alt={`${project.name} — ${t("conceptDesignTitle")}`}
                    fill
                    sizes="(max-width: 1024px) 100vw, 50vw"
                    className="object-cover"
                  />
                </div>
              </Reveal>

              <Reveal delay={0.15}>
                <div className="flex h-full flex-col justify-center">
                  <p className="eyebrow">{t("conceptDesignEyebrow")}</p>
                  <h2 className="mt-3 text-3xl font-light text-primary sm:text-4xl">
                    {t("conceptDesignTitle")}
                  </h2>
                  <div className="horizon-divider my-6 ml-0" />
                  <p className="whitespace-pre-line text-sm leading-relaxed text-ink/70 sm:text-base">
                    {project.conceptDesign}
                  </p>
                </div>
              </Reveal>
            </div>
          ) : (
            <Reveal>
              <p className="eyebrow">{t("conceptDesignEyebrow")}</p>
              <h2 className="mt-3 max-w-2xl text-3xl font-light text-primary sm:text-4xl">
                {t("conceptDesignTitle")}
              </h2>
              <div className="horizon-divider my-6 ml-0" />
              <p className="max-w-3xl whitespace-pre-line text-sm leading-relaxed text-ink/70 sm:text-base">
                {project.conceptDesign}
              </p>
            </Reveal>
          )}
        </section>
      )}

      {/* ── About This Project (conditional — not every Sale Kit has one) ──
          Text left / image right when an aboutThisProjectImageUrl is set —
          sides swapped from Concept Design above so two consecutive
          split sections don't repeat the same left/right rhythm. Same
          text-only fallback when there's no image. ────────────────────── */}
      {project.aboutThisProject && (
        <section className="bg-primary-900/[0.03] py-20 sm:py-28">
          <div className="container-luxe">
            {project.aboutThisProjectImageUrl ? (
              <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
                <Reveal>
                  <div className="flex h-full flex-col justify-center">
                    <p className="eyebrow">{t("aboutProjectEyebrow")}</p>
                    <h2 className="mt-3 text-3xl font-light text-primary sm:text-4xl">
                      {t("aboutProjectTitle")}
                    </h2>
                    <div className="horizon-divider my-6 ml-0" />
                    <p className="whitespace-pre-line text-sm leading-relaxed text-ink/70 sm:text-base">
                      {project.aboutThisProject}
                    </p>
                  </div>
                </Reveal>

                <Reveal delay={0.15}>
                  <div className="relative aspect-[4/5] w-full overflow-hidden rounded-sm shadow-card sm:aspect-[5/6]">
                    <Image
                      src={project.aboutThisProjectImageUrl}
                      alt={`${project.name} — ${t("aboutProjectTitle")}`}
                      fill
                      sizes="(max-width: 1024px) 100vw, 50vw"
                      className="object-cover"
                    />
                  </div>
                </Reveal>
              </div>
            ) : (
              <Reveal>
                <p className="eyebrow">{t("aboutProjectEyebrow")}</p>
                <h2 className="mt-3 max-w-2xl text-3xl font-light text-primary sm:text-4xl">
                  {t("aboutProjectTitle")}
                </h2>
                <div className="horizon-divider my-6 ml-0" />
                <p className="max-w-3xl whitespace-pre-line text-sm leading-relaxed text-ink/70 sm:text-base">
                  {project.aboutThisProject}
                </p>
              </Reveal>
            )}
          </div>
        </section>
      )}

      {/* ── Facilities — photo wall (Land & Houses reference) ──────────
          Formerly two sections: a 2-column "Overview" (aerial photo +
          eyebrow/heading/description) followed by a standalone Facilities
          strip. The aerial photo and description are gone; the
          eyebrow/heading/divider trio moved down to sit directly above
          the photo strip instead, as this section's own header — see the
          Reveal block below, structurally unchanged from the old Overview
          section, just relocated. py-20/28 preserved here (carried over
          from the old Overview section) so the vertical rhythm after the
          Stat bar above is unaffected by the merge.
          Lives inside container-luxe like every other section on this
          page (no viewport-breakout trick) — its left/right edges line
          up with the navbar/logo, not the true screen edge.
          ≤4 facilities: a fixed grid (2 cols mobile, 4 desktop), gap-0 —
          few enough to just lay flat, no scrolling needed, cards butt up
          edge-to-edge like the Land & Houses reference. >4: handed off to
          FacilityScroller (a client component — button state and the
          scroll-by-one-card math both need refs/effects this async
          Server Component can't hold) for a single horizontal row with
          snap-scroll, drag, and ‹ › buttons instead of a second grid row,
          which would make the section noticeably taller than every other
          section on the page for no benefit. */}
      {facilities.length > 0 && (
        <section className="container-luxe py-20 sm:py-28">
          <Reveal>
            <p className="eyebrow">{t(`status.${project.status}` as any)}</p>
            <h2 className="mt-3 text-3xl font-light text-primary sm:text-4xl">
              {t("overviewTitle")}
            </h2>
            <div className="horizon-divider my-6 ml-0" />
          </Reveal>

          {facilities.length <= 4 ? (
            <ul className="grid grid-cols-2 gap-0 sm:grid-cols-4">
              {facilities.map((facility) => (
                <li key={facility.id}>
                  <FacilityCard facility={facility} />
                </li>
              ))}
            </ul>
          ) : (
            <FacilityScroller facilities={facilities} />
          )}
        </section>
      )}

      {/* ── Special Features section removed from the public page by
          request — project.specialFeatures itself, the schema column,
          and the (now admin-only-hidden) form field are all untouched,
          so nothing here needs a migration; this section just no longer
          renders. See lib/projects.ts / components/admin/ProjectForm.tsx
          for where the data still lives. */}

      {/* ── Gallery ──────────────────────────────────────────────────── */}
      {villaImages.length > 0 && (
        <section className="container-luxe pb-20 sm:pb-28">
          <Reveal>
            <h2 className="text-2xl font-light text-primary sm:text-3xl">
              {t("photoGalleryTitle")}
            </h2>
          </Reveal>
          <div className="mt-8">
            <ProjectGallery
              images={villaImages}
              projectName={project.name}
              labels={{
                close: t("galleryClose"),
                previous: t("galleryPrevious"),
                next: t("galleryNext"),
                viewAll: t("galleryViewAll"),
              }}
            />
          </div>
        </section>
      )}

      {/* ── Unit Types ───────────────────────────────────────────────── */}
      {unitTypes.length > 0 && (
        <section id="unit-types" className="scroll-mt-24 bg-primary-900/[0.03] py-20 sm:py-28">
          <div className="container-luxe">
            <Reveal>
              <p className="eyebrow">{t("unitTypesEyebrow")}</p>
              <h2 className="mt-3 max-w-lg text-3xl font-light text-primary sm:text-4xl">
                {t("unitTypesTitle")}
              </h2>
            </Reveal>

            <div className="mt-10 space-y-8">
              {unitTypes.map((type, i) => (
                <Reveal key={type.id} delay={i * 0.08}>
                  <div className="border border-primary/10 bg-white p-6 sm:p-8">
                    <h3 className="text-xl font-light text-primary">{type.name}</h3>
                    {type.description && (
                      <p className="mt-2 max-w-2xl text-sm text-ink/60">{type.description}</p>
                    )}

                    {type.floorPlans.length > 0 && (
                      <div className="mt-6">
                        <FloorPlanViewer
                          floorPlans={type.floorPlans}
                          typeName={type.name}
                          labels={{
                            close: t("galleryClose"),
                            previous: t("galleryPrevious"),
                            next: t("galleryNext"),
                          }}
                        />
                      </div>
                    )}

                    {/*
                      No divide-x/divide-y here on purpose — those Tailwind
                      utilities add a border to every element with a
                      preceding DOM sibling, which only lines up correctly
                      in a single row. In this 2-col-on-mobile/4-col-on-
                      desktop grid it put a stray border-top on item 2 and a
                      stray border-left on item 3 that didn't correspond to
                      any real row/column edge — the odd floating line seen
                      on mobile. Plain gap spacing avoids the whole class of
                      bug.
                    */}
                    <dl className="mt-8 grid grid-cols-2 gap-x-8 gap-y-6 border-t border-primary/10 pt-6 sm:grid-cols-4 sm:pt-7">
                      {type.livingAreaSqm !== null && (
                        <div>
                          <dt className="text-[10px] font-normal uppercase tracking-widest2 text-ink/45">
                            {t("unitTypeLabels.livingArea")}
                          </dt>
                          <dd className="mt-1.5 text-lg font-light tracking-tight text-primary">
                            {formatNumber(locale, type.livingAreaSqm)} {t("units.sqm")}
                          </dd>
                        </div>
                      )}
                      {type.bedrooms !== null && (
                        <div>
                          <dt className="text-[10px] font-normal uppercase tracking-widest2 text-ink/45">
                            {t("unitTypeLabels.bedrooms")}
                          </dt>
                          <dd className="mt-1.5 text-lg font-light tracking-tight text-primary">
                            {type.bedrooms}
                          </dd>
                        </div>
                      )}
                      {type.bathrooms !== null && (
                        <div>
                          <dt className="text-[10px] font-normal uppercase tracking-widest2 text-ink/45">
                            {t("unitTypeLabels.bathrooms")}
                          </dt>
                          <dd className="mt-1.5 text-lg font-light tracking-tight text-primary">
                            {type.bathrooms}
                          </dd>
                        </div>
                      )}
                      {type.totalUnits !== null && (
                        <div>
                          <dt className="text-[10px] font-normal uppercase tracking-widest2 text-ink/45">
                            {t("unitTypeLabels.totalUnits")}
                          </dt>
                          <dd className="mt-1.5 text-lg font-light tracking-tight text-primary">
                            {type.totalUnits}
                          </dd>
                        </div>
                      )}
                    </dl>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Site Plan + Unit Status ──────────────────────────────────── */}
      {(project.masterPlanImageUrl || units.length > 0) && (
        <section id="site-plan" className="scroll-mt-24 container-luxe py-20 sm:py-28">
          <Reveal>
            <p className="eyebrow">{t("sitePlanEyebrow")}</p>
            <h2 className="mt-3 max-w-lg text-3xl font-light text-primary sm:text-4xl">
              {t("sitePlanTitle")}
            </h2>
          </Reveal>

          {/*
            Map + unit list side by side from lg up — previously both were
            full container-luxe width, stacked. At this page's max
            container width (1440px) the map's locked aspect ratio
            (1754:1241, matching the source artwork — see SitePlanMap's
            file comment) turned that into a ~950px-tall image on its own,
            before the legend and a 60+-unit chip list even started; the
            whole section could run several viewport-heights long. Splitting
            the row narrows the map (shorter at the same aspect ratio) and,
            more importantly, caps the unit list's own height with an
            internal scroll area instead of letting it grow open-ended —
            together those keep the section's total height roughly
            constant regardless of how many units or unit types a project
            has. Below lg there's no room for a side-by-side split, so it
            stacks — the list still gets its own scroll cap there too, for
            the same reason.
            Either half can be absent (no master plan image yet, or no
            units digitized yet) — flex rather than a fixed grid-cols so a
            missing half doesn't leave a dead empty column, just the one
            block at full width.
          */}
          <div className="mt-10 lg:flex lg:items-start lg:gap-10">
            {project.masterPlanImageUrl && (
              <div className={units.length > 0 ? "lg:w-[58%] lg:shrink-0" : "w-full"}>
                {units.length > 0 ? (
                  <Reveal delay={0.1}>
                    <SitePlanMap
                      projectName={project.name}
                      masterPlanImageUrl={project.masterPlanImageUrl}
                      units={units}
                      labels={{
                        all: t("unitStatus.ALL"),
                        available: t("unitStatus.AVAILABLE"),
                        reserved: t("unitStatus.RESERVED"),
                        sold: t("unitStatus.SOLD"),
                        zoomIn: t("sitePlanZoomIn"),
                        zoomOut: t("sitePlanZoomOut"),
                        fullscreen: t("sitePlanFullscreen"),
                        resetView: t("sitePlanResetView"),
                      }}
                    />
                  </Reveal>
                ) : (
                  // Plain fallback — a master plan photo with no digitized
                  // units yet still deserves to be shown, just without the
                  // interactive overlay (which would have nothing to plot).
                  <Reveal delay={0.1}>
                    <div className="relative aspect-[16/10] w-full overflow-hidden border border-primary/10 bg-white">
                      <Image
                        src={project.masterPlanImageUrl}
                        alt={`${project.name} — ${t("sitePlanTitle")}`}
                        fill
                        sizes="100vw"
                        className="object-contain"
                      />
                    </div>
                  </Reveal>
                )}
              </div>
            )}

            {units.length > 0 && (
              <div
                className={`mt-8 lg:mt-0 lg:min-w-0 lg:flex-1 ${
                  project.masterPlanImageUrl ? "" : "w-full"
                }`}
              >
                <Reveal delay={0.15}>
                  <div className="mb-5 flex flex-wrap gap-5 text-xs text-ink/70">
                    {(["AVAILABLE", "RESERVED", "SOLD"] as const).map((status) => (
                      <span key={status} className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-full ${UNIT_STATUS_DOT[status]}`} />
                        {t(`unitStatus.${status}`)}
                      </span>
                    ))}
                  </div>

                  <div
                    className="max-h-[340px] space-y-6 overflow-y-auto pr-2 sm:max-h-[400px] lg:max-h-[560px]
                      [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full
                      [&::-webkit-scrollbar-thumb]:bg-primary/15 [&::-webkit-scrollbar-track]:bg-transparent"
                  >
                    {Object.entries(unitsByType).map(([typeName, groupUnits]) => (
                      <div key={typeName}>
                        <h3 className="text-sm font-medium text-primary">{typeName}</h3>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {groupUnits.map((u) => (
                            <span
                              key={u.id}
                              title={`${u.unitNumber} — ${t(`unitStatus.${u.status}`)}`}
                              className={`rounded-sm px-2.5 py-1 text-xs font-medium ${UNIT_STATUS_STYLE[u.status]}`}
                            >
                              {u.unitNumber}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </Reveal>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Nearby Attractions ───────────────────────────────────────── */}
      {/* 5-column layout desktop, per-category accordion on mobile — pulls
          the project's own categories, falling back to the shared default
          set when it has none of its own (see lib/projects.ts). */}
      {attractionCategories.length > 0 && (
        <section className="bg-primary-900/[0.03] py-20 sm:py-28">
          <div className="container-luxe">
            <Reveal>
              <p className="eyebrow">{t("nearbyEyebrow")}</p>
              <h2 className="mt-3 max-w-lg text-3xl font-light text-primary sm:text-4xl">
                {t("nearbyTitle")}
              </h2>
            </Reveal>

            <div className="mt-10 hidden gap-8 md:grid md:grid-cols-5">
              {attractionCategories.map((cat) => (
                <div key={cat.id}>
                  <h3 className="border-b border-primary/10 pb-3 text-sm font-medium text-primary">
                    {cat.categoryName}
                  </h3>
                  <ul className="mt-4 space-y-3 text-sm text-ink/70">
                    {cat.items.map((item) => (
                      <li key={item.id} className="flex items-baseline justify-between gap-3">
                        <span>{item.name}</span>
                        <span className="shrink-0 text-xs text-ink/40">
                          {formatNumber(locale, item.distanceKm)} {t("units.km")}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <div className="mt-10 space-y-3 md:hidden">
              {attractionCategories.map((cat, index) => (
                // `group` + native `open:`/`group-open:` variants drive the
                // collapsed/expanded styling straight off the <details>
                // element's own `open` attribute — no client JS needed.
                // `open` here is just the initial/default state (React
                // treats it as an uncontrolled boolean attribute), which is
                // exactly what "first category open, rest collapsed" needs.
                <details
                  key={cat.id}
                  open={index === 0}
                  className="group border border-primary/10 bg-surface-muted transition-colors open:bg-white"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm font-medium text-primary transition-colors active:bg-primary/5">
                    {cat.categoryName}
                    <ChevronDown
                      size={16}
                      aria-hidden
                      className="shrink-0 text-accent-700 transition-transform duration-200 group-open:rotate-180"
                    />
                  </summary>
                  <ul className="mt-4 space-y-3 px-4 pb-4 text-sm text-ink/70">
                    {cat.items.map((item) => (
                      <li key={item.id} className="flex items-baseline justify-between gap-3">
                        <span>{item.name}</span>
                        <span className="shrink-0 text-xs text-ink/40">
                          {formatNumber(locale, item.distanceKm)} {t("units.km")}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Location & Map ──────────────────────────────────────────── */}
      {/* Embedded preview needs coordinates (Google's no-key embed
          endpoint takes a lat/lng pair, not an arbitrary share link); the
          "Get Directions" button always renders once there's a location,
          since directionsUrl always resolves to something — see the
          computation above. */}
      <section className="py-20 sm:py-28">
        <div className="container-luxe">
          <Reveal>
            <p className="eyebrow">{t("mapEyebrow")}</p>
            <h2 className="mt-3 max-w-lg text-3xl font-light text-primary sm:text-4xl">
              {t("mapTitle")}
            </h2>
            <p className="mt-4 flex items-center gap-2 text-sm text-ink/70">
              <MapPin size={16} className="shrink-0 text-accent-700" aria-hidden />
              {project.location}
            </p>
          </Reveal>

          <Reveal delay={0.1} className="mt-10">
            <div className="overflow-hidden border border-primary/10 bg-surface-muted shadow-card">
              {mapEmbedSrc ? (
                // Google's no-API-key embed doesn't take a custom style
                // (that needs the paid Maps JavaScript API), so the CI
                // match happens in CSS instead: desaturate the tile
                // imagery, then lay a navy overlay over it in
                // `mix-blend-color` — that blend mode keeps the map's own
                // light/dark structure (roads, water, buildings) but
                // recolors it with the overlay's hue, landing on a
                // monochrome navy map instead of Google's stock palette.
                // `pointer-events-none` on the overlay keeps the map
                // itself draggable/zoomable underneath it.
                <div className="relative h-[360px] w-full sm:h-[440px]">
                  <iframe
                    src={mapEmbedSrc}
                    title={t("mapTitle")}
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    className="h-full w-full grayscale contrast-125 saturate-0"
                  />
                  <div className="pointer-events-none absolute inset-0 bg-primary-800/40 mix-blend-color" />
                </div>
              ) : (
                <div className="flex h-[280px] w-full items-center justify-center bg-primary-900/[0.04] text-sm text-ink/50 sm:h-[360px]">
                  <MapPin size={20} className="mr-2 shrink-0" aria-hidden />
                  {project.location}
                </div>
              )}
              <a
                href={directionsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 bg-primary px-6 py-4 text-sm font-medium uppercase tracking-wide text-white transition-colors hover:bg-primary-700"
              >
                <Navigation size={16} aria-hidden />
                {t("mapGetDirections")}
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Construction progress (from ProjectProgress) ─────────────── */}
      {/* id targeted by /progress — scroll-mt clears the sticky navbar. */}
      <section id="progress" className="scroll-mt-24 bg-primary-900/[0.03] py-20 sm:py-28">
        <div className="container-luxe">
          <Reveal>
            <p className="eyebrow">{t("galleryTitle")}</p>
            <h2 className="mt-3 max-w-lg text-3xl font-light text-primary sm:text-4xl">
              {t("gallerySubtitle")}
            </h2>
          </Reveal>
          <Reveal delay={0.1} className="mt-10">
            <ProgressGallery
              months={progress}
              locale={locale}
              emptyLabel={t("progressEmpty")}
              labels={{
                close: t("galleryClose"),
                previous: t("galleryPrevious"),
                next: t("galleryNext"),
              }}
            />
          </Reveal>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────── */}
      {/*
        No FAQPage schema here. Google honours one per page and the home
        page carries the full set — emitting a partial second copy on every
        project page would compete with it for the same rich result.
      */}
      <FaqAccordion
        id="project-faq"
        faqs={faqs}
        tone="muted"
        labels={{
          eyebrow: t("faq.eyebrow"),
          title: t("faq.title"),
          categories: {
            ownership: t("faq.categories.ownership"),
            payment: t("faq.categories.payment"),
            construction: t("faq.categories.construction"),
            aftercare: t("faq.categories.aftercare"),
          },
        }}
      />

      {/* ── Lead form ────────────────────────────────────────────────── */}
      <section id="enquire" className="container-luxe py-16 sm:py-24">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-20">
          <Reveal>
            <p className="eyebrow">{project.location}</p>
            <h2 className="mt-3 text-3xl font-light text-primary sm:text-4xl">
              {t("formTitle")}
            </h2>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-ink/70">
              {t("formSubtitle")}
            </p>
            {miniStats.length > 0 && (
              <div className="mt-6 flex flex-wrap items-center divide-x divide-primary/15 text-xs font-medium uppercase tracking-widest2 text-primary/80">
                {miniStats.map((stat) => (
                  <span key={stat} className="px-4 first:pl-0">
                    {stat}
                  </span>
                ))}
              </div>
            )}
          </Reveal>
          <Reveal delay={0.15}>
            <div className="border border-primary/8 bg-white p-6 shadow-cardHover sm:p-9">
              <LeadForm projectSlug={project.slug} source="PROJECT_PAGE" />
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
