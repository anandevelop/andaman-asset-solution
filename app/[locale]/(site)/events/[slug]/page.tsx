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
import ImageWithSkeleton from "@/components/ImageWithSkeleton";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { redirectIfMoved } from "@/lib/redirects";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CalendarDays, Clock, MapPin, Users } from "lucide-react";
import Reveal from "@/components/Reveal";
import JsonLd from "@/components/JsonLd";
import EventRsvpForm from "@/components/EventRsvpForm";
import { localizedAlternates, breadcrumbList, trailFor } from "@/lib/seo";
import Breadcrumb from "@/components/Breadcrumb";
import { siteConfig } from "@/config/site";
import { getEventBySlug } from "@/lib/events";
import { isDatabaseOffline, DatabaseUnavailableError } from "@/lib/db";
import { truncate } from "@/lib/markdown-text";
import { intlLocale } from "@/lib/format";

export const dynamicParams = true;
export const revalidate = 120;

type Props = { params: Promise<{ locale: string; slug: string }> };

// Nothing is prerendered at build (see app/[locale]/layout.tsx). The empty
// array — rather than no function at all — is what keeps this route
// ISR-cached: with none, Next renders it on every request.
export function generateStaticParams() {
  return [];
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params;

  const {
    locale,
    slug
  } = params;

  const event = await getEventBySlug(slug, locale);
  if (!event) return { title: "Not found", robots: { index: false } };

  const description = truncate(event.metaDescription, 300);

  return {
    title: event.metaTitle,
    description,
    alternates: localizedAlternates(locale, `/events/${event.slug}`),
    // Per-locale admin toggle (EventForm's SEO section) — see the
    // schema.prisma comment on EventTranslation.noIndex.
    robots: event.noIndex ? { index: false, follow: true } : { index: true, follow: true },
    openGraph: {
      title: event.metaTitle,
      description,
      type: "website",
      url: `${siteConfig.url}/${locale}/events/${event.slug}`,
      // No `images` here: opengraph-image.tsx in this same folder
      // generates the card (date, event name, cover photo) and, per
      // Next's file-convention precedence, replaces whatever this field
      // would have set anyway.
    },
  };
}

export default async function EventPage(props: Props) {
  const params = await props.params;

  const {
    locale,
    slug
  } = params;

  setRequestLocale(locale);

  const event = await getEventBySlug(slug, locale);

  if (!event) {
    if (isDatabaseOffline()) throw new DatabaseUnavailableError(`events/${slug}`);
    await redirectIfMoved(locale, `/events/${slug}`);
    notFound();
  }

  const t = await getTranslations("events");
  const tNav = await getTranslations("nav");
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

  // One array for the trail a visitor reads and the one Google reads.
  const trail = trailFor(locale, [
    { name: tNav("home"), path: "" },
    { name: tNav("events"), path: "/events" },
    { name: event.title, path: `/events/${event.slug}` },
  ]);

  return (
    <>
      <JsonLd
        id="breadcrumb-schema"
        data={breadcrumbList(trail)}
      />
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
          <ImageWithSkeleton
            src={event.coverImageUrl}
            alt={event.title}
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
        )}
        <div className="absolute inset-0 bg-linear-to-t from-primary-900/90 via-primary-900/40 to-primary-900/20" />

        <div className="container-luxe relative z-10 pb-12 pt-32 text-white sm:pb-16">
          <Reveal>
            {/* On the photograph, so `onImage`. The trail's middle crumb
                goes where the back arrow used to, and says where you are
                as well as where you can go. */}
            <Breadcrumb items={trail} tone="onImage" />
          </Reveal>

          <Reveal delay={0.1}>
            <p className="eyebrow mt-6 text-accent-200">
              {event.isPast ? t("pastLabel") : dateFormat.format(event.startsAt)}
            </p>
            <h1 className="mt-3 max-w-3xl text-3xl font-light leading-[1.1] text-white sm:text-5xl">
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
              <div className="rounded-xs bg-primary p-6 shadow-cardHover sm:p-8">
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
                      className="mt-6 flex w-full items-center justify-center rounded-xs border border-white/30 px-6 py-3 text-sm font-medium uppercase tracking-wide text-white transition-colors hover:bg-white hover:text-primary"
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
