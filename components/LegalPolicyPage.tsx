import type { ReactNode } from "react";
import { Mail, Phone, MapPin } from "lucide-react";
import Link from "next/link";
import Reveal from "@/components/Reveal";
import PrintButtons from "@/components/PrintButtons";
import { siteConfig } from "@/config/site";
import { type Locale } from "@/i18n";

/**
 * components/LegalPolicyPage.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The shared layout behind /privacy-policy and /terms: a sidebar table of
 * contents (sticky from `lg` up, stacked above the content below it) next
 * to numbered sections, a small "need help" callout pointing at /contact,
 * and the two print/download buttons from components/PrintButtons.tsx.
 *
 * One component, not two near-identical page bodies, because
 * content/privacy-policy.ts and content/terms.ts already share this exact
 * shape (title/intro/sections/contactHeading/contactIntro) — before this
 * component existed, the two page files were the same ~180 lines of JSX
 * with different content plugged in, and every layout change had to be
 * made twice, correctly, in both.
 *
 * SECTION NUMBERS ARE RENDERED, NOT STORED
 *
 * Every heading in both content files already starts "1. ", "2. " etc. —
 * written for the old single-column layout, where the number was just
 * part of the heading text. The new numbered badge needs that digit on
 * its own, so stripLeadingNumber() below pulls it back out at render time
 * rather than requiring both content files (4 locales each) to be edited
 * to remove it — 88 hand-edited strings across two files is exactly the
 * kind of change one wrong keystroke turns into a silently missing
 * section number in some language nobody reading the diff can check.
 * ─────────────────────────────────────────────────────────────────────────
 */

export type LegalPolicySection = {
  heading: string;
  body?: string[];
  bullets?: string[];
};

/** Structurally satisfied by both PolicyContent (content/privacy-policy.ts)
 *  and TermsContent (content/terms.ts) as-is — no change needed to either. */
export type LegalPolicyContent = {
  version: string;
  effectiveDate: string;
  title: string;
  intro: string[];
  sections: LegalPolicySection[];
  contactHeading: string;
  contactIntro: string;
  lastUpdatedLabel: string;
  versionLabel: string;
};

type LegalPageStrings = {
  tableOfContents: string;
  downloadPdf: string;
  print: string;
  needHelp: string;
  needHelpBody: string;
  contactCta: string;
};

type Props = {
  locale: string;
  eyebrowIcon: ReactNode;
  eyebrowLabel: string;
  content: LegalPolicyContent;
  effectiveDateFormatted: string;
  strings: LegalPageStrings;
};

function stripLeadingNumber(heading: string): string {
  return heading.replace(/^\d+\.\s*/, "");
}

/**
 * No <article>/<Breadcrumb> wrapper here — those stay in each page file
 * (see privacy-policy/page.tsx and terms/page.tsx), not because they would
 * not fit here, but because tests/breadcrumbs.test.ts greps every
 * page.tsx file directly for "<Breadcrumb" and the trailFor()/
 * breadcrumbList(trail) pair beside it, on purpose: a page that renders
 * its trail through a shared component it does not itself import would
 * pass a component test but read, to that grep, as a page with no trail
 * at all. This component starts from the eyebrow onward so the page file
 * keeps owning that visible pairing.
 */
