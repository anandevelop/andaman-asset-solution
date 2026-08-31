/**
 * app/[locale]/(site)/contact/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Contact — form, details, map.
 *
 * Every detail comes from siteConfig, so a change of phone number is one
 * edit rather than a search across pages. Nothing here is hardcoded.
 *
 * The map is a plain iframe against Google's `/maps?output=embed` endpoint.
 * The Maps JavaScript API would give us a styled map and cost an API key,
 * a billing account and a per-load charge — for a pin on a sales office
 * that nobody interacts with beyond tapping "directions", the iframe is the
 * right trade. It is lazy-loaded so it costs nothing until scrolled to.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { Metadata } from "next";
import { getTranslations, unstable_setRequestLocale } from "next-intl/server";
import {
  Clock,
  ExternalLink,
  Mail,
  MapPin,
  Phone,
} from "lucide-react";
import Reveal from "@/components/Reveal";
import LeadForm from "@/components/LeadForm";
import { siteConfig } from "@/config/site";
import { getSiteSettings } from "@/lib/settings";
import { locales, type Locale } from "@/i18n";

export const revalidate = 3600;

type Props = { params: { locale: string } };

export async function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params: { locale },
}: Props): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "contact" });

  return {
    title: t("title"),
    description: t("subtitle"),
    alternates: {
      canonical: `${siteConfig.url}/${locale}/contact`,
      languages: Object.fromEntries(
        locales.map((l) => [l, `${siteConfig.url}/${l}/contact`]),
      ),
    },
  };
}

export default async function ContactPage({ params: { locale } }: Props) {
  unstable_setRequestLocale(locale);

  const [t, tChat, settings] = await Promise.all([
    getTranslations("contact"),
    getTranslations("chatButtons"),
    // Live values — edited at /admin/settings, no deploy needed.
    getSiteSettings(),
  ]);

  const localeKey = locale as Locale;
  const address = settings.contact.address[localeKey];
  const hours = settings.contact.officeHours[localeKey];

  // Build WhatsApp deep-link with pre-filled greeting.
  const waNumber = settings.contact.whatsapp.replace(/\D/g, "");
  const waGreeting = encodeURIComponent(tChat("whatsappGreeting"));
  const whatsappUrl = `https://wa.me/${waNumber}?text=${waGreeting}`;

  // Same query the "directions" link uses, rendered as an embed. Encoding
  // the address rather than reusing mapUrl means the pin matches the
  // address printed above it.
  const mapEmbedUrl = `https://www.google.com/maps?q=${encodeURIComponent(
    address,
  )}&output=embed&hl=${locale}`;

  const details = [
    {
      key: "phone",
      icon: Phone,
      label: t("phone"),
      value: settings.contact.phoneDisplay,
      href: `tel:${settings.contact.phone}`,
    },
    {
      key: "salesEmail",
      icon: Mail,
      label: t("salesEmail"),
      value: settings.contact.salesEmail,
      href: `mailto:${settings.contact.salesEmail}`,
    },
    {
      key: "email",
      icon: Mail,
      label: t("email"),
      value: settings.contact.email,
      href: `mailto:${settings.contact.email}`,
    },
    {
      key: "address",
      icon: MapPin,
      label: t("address"),
      value: address,
      href: settings.contact.mapUrl,
    },
    {
      key: "hours",
      icon: Clock,
      label: t("hours"),
      value: hours,
      href: null,
    },
  ] as const;

  return (
    <>
      {/* ── Header ───────────────────────────────────────────────────── */}
      <section className="container-luxe pb-4 pt-28 sm:pt-36">
        <Reveal>
          <p className="eyebrow">{t("eyebrow")}</p>
          <h1 className="mt-3 max-w-2xl text-4xl font-light text-primary sm:text-5xl">
            {t("title")}
          </h1>
          <p className="mt-6 max-w-lg text-sm leading-relaxed text-ink/70 sm:text-base">
            {t("subtitle")}
          </p>
        </Reveal>
      </section>

      {/* ── Form + details ───────────────────────────────────────────── */}
      <section className="container-luxe py-14 sm:py-20">
        <div className="grid gap-12 lg:grid-cols-[1fr_380px] lg:gap-16">
          {/* Form */}
          <Reveal>
            <div className="rounded-sm border border-primary/10 bg-white p-6 shadow-card sm:p-9">
              <h2 className="text-2xl font-light text-primary">{t("formTitle")}</h2>
              <p className="mb-8 mt-2 text-sm leading-relaxed text-ink/70">
                {t("formSubtitle")}
              </p>

              {/* No projectSlug — a general enquiry, tagged CONTACT_PAGE so
                  the admin can tell it apart from a project enquiry. */}
              <LeadForm source="CONTACT_PAGE" />
            </div>
          </Reveal>

          {/* Details */}
          <Reveal delay={0.15}>
            <div className="lg:sticky lg:top-28 lg:self-start">
              <h2 className="text-xl font-light text-primary">{t("detailsTitle")}</h2>
              <dl className="mt-6 space-y-5">
                {details.map(({ key, icon: Icon, label, value, href }) => (
                  <div key={key} className="flex gap-3.5">
                    <Icon
                      size={16}
                      className="mt-0.5 shrink-0 text-accent-700"
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <dt className="text-[11px] font-medium uppercase tracking-wide text-ink/65">
                        {label}
                      </dt>
                      <dd className="mt-0.5 text-sm text-ink/75">
                        {href ? (
                          <a
                            href={href}
                            {...(href.startsWith("http")
                              ? { target: "_blank", rel: "noopener noreferrer" }
                              : {})}
                            className="transition-colors hover:text-accent-800"
                          >
                            {value}
                          </a>
                        ) : (
                          value
                        )}
                      </dd>
                    </div>
                  </div>
                ))}
              </dl>

              {/* WhatsApp — primary channel, called out visually.
                  #25D366 is WhatsApp's actual brand green (the CTA/icon
                  color used in their own app and brand guidelines) —
                  the previous #128C7E was a much darker, muted teal that
                  didn't read as "WhatsApp" at a glance. */}
              <div className="mt-8 rounded-sm border border-[#25D366]/25 bg-[#25D366]/[0.06] p-5">
                <p className="flex items-center gap-2 text-sm font-medium text-primary">
                  {/* WhatsApp icon */}
                  <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16" className="text-[#25D366]" aria-hidden>
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                  {t("whatsapp")}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-ink/70">
                  {t("preferWhatsApp")}
                </p>
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary mt-4 w-full !bg-[#25D366] !text-white hover:!bg-[#1FBF5C]"
                >
                  {tChat("whatsappLabel")}
                </a>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Map ──────────────────────────────────────────────────────── */}
      <section className="pb-20 sm:pb-28">
        <div className="container-luxe">
          <Reveal>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <h2 className="text-xl font-light text-primary">{t("mapTitle")}</h2>

              <a
                href={settings.contact.mapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-accent-700 transition-colors hover:text-accent-800"
              >
                {t("directions")}
                <ExternalLink size={13} aria-hidden />
              </a>
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <div className="mt-6 aspect-[16/10] w-full overflow-hidden rounded-sm border border-primary/10 shadow-card sm:aspect-[21/9]">
              <iframe
                src={mapEmbedUrl}
                title={t("mapLabel")}
                loading="lazy"
                // Google's embed does not need any of the permissions a
                // bare iframe is granted by default.
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
                className="h-full w-full border-0"
              />
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
