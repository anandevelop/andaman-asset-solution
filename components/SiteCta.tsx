import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import ImageWithSkeleton from "@/components/ImageWithSkeleton";
import Reveal from "@/components/Reveal";
import { getSiteSettings } from "@/lib/settings";
import { getPublishedProjects } from "@/lib/projects";
import {
  ctaButtonHref,
  ctaCopy,
  formatCtaMessage,
  type CtaBlock,
  type CtaButton,
} from "@/lib/site-cta";
import type { Locale } from "@/i18n";

/**
 * components/SiteCta.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * "Come and see the site" — the closing invitation, between the sales team
 * strip and the footer.
 *
 * Lifted out of the home page and into the site layout so it sits *below*
 * "Our Sales" rather than above it. Inside the page it was part of
 * `children`, and the layout renders the sales strip after `children`, so
 * no amount of reordering within the page could put it last. Moving the
 * section to where the order is decided was the fix; the alternative —
 * making <main> a flex column and giving this one section `order-last` —
 * would have changed the box model of fifteen other pages to reposition
 * one block.
 *
 * The photograph is a published project's own hero image, so this section
 * cannot end up advertising a development that has been taken down. The
 * list it comes from is the same one the footer reads, deduped to a single
 * query by the cache() on getPublishedProjects.
 *
 * WHERE THE WORDS COME FROM
 *
 * A `block` — a row an editor wrote at /admin/pages/home/cta, already narrowed to
 * this page by the mount list in lib/site-cta.ts. Everything on the band
 * comes from it: eyebrow, headline, standfirst, both button labels, both
 * button destinations, and the photograph.
 *
 * With no block, the copy that ships in messages/*.json is used instead,
 * and `variant` picks which set — the general invitation, or the wording
 * written for /projects or /about. That is the arrangement this section
 * had before it was editable, kept as the fallback so an empty table, an
 * unrun migration or an unreachable database still renders a real CTA
 * rather than a blank navy band. See lib/site-cta.ts.
 *
 * Either way the copy is handed the published project count, so a sentence
 * that says "all three" counts them rather than saying three for ever, and
 * a sentence that never mentions a number ignores the argument.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** Which of the built-in message-file wordings to use when there is no
 *  block. Named after the route each was written for. */
export type SiteCtaVariant = "default" | "projects" | "about";

type ResolvedButton = { href: string; newTab: boolean; label: string };

/** A destination and its words, or nothing. Both halves have to be there:
 *  a button with no label is a blank rectangle, and a label with nowhere to
 *  go is a control that does not work. */
function withLabel(
  target: CtaButton | null,
  label: string | null | undefined,
): ResolvedButton | null {
  if (!target || !label?.trim()) return null;
  return { ...target, label: label.trim() };
}

/**
 * One button, as either a <Link> or an <a>.
 *
 * An internal route goes through <Link> for the same client navigation
 * every other link on the site gets. A wa.me URL or a tel: number is not a
 * route at all, so it stays a plain anchor — handing one to <Link> asks
 * the router to prefetch something it cannot.
 */