export default function LegalPolicyPage({
  locale,
  eyebrowIcon,
  eyebrowLabel,
  content,
  effectiveDateFormatted,
  strings,
}: Props) {
  return (
    <>
      <Reveal>
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="eyebrow flex items-center gap-2">
              {eyebrowIcon} {eyebrowLabel}
            </p>
            <h1 className="mt-3 text-4xl font-light text-primary sm:text-5xl">
              {content.title}
            </h1>

            <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink/65">
              <span>
                {content.lastUpdatedLabel}: {effectiveDateFormatted}
              </span>
              <span className="hidden sm:inline">·</span>
              <span>
                {content.versionLabel}: <code className="text-ink/70">{content.version}</code>
              </span>
            </p>
          </div>

          <PrintButtons downloadLabel={strings.downloadPdf} printLabel={strings.print} />
        </div>

        <div className="mt-10 max-w-3xl">
          {content.intro.map((paragraph, i) => (
            <p key={i} className="mt-4 text-sm leading-relaxed text-ink/70 sm:text-base">
              {paragraph}
            </p>
          ))}
        </div>
      </Reveal>

      {/* print:grid-cols-1: the sidebar's own print:hidden below removes it
          from the grid, but the explicit [260px_1fr] template still
          reserves that 260px track for no one — a blank strip down the
          left of a printed page — unless the template itself collapses to
          a single column here too. */}
      <div className="mt-14 grid gap-10 lg:grid-cols-[260px_1fr] lg:gap-14 print:grid-cols-1">
        {/* ── Table of contents + help callout ──────────────────────── */}
        <Reveal className="print:hidden">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <nav aria-label={strings.tableOfContents}>
              <div className="rounded-xs border border-primary/10 bg-white p-5 shadow-card">
                <p className="text-xs font-medium uppercase tracking-wide text-ink/65">
                  {strings.tableOfContents}
                </p>
                <ol className="mt-4 space-y-3">
                  {content.sections.map((section, i) => (
                    <li key={section.heading}>
                      <a
                        href={`#section-${i + 1}`}
                        className="flex gap-2.5 text-sm text-ink/70 transition-colors hover:text-primary"
                      >
                        <span className="shrink-0 font-medium text-accent-700">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span>{stripLeadingNumber(section.heading)}</span>
                      </a>
                    </li>
                  ))}
                </ol>
              </div>
            </nav>

            <div className="mt-6 rounded-xs bg-accent/10 p-5">
              <p className="text-sm font-medium text-primary">{strings.needHelp}</p>
              <p className="mt-2 text-sm leading-relaxed text-ink/70">{strings.needHelpBody}</p>
              <Link
                href={`/${locale}/contact`}
                className="mt-3 inline-block text-sm font-medium text-accent-700 underline hover:text-primary"
              >
                {strings.contactCta}
              </Link>
            </div>
          </div>
        </Reveal>

        {/* ── Sections ───────────────────────────────────────────────── */}
        <div className="max-w-3xl space-y-12">
          {content.sections.map((section, i) => (
            <Reveal key={section.heading} delay={Math.min(i, 4) * 0.05}>
              {/* scroll-mt so a jump from the table of contents does not
                  land the heading directly under the fixed navbar. */}
              <section id={`section-${i + 1}`} className="scroll-mt-28">
                {/* print:break-after-avoid: without it a heading is free
                    to land as the very last line on a page, with every
                    word of its own section pushed to the next one — the
                    "03 Purposes and lawful bases" orphan the printed PDF
                    showed. print:break-inside-avoid keeps the badge glued
                    to its heading text specifically (as opposed to the
                    section below, which can still split across a page —
                    a long section such as this one's own eight-bullet
                    "rights" list is exactly the case forcing the whole
                    section together would instead strand on its own
                    page). */}
                <div className="flex items-start gap-3 print:break-inside-avoid print:break-after-avoid">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xs bg-primary text-sm font-medium text-white">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h2 className="pt-0.5 text-xl font-medium text-primary sm:text-2xl">
                    {stripLeadingNumber(section.heading)}
                  </h2>
                </div>

                {section.body?.map((paragraph, j) => (
                  <p key={j} className="mt-3 text-sm leading-relaxed text-ink/70">
                    {paragraph}
                  </p>
                ))}

                {section.bullets && (
                  <ul className="mt-4 space-y-2.5">
                    {section.bullets.map((bullet, j) => (
                      <li
                        key={j}
                        // break-inside-avoid here, not on the whole <ul>:
                        // a single bullet's sentence should never split
                        // mid-word across a page, but the list as a whole
                        // is allowed to — the alternative is a page break
                        // that skips straight from item 3 to item 8
                        // because item 4 alone didn't fit.
                        className="relative pl-5 text-sm leading-relaxed text-ink/70 before:absolute before:left-0 before:top-[0.6em] before:h-1 before:w-1 before:rounded-full before:bg-accent-700 print:break-inside-avoid"
                      >
                        {bullet}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </Reveal>
          ))}

          {/* ── Contact ──────────────────────────────────────────────── */}
          <Reveal>
            <section className="border border-primary/10 bg-white p-7 shadow-card sm:p-9 print:break-inside-avoid">
              <h2 className="text-xl font-medium text-primary sm:text-2xl">
                {content.contactHeading}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-ink/70">{content.contactIntro}</p>

              <dl className="mt-6 space-y-3 text-sm">
                <div className="flex items-start gap-3">
                  <MapPin size={16} className="mt-0.5 shrink-0 text-accent-700" />
                  <dd className="text-ink/70">
                    {siteConfig.legalName}
                    <br />
                    {siteConfig.contact.address[locale as Locale] ?? siteConfig.contact.address.en}
                  </dd>
                </div>
                <div className="flex items-center gap-3">
                  <Mail size={16} className="shrink-0 text-accent-700" />
                  <dd>
                    <a
                      href={`mailto:${siteConfig.contact.email}`}
                      className="text-ink/70 underline hover:text-primary"
                    >
                      {siteConfig.contact.email}
                    </a>
                  </dd>
                </div>
                <div className="flex items-center gap-3">
                  <Phone size={16} className="shrink-0 text-accent-700" />
                  <dd>
                    <a
                      href={`tel:${siteConfig.contact.phone.replace(/\s/g, "")}`}
                      className="text-ink/70 underline hover:text-primary"
                    >
                      {siteConfig.contact.phoneDisplay}
                    </a>
                  </dd>
                </div>
              </dl>
            </section>
          </Reveal>
        </div>
      </div>
    </>
  );
}
