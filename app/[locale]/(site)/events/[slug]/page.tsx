/**
 * app/[locale]/(site)/events/[slug]/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Event detail and RSVP.
 *
 * Carries Event JSON-LD, which is what produces the date/venue rich result
 * in search. eventAttendanceMode and eventStatus are required properties
 * there — omitting them costs the enhancement even when everything else is
 * correct.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, unstable_setRequestLocale } from "next-intl/server";
import { ArrowLeft, CalendarDays, Clock, MapPin, Users } from "lucide-react";
import Reveal from "@/components/Reveal";
import JsonLd from "@/components/JsonLd";
import EventRsvpForm from "@/components/EventRsvpForm";
import { siteConfig } from "@/config/site";
import { locales } from "@/i18n";
import { getEventBySlug, getPublishedEventSlugs } from "@/lib/events";
import { isDatabaseOffline, DatabaseUnavailableError } from "@/lib/db";
import { truncate } from "@/lib/markdown";
import { intlLocale } from "@/lib/format";

export const dynamicParams = true;
export const revalidate = 120;

type Props = { params: { locale: string; slug: string } };

export async function generateStaticParams() {
  const slugs = await getPublishedEventSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params: { locale, slug },
}: Props): Promise<Metadata> {
  const event = await getEventBySlug(slug, locale);
  if (!event) return { title: "Not found", robots: { index: false } };

  const description = truncate(event.description, 300);

  return {
    title: event.title,
    description,
    alternates: {
      canonical: `${siteConfig.url}/${locale}/events/${event.slug}`,
      languages: Object.fromEntries(
        locales.map((l) => [l, `${siteConfig.url}/${l}/events/${event.slug}`]),
      ),
    },
    openGraph: {
      title: event.title,
      description,
      type: "website",
      url: `${siteConfig.url}/${locale}/events/${event.slug}`,
      images: event.coverImageUrl ? [{ url: event.coverImageUrl }] : undefined,
    },
  };
}

export default async function EventPage({ params: { locale, slug } }: Props) {
  unstable_setRequestLocale(locale);

  const event = await getEventBySlug(slug, locale);

  if (!event) {
    if (isDatabaseOffline()) throw new DatabaseUnavailableError(`events/${slug}`);
    notFound();
  }

  const t = await getTranslations("events");
  const url = `${siteConfig.url}/${locale}/events/${event.slug}`;

  const dateFormat = new Intl.DateTimeFormat(intlLocale(locale), {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const timeFormat = new Intl.DateTimeFormat(intlLocale(locale), {
    hour: "2-digit",
    minute: "2-digit",
  });

  const facts = [
    {
      icon: CalendarDays,
      label: t("date"),
      value: dateFormat.format(event.startsAt),
    },
    {
      icon: Clock,
      label: t("time"),
      value: event.endsAt
        ? `${timeFormat.format(event.startsAt)} – ${timeFormat.format(event.endsAt)}`
        : timeFormat.format(event.startsAt),
    },
    ...(event.location
      ? [{ icon: MapPin, label: t("location"), value: event.location }]
      : []),
    ...(event.seatsLeft !== null
      ? [
          {
            icon: Users,
            label: t("availability"),
            value:
              event.seatsLeft === 0
                ? t("full")
                : t("seatsLeft", { count: event.seatsLeft }),
          },
        ]
      : []),
  ];

  return (
    <>
      <JsonLd
        id="event-schema"
        data={{
          "@context": "https://schema.org",
          "@type": "Event",
          "@id": url,
          name: event.title,
          description: truncate(event.description, 500),
          url,
          image: event.coverImageUrl ? [event.coverImageUrl] : undefined,
          startDate: event.startsAt.toISOString(),
          endDate: event.endsAt?.toISOString(),
          // Both required for the Event rich result.
          eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
          eventStatus: "https://schema.org/EventScheduled",
          inLanguage: locale === "th" ? "th-TH" : "en-US",
          location: event.location
            ? {
                "@type": "Place",
                name: event.location,
                address: {
                  "@type": "PostalAddress",
                  streetAddress: event.location,
                  addressCountry: "TH",
                },
              }
            : undefined,
          maximumAttendeeCapacity: event.capacity ?? undefined,
          organizer: {
            "@type": "Organization",
            name: siteConfig.legalName,
            url: siteConfig.url,
          },
          offers: {
            "@type": "Offer",
            // Registration is free; omitting price entirely makes the offer
            // invalid, so state zero explicitly.
            price: "0",
            priceCurrency: "THB",
            availability: event.isPast
              ? "https://schema.org/SoldOut"
              : event.seatsLeft === 0
                ? "https://schema.org/SoldOut"
                : "https://schema.org/InStock",
            url,
            validFrom: new Date().toISOString(),
          },
        }}
      />

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="relative flex min-h-[420px] w-full items-end overflow-hidden sm:min-h-[540px]">
        {event.coverImageUrl && (
          <Image
            src={event.coverImageUrl}
            alt={event.title}
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-primary-900/90 via-primary-900/40 to-primary-900/20" />

        <div className="container-luxe relative z-10 pb-12 pt-32 text-white sm:pb-16">
          <Reveal>
            <Link
              href={`/${locale}/events`}
              className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-white/60 transition-colors hover:text-accent"
            >
              <ArrowLeft size={13} aria-hidden />
              {t("backToEvents")}
            </Link>
          </Reveal>

          <Reveal delay={0.1}>
            <p className="eyebrow mt-6 text-accent-200">
              {event.isPast ? t("pastLabel") : dateFormat.format(event.startsAt)}
            </p>
            <h1 className="mt-3 max-w-3xl text-3xl font-light leading-[1.1] sm:text-5xl">
              {event.title}
            </h1>
          </Reveal>
        </div>
      </section>

      {/* ── Facts + body + RSVP ──────────────────────────────────────── */}
      <section className="container-luxe py-16 sm:py-24">
        <div className="grid gap-12 lg:grid-cols-[1fr_400px] lg:gap-16">
          <div>
            <Reveal>
              <dl className="grid grid-cols-2 gap-6 border-b border-primary/10 pb-8 sm:grid-cols-4">
                {facts.map(({ icon: Icon, label, value }) => (
                  <div key={label}>
                    <dt className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-ink/65">
                      <Icon size={12} aria-hidden />
                      {label}
                    </dt>
                    <dd className="mt-1.5 text-sm font-medium text-primary">{value}</dd>
                  </div>
                ))}
              </dl>
            </Reveal>

            <Reveal delay={0.1}>
              <p className="mt-10 whitespace-pre-line text-sm leading-relaxed text-ink/70 sm:text-base">
                {event.description}
              </p>
            </Reveal>
          </div>

          {/* ── RSVP ───────────────────────────────────────────────────
              Dark navy card (client-supplied reference design, applied to
              every event's RSVP — see EventRsvpForm.tsx's header comment).
              EventRsvpForm renders its own eyebrow/title/subtitle so this
              wrapper only owns the card chrome, not the copy. */}
          <div className="lg:sticky lg:top-28 lg:self-start">
            <Reveal delay={0.15}>
              <div className="rounded-sm bg-primary p-6 shadow-cardHover sm:p-8">
                {event.isPast ? (
                  <>
                    <h2 className="text-lg font-light text-white">
                      {t("pastTitle")}
                    </h2>
                    <p className="mt-3 text-sm leading-relaxed text-white/70">
                      {t("pastBody")}
                    </p>
                    <Link
                      href={`/${locale}/events`}
                      className="mt-6 flex w-full items-center justify-center rounded-sm border border-white/30 px-6 py-3 text-sm font-medium uppercase tracking-wide text-white transition-colors hover:bg-white hover:text-primary"
                    >
                      {t("seeUpcoming")}
                    </Link>
                  </>
                ) : (
                  <EventRsvpForm eventId={event.id} seatsLeft={event.seatsLeft} />
                )}
              </div>
            </Reveal>
          </div>
        </div>
      </section>
    </>
  );
}
