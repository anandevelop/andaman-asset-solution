/**
 * app/[locale]/admin/events/[id]/edit/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Event editor plus the registration roster.
 *
 * The roster lives on the same page rather than behind another click: on
 * event day the two things an organiser needs — the door list and the
 * ability to mark people ATTENDED — should be one screen.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, CheckCircle2, ExternalLink, Users } from "lucide-react";
import { EventStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin/guard";
import { SEAT_TAKING_STATUSES } from "@/lib/events";
import { intlLocale, toDateTimeLocal } from "@/lib/format";
import {
  parseEditingLocale,
  pickEditingTranslation,
  translationCompleteness,
} from "@/lib/admin/translated-form";
import { deleteEvent, updateEvent } from "../../actions";
import EventForm, { type EventFormValues } from "@/components/admin/EventForm";
import LanguageTabs from "@/components/admin/LanguageTabs";
import RegistrationStatusSelect from "@/components/admin/RegistrationStatusSelect";
import SaveToast from "@/components/admin/SaveToast";

type Props = {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ created?: string; lang?: string }>;
};

export default async function EditEventPage(props: Props) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const { locale, id } = params;
  await requireAdmin(locale);

  const t = await getTranslations({ locale, namespace: "admin" });
  const lang = parseEditingLocale(searchParams.lang);

  // sandbox: `prisma as any` — agencyName/whatsapp (EventRegistration) and
  // translations (Event, from this same follow-up) were added after the
  // locally generated Prisma client (this sandbox has no network access to
  // Prisma's binary CDN to re-run `prisma generate`), same tradeoff already
  // documented above getProjectBySlug in lib/projects.ts.
  const db = prisma as any;

  const event = await db.event.findUnique({
    where: { id },
    include: {
      translations: true,
      registrations: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          agencyName: true,
          email: true,
          phone: true,
          whatsapp: true,
          partySize: true,
          notes: true,
          status: true,
          consentGiven: true,
          createdAt: true,
        },
      },
    },
  });

  if (!event) notFound();

  const completeness = translationCompleteness<any>(event.translations, "title");
  const editing = pickEditingTranslation<any>(event.translations, lang);

  // Re-typed by hand since `event` came back through the `prisma as any`
  // cast above — the shape matches the `select` block exactly.
  type Registration = {
    id: string;
    name: string;
    agencyName: string | null;
    email: string;
    phone: string;
    whatsapp: string | null;
    partySize: number;
    notes: string | null;
    status: EventStatus;
    consentGiven: boolean;
    createdAt: Date;
  };
  const registrations = event.registrations as Registration[];

  const booked = registrations
    .filter((r) => (SEAT_TAKING_STATUSES as readonly EventStatus[]).includes(r.status))
    .reduce((sum, r) => sum + r.partySize, 0);

  const values: EventFormValues = {
    slug: event.slug,
    title: editing?.title ?? "",
    description: editing?.description ?? "",
    location: event.location ?? "",
    startsAt: toDateTimeLocal(event.startsAt),
    endsAt: toDateTimeLocal(event.endsAt),
    coverImageUrl: event.coverImageUrl ?? "",
    capacity: event.capacity === null ? "" : String(event.capacity),
    isPublished: event.isPublished,
  };

  const dateFormat = new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  const statusLabels = Object.fromEntries(
    Object.values(EventStatus).map((status) => [
      status,
      t(`eventStatus.${status}` as never),
    ]),
  ) as Record<EventStatus, string>;

  return (
    <div className="space-y-8">
      <header>
        <Link
          href={`/${locale}/admin/events`}
          className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-primary"
        >
          <ArrowLeft size={14} aria-hidden />
          {t("events.title")}
        </Link>

        <h1 className="mt-3 text-2xl font-semibold text-primary sm:text-3xl">
          {t("events.editTitle")}
        </h1>

        {event.isPublished && (
          <Link
            href={`/${locale}/events/${event.slug}`}
            target="_blank"
            className="mt-3 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-primary"
          >
            <ExternalLink size={14} aria-hidden />
            /events/{event.slug}
          </Link>
        )}
      </header>

      {searchParams.created && (
        <SaveToast tone="success" token="created">
          <CheckCircle2 size={16} aria-hidden />
          {t("common.saved")}
        </SaveToast>
      )}

      {/* ── Roster ──────────────────────────────────────────────────── */}
      <section className="admin-card">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-base font-semibold text-primary">
            <Users size={16} className="text-accent-700" aria-hidden />
            {t("events.registrations")}
          </h2>

          <p className="text-sm text-ink-muted">
            {event.capacity === null
              ? t("events.seatsBooked", { booked })
              : t("events.seatsBookedOf", { booked, capacity: event.capacity })}
          </p>
        </div>

        {registrations.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-muted">
            {t("events.noRegistrations")}
          </p>
        ) : (
          <div className="-mx-6 overflow-x-auto px-6">
            <table className="w-full min-w-[720px] border-collapse">
              <thead className="border-b border-primary/10">
                <tr>
                  <th className="admin-th">{t("leads.name")}</th>
                  <th className="admin-th">{t("events.agency")}</th>
                  <th className="admin-th">{t("leads.contact")}</th>
                  <th className="admin-th">{t("leads.received")}</th>
                  <th className="admin-th">{t("leads.status")}</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-primary/5">
                {registrations.map((registration) => (
                  <tr key={registration.id}>
                    <td className="admin-td">
                      <p className="font-medium text-primary">{registration.name}</p>
                      {registration.notes && (
                        <p className="mt-1 max-w-xs text-xs leading-relaxed text-ink-muted">
                          {registration.notes}
                        </p>
                      )}
                      {!registration.consentGiven && (
                        <p className="mt-1 text-xs font-medium text-red-700">
                          {t("leads.consent")}: {t("common.no")}
                        </p>
                      )}
                    </td>

                    <td className="admin-td whitespace-nowrap text-ink-muted">
                      {registration.agencyName ?? "—"}
                    </td>

                    <td className="admin-td whitespace-nowrap">
                      <a
                        href={`mailto:${registration.email}`}
                        className="block text-accent-700 hover:underline"
                      >
                        {registration.email}
                      </a>
                      <a
                        href={`tel:${registration.phone}`}
                        className="mt-0.5 block text-xs text-ink-muted hover:underline"
                      >
                        {registration.phone}
                      </a>
                      {registration.whatsapp && (
                        <p className="mt-0.5 text-xs text-ink-muted">
                          WhatsApp: {registration.whatsapp}
                        </p>
                      )}
                    </td>

                    <td className="admin-td whitespace-nowrap text-xs text-ink-muted">
                      <time dateTime={registration.createdAt.toISOString()}>
                        {dateFormat.format(registration.createdAt)}
                      </time>
                    </td>

                    <td className="admin-td">
                      <RegistrationStatusSelect
                        locale={locale}
                        eventId={event.id}
                        registrationId={registration.id}
                        value={registration.status}
                        labels={statusLabels}
                        errorLabel={t("common.error")}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <LanguageTabs
        active={lang}
        completeness={completeness}
        completeLabel={t("common.translationComplete")}
        missingLabel={t("common.translationMissing")}
      />

      <EventForm
        key={lang}
        locale={locale}
        lang={lang}
        action={updateEvent.bind(null, locale, event.id)}
        values={values}
        onDelete={deleteEvent.bind(null, locale, event.id)}
        submitLabel={t("common.save")}
      />
    </div>
  );
}
