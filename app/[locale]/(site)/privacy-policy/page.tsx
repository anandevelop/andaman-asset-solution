import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Mail, Phone, MapPin, ShieldCheck } from "lucide-react";
import Reveal from "@/components/Reveal";
import { siteConfig } from "@/config/site";
import { locales, type Locale } from "@/i18n";
import { getPrivacyPolicy } from "@/content/privacy-policy";
import { intlLocale } from "@/lib/format";

type Props = { params: Promise<{ locale: string }> };

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params;

  const {
    locale
  } = params;

  const policy = getPrivacyPolicy(locale);

  return {
    title: policy.title,
    description: policy.intro[0].slice(0, 160),
    alternates: {
      canonical: `${siteConfig.url}/${locale}${siteConfig.legal.privacyPolicyPath}`,
      languages: Object.fromEntries(
        locales.map((l) => [
          l,
          `${siteConfig.url}/${l}${siteConfig.legal.privacyPolicyPath}`,
        ]),
      ),
    },
    robots: { index: true, follow: true },
  };
}

export default async function PrivacyPolicyPage(props: Props) {
  const params = await props.params;

  const {
    locale
  } = params;

  setRequestLocale(locale);

  const policy = getPrivacyPolicy(locale);

  const effectiveDate = new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(policy.effectiveDate));

  return (
    <article className="container-luxe max-w-3xl pb-24 pt-28 sm:pt-36">
      <Reveal>
        <p className="eyebrow flex items-center gap-2">
          <ShieldCheck size={14} /> PDPA
        </p>
        <h1 className="mt-3 text-4xl font-light text-primary sm:text-5xl">
          {policy.title}
        </h1>

        <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink/65">
          <span>
            {policy.lastUpdatedLabel}: {effectiveDate}
          </span>
          <span className="hidden sm:inline">·</span>
          <span>
            {policy.versionLabel}: <code className="text-ink/70">{policy.version}</code>
          </span>
        </p>

        <div className="mt-10">
          {policy.intro.map((paragraph, i) => (
            <p key={i} className="mt-4 text-sm leading-relaxed text-ink/70 sm:text-base">
              {paragraph}
            </p>
          ))}
        </div>
      </Reveal>

      {/* ── Sections ─────────────────────────────────────────────────── */}
      <div className="mt-14 space-y-12">
        {policy.sections.map((section, i) => (
          <Reveal key={section.heading} delay={Math.min(i, 4) * 0.05}>
            <section>
              <h2 className="text-xl font-medium text-primary sm:text-2xl">
                {section.heading}
              </h2>

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
                      className="relative pl-5 text-sm leading-relaxed text-ink/70 before:absolute before:left-0 before:top-[0.6em] before:h-1 before:w-1 before:rounded-full before:bg-accent-700"
                    >
                      {bullet}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </Reveal>
        ))}
      </div>

      {/* ── Contact ──────────────────────────────────────────────────── */}
      <Reveal>
        <section className="mt-16 border border-primary/10 bg-white p-7 shadow-card sm:p-9">
          <h2 className="text-xl font-medium text-primary sm:text-2xl">
            {policy.contactHeading}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-ink/70">
            {policy.contactIntro}
          </p>

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
    </article>
  );
}
