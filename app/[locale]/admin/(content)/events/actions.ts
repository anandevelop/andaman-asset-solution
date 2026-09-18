"use server";

/**
 * app/[locale]/admin/events/actions.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Event CRUD plus registration status control.
 *
 * Reducing capacity below the number of seats already booked is rejected
 * rather than silently accepted: the alternative is an event that reports
 * negative availability and a set of attendees nobody has told they are
 * not coming.
 *
 * Deleting an event cascades to its registrations (schema: onDelete
 * Cascade), so the action refuses when anyone has registered. Cancel the
 * bookings first — deliberately, and with a chance to email people.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { EventStatus, Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { locales } from "@/i18n";
import { requireAdminAction, requireCapabilityAction } from "@/lib/admin/guard";
import { resolveIsPublished } from "@/lib/publishing-gate";
import { eventSchema, fieldErrors } from "@/lib/validations";
import { SEAT_TAKING_STATUSES, countTakenSeats } from "@/lib/events";

export type EventFormState = {
  ok: boolean;
  message?: string;
  fields?: Record<string, string>;
};

function readForm(formData: FormData) {
  const text = (key: string) => (formData.get(key) as string | null) ?? "";

  return {
    locale: text("locale") || "en",
    slug: text("slug"),
    title: text("title"),
    description: text("description"),
    location: text("location"),
    startsAt: text("startsAt"),
    endsAt: text("endsAt"),
    coverImageUrl: text("coverImageUrl"),
    ogImageUrl: text("ogImageUrl"),
    capacity: text("capacity"),
    metaTitle: text("metaTitle"),
    metaDescription: text("metaDescription"),
    noIndex: formData.get("noIndex") === "on",
    isPublished: formData.get("isPublished") === "on",
  };
}

function revalidateEvent(locale: string, slug: string) {
  revalidatePath(`/${locale}/admin/events`);
  revalidatePath(`/${locale}/admin`);
  for (const target of locales) {
    // The home page shows the next upcoming event; without this it can
    // still be advertising one that has been cancelled or moved.
    revalidatePath(`/${target}`);
    revalidatePath(`/${target}/events`);
    revalidatePath(`/${target}/events/${slug}`);
  }
}

// ── Create ──────────────────────────────────────────────────────────────

export async function createEvent(
  locale: string,
  _previous: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  await requireAdminAction(Role.ADMIN);

  const parsed = eventSchema.safeParse(readForm(formData));
  if (!parsed.success) return { ok: false, fields: fieldErrors(parsed.error) };

  const { locale: editingLocale, title, description, capacity, metaTitle, metaDescription, noIndex, ...rest } =
    parsed.data;

  let created;
  try {
    created = await prisma.event.create({
      data: {
        ...rest,
        capacity: capacity === null ? null : Math.round(capacity),
        // titleEn/titleTh/descriptionEn/descriptionTh are @deprecated but
        // still NOT NULL (title columns) / nullable (description columns)
        // — mirrored here only for the locale actually being created, same
        // reasoning as NewsArticle's actions.ts.
        titleEn: editingLocale === "en" ? title : "",
        titleTh: editingLocale === "th" ? title : "",
        descriptionEn: editingLocale === "en" ? description : null,
        descriptionTh: editingLocale === "th" ? description : null,
        translations: {
          create: { locale: editingLocale, title, description, metaTitle, metaDescription, noIndex },
        },
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, fields: { slug: "SLUG_TAKEN" } };
    }
    return { ok: false, message: "SAVE_FAILED" };
  }

  revalidateEvent(locale, created.slug);
  redirect(`/${locale}/admin/events/${created.id}/edit?created=1`);
}

// ── Update ──────────────────────────────────────────────────────────────

export async function updateEvent(
  locale: string,
  id: string,
  _previous: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  await requireAdminAction(Role.EDITOR);

  const parsed = eventSchema.safeParse(readForm(formData));
  if (!parsed.success) return { ok: false, fields: fieldErrors(parsed.error) };

  const { locale: editingLocale, title, description, capacity, metaTitle, metaDescription, noIndex, ...rest } =
    parsed.data;
  const data = { ...rest, capacity: capacity === null ? null : Math.round(capacity) };

  // Guard against shrinking capacity under the existing bookings.
  if (data.capacity !== null) {
    const taken = await countTakenSeats(id);
    if (data.capacity < taken) {
      return { ok: false, message: "CAPACITY_BELOW_BOOKED", fields: { capacity: String(taken) } };
    }
  }

  try {
    // Carries what the publish gate needs too — see lib/publishing-gate.ts.
    const before = await prisma.event.findUnique({
      where: { id },
      select: { slug: true, contentStatus: true, isPublished: true },
    });
    if (!before) return { ok: false, message: "SAVE_FAILED" };
    const resolvedIsPublished = resolveIsPublished({
      contentStatus: before.contentStatus,
      requestedIsPublished: data.isPublished,
      currentIsPublished: before.isPublished,
    });

    const updated = await prisma.event.update({
      where: { id },
      data: {
        ...data,
        isPublished: resolvedIsPublished,
        // Only touch the deprecated column matching the locale being
        // saved — editing zh/ru must never blank out or overwrite en/th.
        ...(editingLocale === "en" ? { titleEn: title, descriptionEn: description } : {}),
        ...(editingLocale === "th" ? { titleTh: title, descriptionTh: description } : {}),
        translations: {
          upsert: {
            where: { eventId_locale: { eventId: id, locale: editingLocale } },
            update: { title, description, metaTitle, metaDescription, noIndex },
            create: { locale: editingLocale, title, description, metaTitle, metaDescription, noIndex },
          },
        },
      },
    });

    if (before && before.slug !== updated.slug) revalidateEvent(locale, before.slug);
    revalidateEvent(locale, updated.slug);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, fields: { slug: "SLUG_TAKEN" } };
    }
    return { ok: false, message: "SAVE_FAILED" };
  }

  return { ok: true, message: "SAVED" };
}

// ── Delete ──────────────────────────────────────────────────────────────

export async function deleteEvent(locale: string, id: string): Promise<void> {
  await requireAdminAction(Role.ADMIN);

  const registrations = await prisma.eventRegistration.count({
    where: { eventId: id, status: { in: [...SEAT_TAKING_STATUSES] } },
  });

  // Caught by app/[locale]/admin/error.tsx.
  if (registrations > 0) throw new Error("EVENT_HAS_REGISTRATIONS");

  const event = await prisma.event.delete({
    where: { id },
    select: { slug: true },
  });

  revalidateEvent(locale, event.slug);
  redirect(`/${locale}/admin/events`);
}

// ── Registration status ─────────────────────────────────────────────────

export type RegistrationResult = { ok: true } | { ok: false; error: string };

/**
 * Inline status change on the roster. Confirming a booking re-checks
 * capacity, since PENDING seats can be overbooked by an admin approving
 * more than the room holds.
 */
