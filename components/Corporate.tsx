/**
 * components/Corporate.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * "Corporate" — what the business actually does, sitting between the
 * featured projects and the awards strip on the home page. Projects show
 * the work; this explains the company behind it; the awards then vouch
 * for both.
 *
 * Copy left, photographs right — the mirror of CompanyIntro further up,
 * which is copy left, gallery right… and that is the point of the change
 * this section just went through. It used to be photographs left, copy
 * right, and the two sections read as the same layout flipped. Now the
 * difference between them is the *shape* of the right-hand side: one
 * gallery there, four tall cards here.
 *
 * THE CARDS CARRY THE LABELS, AND NOTHING ELSE DOES
 *
 * There used to be a row of four text labels under the paragraph *and* a
 * caption on each tile, which is the same four words twice on one screen.
 * The labels now live only on the cards, numbered 01–04 so the eye has an
 * order to follow, which is what the row of four is for.
 *
 * The tiles are DB-backed (CorporateService, /admin/pages/about/corporate); the
 * section's eyebrow and body stay static messages/*.json copy.
 *
 * The heading counts. `home.corporate.title` is an ICU plural keyed on how
 * many services are actually active, so it reads "Four things we do
 * in-house" when there are four and "3 things we do in-house" when
 * somebody switches one off — rather than a heading that says four above
 * three cards. See the note in the admin page about the row of four being
 * the layout this was designed around.
 * ─────────────────────────────────────────────────────────────────────────
 */

import ImageWithSkeleton from "@/components/ImageWithSkeleton";
import { getLocale, getTranslations } from "next-intl/server";
import Reveal from "@/components/Reveal";
import { getCorporateServices } from "@/lib/home-content";

export default async function Corporate() {
  const [t, services] = await Promise.all([
    getTranslations("home.corporate"),
    getCorporateServices(await getLocale()),
  ]);

  // Nothing to introduce and nothing to show: the paragraph on its own
  // reads as a section that failed to load.
  if (services.length === 0) return null;

  return (
    <section className="container-luxe py-20 sm:py-28">
      <div className="grid items-center gap-12 lg:grid-cols-[0.85fr_1.6fr] lg:gap-16">
        <Reveal>
          <p className="eyebrow">{t("eyebrow")}</p>

          {/*
            Sentence case, unlike CompanyIntro's heading above it. That one
            is a single word set as a display line; this is a sentence, and
            uppercasing a sentence of this length turns it into something
            to decode rather than read. Tracking stays at 0.07em for the
            reason CompanyIntro gives: Thai stacks tone marks over its base
            characters and wide tracking pulls them adrift.
          */}
          <h2 className="mt-4 text-3xl font-light leading-[1.2] tracking-[0.02em] text-primary sm:text-4xl">
            {t("title", { count: services.length })}
          </h2>

          <p className="mt-6 max-w-md text-sm leading-relaxed text-ink/70 sm:text-base">
            {t("body")}
          </p>
        </Reveal>

        {/*
          Two columns on a phone, four from `lg`. Four portrait cards in a
          row need about 200px each before the label wraps mid-word, which
          a 375px screen does not have.
        */}
        <Reveal delay={0.15}>
          <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {services.map((service, index) => (
              <li
                key={service.id}
                className="group relative aspect-3/4 w-full overflow-hidden rounded-xs shadow-card"
              >
                <ImageWithSkeleton
                  src={service.imageUrl}
                  alt={service.imageAlt}
                  fill
                  sizes="(max-width: 1024px) 45vw, 20vw"
                  className="object-cover transition-transform duration-700 group-hover:scale-105"
                />

                {/* Explicit stops rather than an even ramp. Two of these
                    four photographs are pale interiors, and a gradient
                    spread evenly over the whole card leaves white type on
                    something close to white. This holds near-opaque under
                    the caption, then clears by just past halfway so the
                    picture is still a picture. */}
                <div className="absolute inset-0 bg-linear-to-t from-primary-900/90 from-8% via-primary-900/45 via-28% to-transparent to-62%" />

                <div className="absolute inset-x-3 bottom-3 sm:inset-x-4 sm:bottom-4">
                  {/* Position, not an id — "01" is where this card sits in
                      the row, so it is derived from the row rather than
                      stored and left to drift when the order changes. */}
                  <span className="block text-[10px] font-medium tracking-[0.2em] text-white/70 sm:text-xs">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="mt-1 block text-sm font-light leading-snug text-white sm:text-base">
                    {service.label}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
