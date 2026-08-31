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
 * AwardsSection/SalesTeamSection's convention. The photo strip beside the
 * copy is the one client-side part; see components/CompanyIntroGallery.tsx.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { getTranslations } from "next-intl/server";
import Reveal from "@/components/Reveal";
import CompanyIntroGallery, {
  type IntroGallerySlide,
} from "@/components/CompanyIntroGallery";

/*
  Five photographs, two of them from each of the two projects with the
  most usable exteriors and one from the third, ordered so the palette
  alternates (white facade → dark villa → pool → garden → warm interior)
  rather than putting the two bright white frames side by side.

  Paths point straight into public/gallery/, by request. Two notes on
  which files were picked, both of them about that directory rather than
  about the design:

  - The stable, descriptive names win over the numbered ones wherever a
    project has them. Gallery directories hold project photography and
    get replaced wholesale when a new shoot is dropped in — which
    happened twice while these sections were first being built, silently
    breaking every path into them both times. `exterior-facade.webp` and
    friends are the aliases that survived that; `the-victory30.webp` is
    the one pick here with no alias, and it is the file most likely to
    move if The Victory is re-shot.
  - No spaces. `trinity-village/cover.webp` is the same frame as
    `The Trinity Village1.webp` under a name that does not need escaping
    in a URL.

  `objectPosition` is per photo because a collapsed panel is a narrow
  vertical slice: dead centre of pool-terrace.webp is a glass mullion,
  and of cover.webp a blank wall, so both are nudged toward the pool and
  the timber gate respectively.
*/
const PHOTOS = [
  {
    src: "/gallery/residence-prime/exterior-facade.webp",
    objectPosition: "object-[50%_50%]",
    project: "residencePrime",
  },
  {
    src: "/gallery/victory/cover.webp",
    objectPosition: "object-[50%_50%]",
    project: "victory",
  },
  {
    src: "/gallery/residence-prime/pool-terrace.webp",
    objectPosition: "object-[24%_50%]",
    project: "residencePrime",
  },
  {
    src: "/gallery/trinity-village/cover.webp",
    objectPosition: "object-[30%_50%]",
    project: "trinityVillage",
  },
  {
    src: "/gallery/victory/the-victory30.webp",
    objectPosition: "object-[50%_50%]",
    project: "victory",
  },
] as const;

export default async function CompanyIntro() {
  const t = await getTranslations("home.whoWeAre");
  /* Project names and the photo alt are shared with VisionMission's arc,
     so they live in `common` rather than being spelled out twice. */
  const shared = await getTranslations("common");

  /* Looked up once by hand rather than through a computed key: three
     projects, five panels, and this way every message key appears
     literally in the source, which is what tests/i18n.test.ts checks
     against messages/en.json. */
  const projectNames: Record<(typeof PHOTOS)[number]["project"], string> = {
    residencePrime: shared("projectNames.residencePrime"),
    trinityVillage: shared("projectNames.trinityVillage"),
    victory: shared("projectNames.victory"),
  };

  const slides: IntroGallerySlide[] = PHOTOS.map((photo) => {
    const label = projectNames[photo.project];

    return {
      src: photo.src,
      objectPosition: photo.objectPosition,
      label,
      alt: shared("projectPhotoAlt", { project: label }),
    };
  });

  return (
    <section className="container-luxe py-20 sm:py-28">
      <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_1fr] lg:gap-20">
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
        </Reveal>

        <Reveal delay={0.15}>
          <CompanyIntroGallery slides={slides} />
        </Reveal>
      </div>
    </section>
  );
}