export async function updateRegistrationStatus(
  locale: string,
  eventId: string,
  id: string,
  status: string,
): Promise<RegistrationResult> {
  await requireAdminAction();

  if (!(Object.values(EventStatus) as string[]).includes(status)) {
    return { ok: false, error: "INVALID_STATUS" };
  }

  try {
    await prisma.eventRegistration.update({
      where: { id },
      data: { status: status as EventStatus },
    });
  } catch {
    return { ok: false, error: "UPDATE_FAILED" };
  }

  revalidatePath(`/${locale}/admin/events/${eventId}/edit`);
  for (const target of locales) revalidatePath(`/${target}/events`);

  return { ok: true };
}

// ── Registration desk ───────────────────────────────────────────────────

export type RegistrationActionResult = { ok: true } | { ok: false; error: string };

/**
 * Turn one registration into a lead — the "สร้างลีด" button.
 *
 * Deliberately not automatic on registration. Most people at an open house
 * are looking rather than buying, and a pipeline containing everyone who
 * walked through the door is one nobody reads; a rep decides who is worth
 * following up, and this records that decision.
 *
 * Idempotent by construction: `EventRegistration.leadId` is unique and is
 * checked first, so a double click — or two reps working the same list at
 * the door — creates one lead, not two. If a lead with that email already
 * exists for this project it is linked rather than duplicated, because the
 * person who enquired last month and came to the open house is one person.
 */
