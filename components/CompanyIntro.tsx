/**
 * components/CompanyIntro.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * "Who we are" — the company positioning statement, first content section
 * under the hero on the home page.
 *
 * This section owns the page's only <h1>. The hero above it deliberately
 * does not have one: HeroCarousel's headline is a marketing caption an
 * admin edits per slide, and it renders from two different code paths
 * (a DB slide vs. the static fallback), so the home page used to have an
 * <h1> on a fresh database and none at all once hero slides were
 * configured. Anchoring the heading here instead makes it stable, always
 * present, and actually about the business rather than whatever slide
 * happens to be first. If you add another <h1> to this page, remove this
 * one — the tests/routes.test.ts guard counts them.
 *
 * Server component fetching its own translations, matching
 * AwardsSection/SalesTeamSection's convention. The photo mosaic beside the
 * copy (components/CompanyIntroGallery.tsx) is plain markup too — no
 * client-side interactivity left since it moved from an auto-advancing
 * accordion to a fixed three-photo grid.
 *
 * The mosaic's photos are DB-backed (HomeGalleryPhoto, /admin/pages/home/gallery)
 * rather than the hardcoded array this used to be. Every admin-added photo
 * gets the same default center crop — `objectPosition` used to be set per
 * photo, but that was a literal Tailwind class fragment, and Tailwind's
 * JIT scanner only generates CSS for strings it sees in source; a value
 * coming from the database would compile to nothing. See
 * HomeGalleryPhoto's schema.prisma comment.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import Reveal from "@/components/Reveal";
import CompanyIntroGallery, {
  type IntroGallerySlide,
} from "@/components/CompanyIntroGallery";
import { getHomeGalleryPhotos } from "@/lib/home-content";

const DEFAULT_CROP = "object-[50%_50%]";

export default async function CompanyIntro() {
  const [locale, t, shared, tNav] = await Promise.all([
    getLocale(),
    getTranslations("home.whoWeAre"),
    getTranslations("common"),
    getTranslations("nav"),
  ]);
  const photos = await getHomeGalleryPhotos();

  const slides: IntroGallerySlide[] = photos.map((photo) => ({
    src: photo.imageUrl,
    objectPosition: DEFAULT_CROP,
    label: photo.label,
    alt: shared("projectPhotoAlt", { project: photo.label }),
  }));

  return (
    <section className="container-luxe py-20 sm:py-28">
      {/* Single column when there is no gallery to show beside the copy —
          CompanyIntroGallery.tsx renders nothing for an empty photo list,
          and a two-column grid with a blank second column reads as broken,
          not as intentional. */}
      <div
        className={`grid items-center gap-12 ${
          slides.length > 0 ? "lg:grid-cols-[1.05fr_1fr] lg:gap-20" : ""
        }`}
      >
        <Reveal>
          <p className="eyebrow">{t("eyebrow")}</p>

          {/*
            Tracking is kept to 0.07em rather than the .eyebrow scale's
            0.28em: this string is set in four scripts, and Thai stacks
            tone marks over its base characters — wide tracking on display
            type pulls those marks visually adrift from the glyph they
            belong to. `uppercase` is a no-op for Thai and Chinese and
            correct for English and Russian, so it can stay unconditional.
          */}
          <h1 className="mt-4 text-3xl font-light uppercase leading-[1.2] tracking-[0.07em] text-primary sm:text-4xl lg:text-[2.6rem]">
            {t("title")}
          </h1>

          <p className="mt-6 max-w-xl text-sm leading-relaxed text-ink/70 sm:text-base">
            {t("body")}
          </p>

          <Link
            href={`/${locale}/projects`}
            className="mt-6 inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-accent-700 transition-colors hover:text-accent-800"
          >
            {tNav("viewAllProjects")}
            <ArrowRight size={14} aria-hidden />
          </Link>
        </Reveal>

        {slides.length > 0 && (
          <Reveal delay={0.15}>
            <CompanyIntroGallery slides={slides} />
          </Reveal>
        )}
      </div>
    </section>
  );
}
