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
import { requireAdminAction } from "@/lib/admin/guard";
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
    slug: text("slug"),
    titleEn: text("titleEn"),
    titleTh: text("titleTh"),
    descriptionEn: text("descriptionEn"),
    descriptionTh: text("descriptionTh"),
    location: text("location"),
    startsAt: text("startsAt"),
    endsAt: text("endsAt"),
    coverImageUrl: text("coverImageUrl"),
    capacity: text("capacity"),
    isPublished: formData.get("isPublished") === "on",
  };
}

function toPrismaData(input: ReturnType<typeof eventSchema.parse>) {
  return {
    ...input,
    capacity: input.capacity === null ? null : Math.round(input.capacity),
  };
}

function revalidateEvent(locale: string, slug: string) {
  revalidatePath(`/${locale}/admin/events`);
  revalidatePath(`/${locale}/admin`);
  for (const target of locales) {
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

  let created;
  try {
    created = await prisma.event.create({ data: toPrismaData(parsed.data) });
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

  const data = toPrismaData(parsed.data);

  // Guard against shrinking capacity under the existing bookings.
  if (data.capacity !== null) {
    const taken = await countTakenSeats(id);
    if (data.capacity < taken) {
      return { ok: false, message: "CAPACITY_BELOW_BOOKED", fields: { capacity: String(taken) } };
    }
  }

  try {
    const before = await prisma.event.findUnique({
      where: { id },
      select: { slug: true },
    });

    const updated = await prisma.event.update({ where: { id }, data });

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