export async function createLeadFromRegistration(
  locale: string,
  registrationId: string,
): Promise<{ ok: true; leadId: string } | { ok: false; error: string }> {
  const session = await requireCapabilityAction("viewAllLeads");

  const registration = await prisma.eventRegistration.findUnique({
    where: { id: registrationId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      notes: true,
      locale: true,
      leadId: true,
      consentGiven: true,
      consentedAt: true,
      consentVersion: true,
      event: { select: { id: true, titleEn: true } },
    },
  });

  if (!registration) return { ok: false, error: "NOT_FOUND" };
  if (registration.leadId) return { ok: true, leadId: registration.leadId };

  try {
    const existing = await prisma.leadInquiry.findFirst({
      where: { email: registration.email.toLowerCase() },
      select: { id: true },
      orderBy: { createdAt: "desc" },
    });

    const leadId =
      existing?.id ??
      (
        await prisma.leadInquiry.create({
          data: {
            name: registration.name,
            email: registration.email.toLowerCase(),
            phone: registration.phone,
            source: "EVENT_PAGE",
            // No project: Event has no relation to one, so the lead is
            // created unattached rather than guessed at from the title. A
            // rep sets it on the lead if the conversation goes that way.
            commsLanguage: registration.locale,
            message: registration.notes,
            assignedToId: session.id,
            // The consent the person actually gave at registration travels
            // with them; inventing a fresh one here would claim they
            // consented to something they never saw.
            consentGiven: registration.consentGiven,
            consentedAt: registration.consentedAt,
            consentVersion: registration.consentVersion,
          },
          select: { id: true },
        })
      ).id;

    await prisma.eventRegistration.update({
      where: { id: registrationId },
      data: { leadId },
    });

    // Says where the lead came from, on the lead's own timeline.
    await prisma.leadNote.create({
      data: {
        leadId,
        authorId: session.id,
        kind: "SYSTEM",
        body: `Created from an event registration — ${registration.event.titleEn}.`,
      },
    });

    revalidatePath(`/${locale}/admin/events/${registration.event.id}/registrations`);
    revalidatePath(`/${locale}/admin/leads`);

    return { ok: true, leadId };
  } catch (error) {
    console.error("[createLeadFromRegistration]", error);
    return { ok: false, error: "CREATE_FAILED" };
  }
}

/**
 * Mark someone present at the door, or undo it.
 *
 * Arriving also confirms them: somebody standing in the room is not
 * "awaiting confirmation". Undoing only clears the arrival — it leaves the
 * status alone, because the person who mis-tapped a name wants that name
 * un-arrived, not silently returned to pending.
 */
export async function setRegistrationCheckedIn(
  locale: string,
  eventId: string,
  registrationId: string,
  checkedIn: boolean,
): Promise<RegistrationActionResult> {
  await requireCapabilityAction("viewAllLeads");

  try {
    const result = await prisma.eventRegistration.updateMany({
      where: { id: registrationId, eventId },
      data: {
        checkedInAt: checkedIn ? new Date() : null,
        ...(checkedIn ? { status: "ATTENDED" as const } : {}),
      },
    });
    if (result.count === 0) return { ok: false, error: "NOT_FOUND" };
  } catch (error) {
    console.error("[setRegistrationCheckedIn]", error);
    return { ok: false, error: "SAVE_FAILED" };
  }

  revalidatePath(`/${locale}/admin/events/${eventId}/registrations`);
  return { ok: true };
}
