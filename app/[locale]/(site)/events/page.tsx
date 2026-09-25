/**
 * app/[locale]/(site)/events/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Event index — upcoming first, past below.
 *
 * Past events stay listed rather than disappearing: their URLs remain valid,
 * and a visitor arriving at an empty page has no way to tell whether the
 * company runs events at all.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { Metadata } from "next";
import ImageWithSkeleton from "@/components/ImageWithSkeleton";
import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowRight, CalendarDays, MapPin, Users } from "lucide-react";
import Reveal from "@/components/Reveal";
import DbOfflineNotice from "@/components/DbOfflineNotice";
import { siteConfig } from "@/config/site";
import { localizedAlternates, breadcrumbList, trailFor } from "@/lib/seo";
import Breadcrumb from "@/components/Breadcrumb";
import JsonLd from "@/components/JsonLd";
import { getPublishedEvents, type EventCard } from "@/lib/events";
import { isDatabaseOffline } from "@/lib/db";
import { intlLocale } from "@/lib/format";

// Shorter than the other listings: "seats left" ages badly.
export const revalidate = 120;

type Props = { params: Promise<{ locale: string }> };

// Nothing is prerendered at build (see app/[locale]/layout.tsx). The empty
// array — rather than no function at all — is what keeps this route
// ISR-cached: with none, Next renders it on every request.
export function generateStaticParams() {
  return [];
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params;

  const {
    locale
  } = params;

  const t = await getTranslations({ locale, namespace: "events" });

  return {
    title: t("title"),
    description: t("subtitle"),
    alternates: localizedAlternates(locale, "/events"),
  };
}

export default async function EventsPage(props: Props) {
  const params = await props.params;

  const {
    locale
  } = params;

  setRequestLocale(locale);

  const [t, tNav, { upcoming, past }] = await Promise.all([
    getTranslations("events"),
    getTranslations("nav"),
    getPublishedEvents(locale),
  ]);

  const dateFormat = new Intl.DateTimeFormat(intlLocale(locale), {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const timeFormat = new Intl.DateTimeFormat(intlLocale(locale), {
    hour: "2-digit",
    minute: "2-digit",
  });

  // Invitation-card treatment — dark navy body + gold accents, the same
  // palette as the RSVP form on the detail page (EventRsvpForm.tsx: eyebrow
  // in accent-300, headings in white, body copy in white/50-60, gold rule
  // as the only decoration) so a visitor lands on a matching look the
  // moment they click through to actually RSVP.
  const card = (event: EventCard, index: number, muted = false) => (
    <Reveal key={event.id} delay={index * 0.08}>
      <Link
        href={`/${locale}/events/${event.slug}`}
        className={`group flex h-full flex-col overflow-hidden rounded-xs border border-white/10 bg-primary shadow-card transition-all hover:shadow-cardHover ${
          muted ? "opacity-70 hover:opacity-100" : ""
        }`}
      >
        <div className="relative aspect-16/10 w-full overflow-hidden bg-primary-900">
          {event.coverImageUrl && (
            <ImageWithSkeleton
              src={event.coverImageUrl}
              alt={event.title}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              className={`object-cover transition-transform duration-700 group-hover:scale-105 ${
                muted ? "grayscale" : ""
              }`}
            />
          )}

          {/* Fades the photo into the card's navy panel below it, rather
              than cutting off on a hard edge — an invitation's photo and
              its text block read as one piece, not two stacked ones. */}
          <div className="absolute inset-x-0 bottom-0 h-14 bg-linear-to-t from-primary to-transparent" />

          {!muted && event.seatsLeft !== null && (
            <span
              className={`absolute left-4 top-4 rounded-full px-3 py-1 text-[10px] font-medium uppercase tracking-wide ${
                event.seatsLeft === 0
                  ? "bg-ink/70 text-white"
                  : event.seatsLeft <= 5
                    ? "bg-amber-500/90 text-white"
                    : "bg-white/90 text-primary"
              }`}
            >
              {event.seatsLeft === 0
                ? t("full")
                : t("seatsLeft", { count: event.seatsLeft })}
            </span>
          )}
        </div>

        <div className="flex flex-1 flex-col p-6">
          <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-widest2 text-accent-300">
            <CalendarDays size={12} aria-hidden />
            <time dateTime={event.startsAt.toISOString()}>
              {dateFormat.format(event.startsAt)}
            </time>
          </p>

          <h2 className="mt-3 text-xl font-light text-white">{event.title}</h2>

          {event.location && (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-white/50">
              <MapPin size={12} className="text-accent-300/70" aria-hidden />
              {event.location}
            </p>
          )}

          <div className="my-4 h-px w-10 bg-accent/40" aria-hidden />

          <p className="line-clamp-2 text-sm leading-relaxed text-white/60">
            {event.description}
          </p>

          <span className="mt-auto flex items-center gap-1.5 pt-6 text-xs font-medium uppercase tracking-widest2 text-accent-300 transition-colors group-hover:text-accent-200">
            {muted ? t("viewEvent") : t("reserve")}
            <ArrowRight
              size={14}
              className="transition-transform group-hover:translate-x-1"
              aria-hidden
            />
          </span>
        </div>
      </Link>
    </Reveal>
  );

  const next = upcoming[0];

  // One array for the trail a visitor reads and the one Google reads.
  const trail = trailFor(locale, [
    { name: tNav("home"), path: "" },
    { name: tNav("events"), path: "/events" },
  ]);

  return (
    <>
      <JsonLd
        id="breadcrumb-schema"
        data={breadcrumbList(trail)}
      />
      {/* ── Header ───────────────────────────────────────────────────── */}
      <section className="container-luxe pb-4 pt-28 sm:pt-36">
        <Reveal>
          <Breadcrumb items={trail} className="mb-5" />

          <p className="eyebrow">{t("eyebrow")}</p>
          <h1 className="mt-3 max-w-2xl text-4xl font-light text-primary sm:text-5xl">
            {t("title")}
          </h1>
          <p className="mt-6 max-w-lg text-sm leading-relaxed text-ink/70 sm:text-base">
            {t("subtitle")}
          </p>
        </Reveal>
      </section>

      {/* ── Next event banner ────────────────────────────────────────── */}
      {next && (
        <section className="container-luxe pt-8">
          <Reveal>
            <Link
              href={`/${locale}/events/${next.slug}`}
              className="group flex flex-wrap items-center justify-between gap-4 rounded-xs border border-accent/30 bg-accent/[0.07] px-6 py-5"
            >
              <div>
                <p className="text-[11px] font-medium uppercase tracking-widest2 text-accent-700">
                  {t("nextEvent")}
                </p>
                <p className="mt-1.5 text-lg font-light text-primary">{next.title}</p>
                <p className="mt-1 text-xs text-ink/70">
                  {dateFormat.format(next.startsAt)} · {timeFormat.format(next.startsAt)}
                  {next.location ? ` · ${next.location}` : ""}
                </p>
              </div>

              <span className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-accent-700">
                {t("reserve")}
                <ArrowRight
                  size={14}
                  className="transition-transform group-hover:translate-x-1"
                  aria-hidden
                />
              </span>
            </Link>
          </Reveal>
        </section>
      )}

      {/* ── Upcoming ─────────────────────────────────────────────────── */}
      <section className="container-luxe py-14 sm:py-20">
        {isDatabaseOffline() && <DbOfflineNotice />}

        {upcoming.length === 0 ? (
          <div className="border border-dashed border-primary/15 bg-white/50 p-12 text-center">
            <Users size={26} strokeWidth={1.5} className="mx-auto text-ink/30" aria-hidden />
            <p className="mt-3 text-sm text-ink/65">{t("empty")}</p>
            <a
              href={`mailto:${siteConfig.contact.salesEmail}`}
              className="mt-5 inline-block text-xs font-medium uppercase tracking-wide text-accent-700 hover:text-accent-800"
            >
              {t("emptyCta")}
            </a>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {upcoming.map((event, index) => card(event, index))}
          </div>
        )}
      </section>

      {/* ── Past ─────────────────────────────────────────────────────── */}
      {past.length > 0 && (
        <section className="bg-primary-900/3 py-16 sm:py-24">
          <div className="container-luxe">
            <Reveal>
              <h2 className="text-2xl font-light text-primary sm:text-3xl">
                {t("pastTitle")}
              </h2>
              <p className="mt-2 max-w-lg text-sm text-ink/70">{t("pastSubtitle")}</p>
            </Reveal>

            <div className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {past.slice(0, 6).map((event, index) => card(event, index, true))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
