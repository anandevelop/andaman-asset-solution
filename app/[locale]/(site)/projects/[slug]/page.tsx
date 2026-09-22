import type { Metadata } from "next";
import ImageWithSkeleton from "@/components/ImageWithSkeleton";
import { notFound, redirect } from "next/navigation";
import { redirectIfMoved } from "@/lib/redirects";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowRight, ChevronDown, Compass, FileDown, MapPin } from "lucide-react";
import Reveal from "@/components/Reveal";
import StatBar from "@/components/StatBar";
import SitePlanMap from "@/components/SitePlanMap";
import MapCard from "@/components/MapCard";
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
import { localizedAlternates, breadcrumbList, trailFor } from "@/lib/seo";
import Breadcrumb from "@/components/Breadcrumb";
import { siteConfig } from "@/config/site";
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
import { COMPANY_FOUNDED_YEAR } from "@/content/company-timeline";

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

type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateStaticParams() {
  const slugs = await getPublishedProjectSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params;

  const {
    locale,
    slug
  } = params;

  const project = await getProjectBySlug(slug, locale);
  if (!project) return { title: "Not found", robots: { index: false } };

  const title = project.metaTitle || `${project.name} — ${project.location}`;
  const description = project.metaDescription || project.tagline;

  return {
    title,
    description,
    alternates: {
      ...localizedAlternates(locale, `/projects/${project.slug}`),
      /* An explicit canonical, when one is set on the project (the SEO
         tab). Overrides the self-referencing default localizedAlternates
         produces — used when the same development is also listed
         somewhere that has to be treated as the original. */
      ...(project.canonicalUrl ? { canonical: project.canonicalUrl } : {}),
    },
    // Per-locale admin toggle (ProjectForm's SEO section) — see the
    // schema.prisma comment on ProjectTranslation.noIndex.
    robots: project.noIndex ? { index: false, follow: true } : { index: true, follow: true },
    openGraph: {
      title,
      description,
      type: "article",
      url: `${siteConfig.url}/${locale}/projects/${project.slug}`,
      // No `images` here: opengraph-image.tsx in this same folder
      // generates the card (name, location, hero photo, or ogImageUrl
      // passed through untouched) and, per Next's file-convention
      // precedence, replaces whatever this field would have set anyway.
    },
  };
}