function CtaLink({
  button,
  className,
  children,
}: {
  button: ResolvedButton;
  className: string;
  children: React.ReactNode;
}) {
  if (button.href.startsWith("/")) {
    return (
      <Link href={button.href} className={className}>
        {children}
      </Link>
    );
  }

  return (
    <a
      href={button.href}
      {...(button.newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className={className}
    >
      {children}
    </a>
  );
}

const PRIMARY_CLASS =
  "group inline-flex items-center justify-center gap-3 bg-accent px-9 py-4 text-xs font-medium uppercase tracking-[0.18em] text-primary transition-colors duration-300 hover:bg-accent-500";

const SECONDARY_CLASS =
  "inline-flex items-center justify-center border border-white/35 px-9 py-4 text-xs font-medium uppercase tracking-[0.18em] text-white transition-all duration-300 hover:border-white/70 hover:bg-white/10";

export default async function SiteCta({
  block = null,
  variant = "default",
}: {
  block?: CtaBlock | null;
  variant?: SiteCtaVariant;
} = {}) {
  const locale = (await getLocale()) as Locale;

  /* Every namespace is read on every render rather than only the one this
     variant needs: these are lookups into messages already loaded for the
     request, not fetches, and spelling the namespaces out as literals is
     what lets tests/i18n.test.ts confirm the keys below actually exist. A
     computed namespace would be invisible to it. */
  const [t, tChat, tProjects, tAbout, settings, projects] = await Promise.all([
    getTranslations("home.cta"),
    getTranslations("chatButtons"),
    getTranslations("projects.cta"),
    getTranslations("about.cta"),
    getSiteSettings(),
    getPublishedProjects(locale),
  ]);

  const count = projects.length;
  const whatsappGreeting = tChat("whatsappGreeting");
  const links = { locale, settings, whatsappGreeting };

  // A block with no photograph of its own falls back to a published
  // development's hero, so the band cannot end up advertising a project
  // that has been taken down — and cannot end up flat navy either.
  const projectPhoto = projects.find((project) => project.heroImageUrl)?.heroImageUrl ?? null;

  const copy = block ? ctaCopy(block, locale) : undefined;

  const tVariant = variant === "projects" ? tProjects : variant === "about" ? tAbout : null;

  /* One shape either way: whichever source the words come from, the markup
     below reads these five values and nothing else. */
  const eyebrow = copy ? (copy.eyebrow ?? "") : t("eyebrow");
  const title = copy
    ? formatCtaMessage(copy.title, locale, count)
    : tVariant
      ? tVariant("title", { count })
      : t("title");
  const subtitle = copy
    ? copy.subtitle
      ? formatCtaMessage(copy.subtitle, locale, count)
      : ""
    : tVariant
      ? tVariant("subtitle", { count })
      : t("subtitle");
  const image = block ? (block.backgroundImageUrl ?? projectPhoto) : projectPhoto;

  const primary: ResolvedButton | null = block
    ? withLabel(ctaButtonHref(block.primaryKind, block.primaryHref, links), copy?.primaryLabel)
    : { href: `/${locale}/contact`, newTab: false, label: t("primary") };

  const secondary: ResolvedButton | null = block
    ? withLabel(ctaButtonHref(block.secondaryKind, block.secondaryHref, links), copy?.secondaryLabel)
    : withLabel(ctaButtonHref("WHATSAPP", null, links), t("secondary"));

  /* A block with no headline for any locale is a row an editor started and
     never finished; rendering the band empty would be worse than leaving
     it out of the page. */
  if (block && !copy) return null;

  return (
    <section className="relative overflow-hidden bg-primary py-24 text-white sm:py-32">
      {image && (
        <ImageWithSkeleton src={image} alt="" fill sizes="100vw" className="object-cover" />
      )}

      {/* Two layers: a flat wash so the type is legible wherever the
          photograph happens to be bright, and a left-weighted gradient so
          the copy's own corner is darker still. The wash is kept light
          enough that the villa is still recognisably a villa — the picture
          is half the argument this section is making. */}
      <div className="absolute inset-0 bg-primary/55" aria-hidden />
      <div
        className="absolute inset-0 bg-linear-to-r from-primary-900/80 via-primary-900/30 to-transparent"
        aria-hidden
      />

      <div className="container-luxe relative z-10">
        <Reveal>
          {eyebrow && (
            <p className="text-xs font-medium uppercase tracking-widest2 text-accent">
              {eyebrow}
            </p>
          )}

          <h2 className="mt-5 max-w-2xl text-4xl font-light leading-[1.1] text-white sm:text-5xl">
            {title}
          </h2>

          {subtitle && (
            <p className="mt-6 max-w-md text-sm leading-relaxed text-white/80 sm:text-base">
              {subtitle}
            </p>
          )}

          <div className="mt-10 flex flex-col items-stretch gap-4 sm:flex-row sm:items-center">
            {primary && (
              <CtaLink button={primary} className={PRIMARY_CLASS}>
                {primary.label}
                <ArrowRight
                  size={15}
                  strokeWidth={2}
                  className="transition-transform group-hover:translate-x-1"
                  aria-hidden
                />
              </CtaLink>
            )}

            {secondary && (
              <CtaLink button={secondary} className={SECONDARY_CLASS}>
                {secondary.label}
              </CtaLink>
            )}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