export default async function ProjectPage(props: Props) {
  const params = await props.params;

  const {
    locale,
    slug
  } = params;

  setRequestLocale(locale);

  const project = await getProjectBySlug(slug, locale);

  if (!project) {
    // A missing record and an unreachable database look identical here.
    // Only the former is a real 404 — the latter must not be cached as one.
    if (isDatabaseOffline()) throw new DatabaseUnavailableError(`projects/${slug}`);
    await redirectIfMoved(locale, `/projects/${slug}`);
    notFound();
  }

  const [
    t,
    tNav,
    progress,
    faqs,
    settings,
    unitTypes,
    units,
    attractionCategories,
    awards,
    facilities
  ] = await Promise.all([
      getTranslations("projects"),
      getTranslations("nav"),
      getProjectProgress(project.id, locale),
      // The questions a buyer asks while looking at one development, rather
      // than the whole FAQ — the rest lives on the home page.
      getFaqs(locale, { categories: ["ownership", "payment", "construction"] }),
      getSiteSettings(),
      getUnitTypesForProject(project.id, locale),
      getProjectUnits(project.id),
      getNearbyAttractions(locale),
      // Company-wide trust signal for the lead-form mini stat row below —
      // same source as the home page Awards section, not project-specific
      // (Award has no project relation).
      getAwards(locale),
      // Photo cards for the Facilities section below — supersedes reading
      // project.facilities (the deprecated string array) directly.
      getProjectFacilities(project.id, locale),
    ]);

  // Hero badge ("TYPE R · 398.28 SQ.M") — the first unit type by the same
  // sortOrder the Unit Types section below iterates in, not a "starting
  // from" or "cheapest" pick. Hidden entirely when a project has no unit
  // types yet, or that type has no living area set.
  const heroUnitType = unitTypes[0] ?? null;

  // Hero distance line ("7 km to Layan Beach, 15 km to the airport") — the
  // same site-wide, code-owned facts the "Nearby Attractions" section
  // below already shows (see content/nearby-attractions.ts's header for
  // why this isn't per-project data), just surfaced as a compact one-liner
  // up top too. Looked up by the categories' own stable ids rather than
  // array position, so a reorder of CATEGORIES there can't silently break
  // this line.
  const heroBeach = attractionCategories.find((c) => c.id === "beach")?.items[0] ?? null;
  const heroAirport =
    attractionCategories
      .flatMap((c) => c.items)
      .find((item) => item.name.toLowerCase().includes("airport")) ?? null;

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
  // (COMPANY_FOUNDED_YEAR, same shared constant /about's "years" stat and
  // timeline are built from — content/company-timeline.ts), active award
  // count company-wide.
  const totalUnits = project.totalUnits ?? 0;
  const miniStats = [
    totalUnits > 0 ? t("miniStats.units", { count: totalUnits }) : null,
    t("miniStats.since", { year: COMPANY_FOUNDED_YEAR }),
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
  //
  // Two separate outbound links, not one doing double duty: mapViewUrl
  // opens the place itself (the admin's pasted pin/place is the most
  // precise version of that, hence first in the chain), mapDirectionsUrl
  // always builds a genuine turn-by-turn URL regardless of which input
  // was set — a visitor tapping "Get Directions" wants routing, not just
  // the same place page "View on Maps" already opens.
  const hasCoords = project.latitude !== null && project.longitude !== null;
  const mapEmbedSrc = hasCoords
    ? `https://www.google.com/maps?q=${project.latitude},${project.longitude}&z=15&output=embed`
    : await resolveMapEmbedSrc(project.googleMapsUrl);
  const mapViewUrl =
    project.googleMapsUrl ||
    (hasCoords
      ? `https://www.google.com/maps?q=${project.latitude},${project.longitude}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(project.location)}`);
  const mapDirectionsUrl = hasCoords
    ? `https://www.google.com/maps/dir/?api=1&destination=${project.latitude},${project.longitude}`
    : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(project.location)}`;

  // One array for the trail a visitor reads and the one Google reads.
  const trail = trailFor(locale, [
    { name: tNav("home"), path: "" },
    { name: tNav("projects"), path: "/projects" },
    { name: project.name, path: `/projects/${project.slug}` },
  ]);

  return (
    <>
      {/*
        RealEstateListing extends Place, so address/geo describe the
        development itself. No `offers` block — the site doesn't publish
        prices, and an Offer without one isn't meaningful structured data.
      */}
      <JsonLd
        id="breadcrumb-schema"
        data={breadcrumbList(trail)}
      />
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
            <ImageWithSkeleton
              src={project.heroImageUrl}
              alt={`${project.name} — ${project.location}`}
              fill
              priority
              sizes="100vw"
              className="object-cover"
            />
          )
        )}
        <div className="absolute inset-0 bg-linear-to-t from-primary-900/90 via-primary-900/35 to-primary-900/10" />

        {/* Top-left rather than in the copy stack below: matches the
            reference layout's own uppercase, letter-spaced trail. A small
            offset, not top-28/32 — that value is left over from the
            previous vertically-centered hero, where it cleared a content
            block starting much lower; against this bottom-anchored layout
            it just left a bare gap under the navbar. */}
        <div className="container-luxe absolute inset-x-0 top-6 z-10 sm:top-8">
          <Breadcrumb items={trail} tone="onImage" className="uppercase tracking-wide" />
        </div>

        <div className="container-luxe relative z-10 flex flex-col items-start pb-28 text-left text-white sm:pb-36">
          {/* Unit-type badge — the first type by the admin's own sortOrder
              (same order the Unit Types section below iterates), not a
              "starting from" pick. Hidden for a project with no unit types
              yet, or whose first type has no living area set. */}
          {heroUnitType && heroUnitType.livingAreaSqm !== null && (
            <Reveal>
              <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/40 bg-white/10 px-4 py-1.5 text-[11px] uppercase tracking-widest2 backdrop-blur-sm sm:text-xs">
                {heroUnitType.name}
                <span aria-hidden>·</span>
                {formatNumber(locale, heroUnitType.livingAreaSqm)} {t("units.sqm")}
              </p>
            </Reveal>
          )}

          <Reveal delay={0.1}>
            <h1 className="max-w-2xl text-white text-4xl font-light leading-[1.05] sm:text-6xl">
              {project.name}
            </h1>
          </Reveal>

          <Reveal delay={0.15}>
            <div className="mt-5 h-[3px] w-16 bg-accent" />
          </Reveal>

          <Reveal delay={0.2}>
            <p className="mt-5 flex flex-wrap items-center gap-1.5 text-sm text-white/85 sm:text-base">
              <MapPin size={15} className="shrink-0" aria-hidden />
              {project.location}
              {/* Same site-wide, code-owned distances the "Nearby
                  Attractions" section below already shows (see
                  content/nearby-attractions.ts's header) — not
                  project-specific, just surfaced here as a one-liner too. */}
              {heroBeach && heroAirport && (
                <>
                  <span aria-hidden>·</span>
                  {t("heroDistanceLine", {
                    beachDistance: heroBeach.distanceKm,
                    beachName: heroBeach.name,
                    airportDistance: heroAirport.distanceKm,
                  })}
                </>
              )}
            </p>
          </Reveal>

          <Reveal delay={0.3}>
            {/* Stacked full-width on mobile — the primary action on its own
                row, the two secondary ones sharing the row below (each
                filling the space when only one of them exists). `contents`
                on the secondary-pair wrapper drops it out of the layout
                from sm: up, so those two rejoin the primary button's own
                flex-wrap row exactly as before on larger screens. */}
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <a
                href="#enquire"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xs bg-accent px-7 py-3.5 text-sm font-medium uppercase tracking-wide text-primary transition-colors hover:bg-accent-500 sm:w-auto"
              >
                {t("arrangeViewing")}
                <ArrowRight size={16} aria-hidden />
              </a>

              <div className="flex gap-3 sm:contents">
                {/*
                  A brochure download is a lower-commitment action than the
                  enquiry form, so it sits beside it rather than replacing
                  it. No gate: asking for an email before a PDF costs more
                  leads than it captures when the same page already has a
                  form.

                  `download` is advisory — the real behaviour comes from the
                  Content-Disposition header set on upload in lib/s3.ts.
                */}
                {project.brochureUrl && (
                  <a
                    href={project.brochureUrl}
                    download
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-hero flex-1 sm:flex-none"
                  >
                    <FileDown size={16} aria-hidden />
                    {/* Full label from sm: up, where the reference layout
                        gives it room; the mobile row splits with the tour
                        button and "Download " stopped fitting. */}
                    <span className="sm:hidden">{t("brochureShort")}</span>
                    <span className="hidden sm:inline">{t("downloadBrochure")}</span>
                  </a>
                )}

                {/* Matterport/Kuula/360°-video link, admin-set — see
                    Project.virtualTourUrl's schema.prisma comment. Hidden
                    entirely when empty, same as the brochure button above. */}
                {project.virtualTourUrl && (
                  <a
                    href={project.virtualTourUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-hero flex-1 sm:flex-none"
                  >
                    <Compass size={16} aria-hidden />
                    {t("virtualTour")}
                  </a>
                )}
              </div>
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
          aspect-4/5 image). Falls back to the original
          full-width text block when there's no image, so a project seeded
          before this field existed still renders without a layout gap. ── */}
      {project.conceptDesign && (
        <section className="container-luxe py-20 sm:py-28">
          {project.conceptDesignImageUrl ? (
            <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
              <Reveal>
                <div className="relative aspect-4/5 w-full overflow-hidden rounded-xs shadow-card sm:aspect-5/6">
                  <ImageWithSkeleton
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
                  <p className="mt-6 whitespace-pre-line text-sm leading-relaxed text-ink/70 sm:text-base">
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
              <p className="mt-6 max-w-3xl whitespace-pre-line text-sm leading-relaxed text-ink/70 sm:text-base">
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
        <section className="bg-primary-900/3 py-20 sm:py-28">
          <div className="container-luxe">
            {project.aboutThisProjectImageUrl ? (
              <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
                <Reveal>
                  <div className="flex h-full flex-col justify-center">
                    <p className="eyebrow">{t("aboutProjectEyebrow")}</p>
                    <h2 className="mt-3 text-3xl font-light text-primary sm:text-4xl">
                      {t("aboutProjectTitle")}
                    </h2>
                    <p className="mt-6 whitespace-pre-line text-sm leading-relaxed text-ink/70 sm:text-base">
                      {project.aboutThisProject}
                    </p>
                  </div>
                </Reveal>

                <Reveal delay={0.15}>
                  <div className="relative aspect-4/5 w-full overflow-hidden rounded-xs shadow-card sm:aspect-5/6">
                    <ImageWithSkeleton
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
                <p className="mt-6 max-w-3xl whitespace-pre-line text-sm leading-relaxed text-ink/70 sm:text-base">
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
          </Reveal>

          <div className="mt-12">
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
          </div>
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
                // The count has to be supplied here, not substituted in the
                // component: t() formats the ICU message on the spot, so a
                // missing `count` is a FORMATTING_ERROR that renders the key
                // path ("projects.galleryViewAll") in place of the label.
                viewAll: t("galleryViewAll", { count: villaImages.length }),
              }}
            />
          </div>
        </section>
      )}

      {/* ── Unit Types ───────────────────────────────────────────────── */}
      {unitTypes.length > 0 && (
        <section id="unit-types" className="scroll-mt-24 bg-primary-900/3 py-20 sm:py-28">
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
            The map still only renders when there is at least one unit to
            plot (see SitePlanMap's own `!masterPlanImageUrl` branch for the
            "units but no photo yet" case, and the plain <ImageWithSkeleton>
            fallback below for the reverse).
          */}
          {project.masterPlanImageUrl && units.length === 0 && (
            // A master plan photo with no digitized units yet still
            // deserves to be shown, just without the interactive overlay
            // (which would have nothing to plot) or the summary bar
            // (which would have nothing to summarise).
            <Reveal delay={0.1}>
              <div className="relative mt-10 aspect-16/10 w-full overflow-hidden border border-primary/10 bg-white">
                <ImageWithSkeleton
                  src={project.masterPlanImageUrl}
                  alt={`${project.name} — ${t("sitePlanTitle")}`}
                  fill
                  sizes="100vw"
                  className="object-contain"
                />
              </div>
            </Reveal>
          )}

          {units.length > 0 && (
            <div className="mt-10">
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
                    viewMap: t("sitePlanViewMap"),
                    viewList: t("sitePlanViewList"),
                    hint: t("sitePlanHint"),
                    canvasLabel: t("sitePlanCanvasLabel"),
                    statusTitle: t("sitePlanStatusTitle"),
                    totalUnitsLabel: t("sitePlanTotalUnitsLabel"),
                    unitsSuffix: t("sitePlanUnitsSuffix"),
                    detailTitle: t("sitePlanDetailTitle"),
                    detailEmpty: t("sitePlanDetailEmpty"),
                    detailType: t("sitePlanDetailType"),
                    detailLand: t("sitePlanDetailLand"),
                    detailLiving: t("sitePlanDetailLiving"),
                    detailNote: t("sitePlanDetailNote"),
                    bookViewing: t("sitePlanBookViewing"),
                  }}
                />
              </Reveal>
            </div>
          )}
        </section>
      )}

      {/* ── Nearby Attractions ───────────────────────────────────────── */}
      {/* 5-column layout desktop, per-category accordion on mobile — same
          list on every project page, code-owned content rather than a
          database query (see content/nearby-attractions.ts). */}
      {attractionCategories.length > 0 && (
        <section className="bg-primary-900/3 py-20 sm:py-28">
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
                        {/* ink/65, not ink/40: 40% lands on #96a0a8 over this
                            section's background, 2.38:1 — axe flagged it on
                            every project page. Same fix, same target ratio,
                            as the Navbar.tsx and Footer.tsx contrast bugs. */}
                        <span className="shrink-0 text-xs text-ink/65">
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
                        {/* ink/65, not ink/40: 40% lands on #96a0a8 over this
                            section's background, 2.38:1 — axe flagged it on
                            every project page. Same fix, same target ratio,
                            as the Navbar.tsx and Footer.tsx contrast bugs. */}
                        <span className="shrink-0 text-xs text-ink/65">
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
          endpoint takes a lat/lng pair, not an arbitrary share link);
          mapViewUrl/mapDirectionsUrl always resolve to something once
          there's a location — see the computation above. */}
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
            <MapCard
              embedSrc={mapEmbedSrc}
              title={t("mapTitle")}
              name={project.name}
              address={project.location}
              viewUrl={mapViewUrl}
              directionsUrl={mapDirectionsUrl}
              labels={{ viewOnMaps: t("mapViewOnMaps"), getDirections: t("mapGetDirections") }}
            />
          </Reveal>
        </div>
      </section>

      {/* ── Construction progress (from ProjectProgress) ─────────────── */}
      {/* id targeted by /progress — scroll-mt clears the sticky navbar. */}
      <section id="progress" className="scroll-mt-24 bg-primary-900/3 py-20 sm:py-28">
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
                video: t("progressVideoLabel"),
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
