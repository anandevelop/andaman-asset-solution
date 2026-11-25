"use server";

/**
 * app/[locale]/admin/(company)/careers/actions.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Everything HR can change: an application's status and notes, erasing
 * one, the positions on offer, and the module's settings.
 *
 * Each action checks manageCareers itself. They are plain form actions:
 * they finish by redirecting back to the page that posted them, so the
 * forms work without any client code.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { JobApplicationStatus } from "@prisma/client";
import { locales, type Locale } from "@/i18n";
import { requireCapabilityAction } from "@/lib/admin/guard";
import { revalidatePublicSite } from "@/lib/revalidate-site";
import { recordApplicationErasure } from "@/lib/audit/events";
import { addNote, eraseApplication, setStatus } from "@/lib/careers/applications";
import { saveCareersConfig } from "@/lib/careers/config";
import { EMPLOYMENT_TYPES, RETENTION_CHOICES } from "@/lib/careers/fields";
import { deletePosition, movePosition, savePosition, setPositionOpen } from "@/lib/careers/positions";

const text = (formData: FormData, key: string) => ((formData.get(key) as string | null) ?? "").trim();

const applicationsPath = (locale: string) => `/${locale}/admin/careers`;
const positionsPath = (locale: string) => `/${locale}/admin/careers/positions`;

/** Where the list was — status tab, search — so an action returns there. */
function backTo(locale: string, returnQuery: string, open?: string) {
  const query = new URLSearchParams(returnQuery);
  query.delete("open");
  if (open) query.set("open", open);
  const qs = query.toString();
  return qs ? `${applicationsPath(locale)}?${qs}` : applicationsPath(locale);
}

/* ── Applications ───────────────────────────────────────────────────── */

export async function setApplicationStatusAction(locale: string, id: string, formData: FormData) {
  await requireCapabilityAction("manageCareers");

  const status = z.nativeEnum(JobApplicationStatus).safeParse(text(formData, "status"));
  if (status.success) await setStatus(id, status.data);

  revalidatePath(applicationsPath(locale));
  redirect(backTo(locale, text(formData, "return"), id));
}

export async function addApplicationNoteAction(locale: string, id: string, formData: FormData) {
  const session = await requireCapabilityAction("manageCareers");

  const body = text(formData, "body").slice(0, 2000);
  if (body) await addNote(id, { id: session.id, name: session.name }, body);

  redirect(backTo(locale, text(formData, "return"), id));
}

export async function eraseApplicationAction(locale: string, id: string, returnQuery: string) {
  const session = await requireCapabilityAction("manageCareers");

  if (await eraseApplication(id)) {
    await recordApplicationErasure({ actor: session, applicationId: id });
  }

  revalidatePath(applicationsPath(locale));
  redirect(backTo(locale, returnQuery));
}

/* ── Positions ──────────────────────────────────────────────────────── */

/** Positions are on the About page, which is cached. */
function positionsChanged(locale: string) {
  revalidatePath(positionsPath(locale));
  revalidatePublicSite();
}

export async function savePositionAction(locale: string, id: string | null, formData: FormData) {
  await requireCapabilityAction("manageCareers");

  const translations: Partial<Record<Locale, { title: string; location: string; summary: string }>> = {};
  for (const code of locales) {
    translations[code] = {
      title: text(formData, `title.${code}`).slice(0, 160),
      location: text(formData, `location.${code}`).slice(0, 160),
      summary: text(formData, `summary.${code}`).slice(0, 1200),
    };
  }

  // A position nobody can name cannot be listed or applied for.
  if (!Object.values(translations).some((entry) => entry?.title)) {
    redirect(`${positionsPath(locale)}?edit=${id ?? "new"}&error=title`);
  }

  const type = z.enum(EMPLOYMENT_TYPES).safeParse(text(formData, "employmentType"));
  await savePosition(id, {
    employmentType: type.success ? type.data : "full_time",
    isOpen: formData.get("isOpen") === "on",
    translations,
  });

  positionsChanged(locale);
  redirect(`${positionsPath(locale)}?saved=1`);
}

export async function togglePositionAction(locale: string, id: string, isOpen: boolean) {
  await requireCapabilityAction("manageCareers");
  await setPositionOpen(id, isOpen);
  positionsChanged(locale);
}

export async function movePositionAction(locale: string, id: string, direction: "up" | "down") {
  await requireCapabilityAction("manageCareers");
  await movePosition(id, direction);
  positionsChanged(locale);
}

export async function deletePositionAction(locale: string, id: string) {
  await requireCapabilityAction("manageCareers");
  await deletePosition(id);
  positionsChanged(locale);
  redirect(positionsPath(locale));
}

/* ── Settings ───────────────────────────────────────────────────────── */

export async function saveCareersSettingsAction(locale: string, formData: FormData) {
  const session = await requireCapabilityAction("manageCareers");

  const email = text(formData, "notifyEmail");
  if (!z.string().email().max(160).safeParse(email).success) {
    redirect(`${positionsPath(locale)}?error=email#settings`);
  }

  const months = Number(text(formData, "retentionMonths"));
  const copy: Partial<Record<Locale, { title: string; intro: string }>> = {};
  for (const code of locales) {
    copy[code] = {
      title: text(formData, `inviteTitle.${code}`).slice(0, 160),
      intro: text(formData, `inviteIntro.${code}`).slice(0, 800),
    };
  }

  await saveCareersConfig(
    {
      copy,
      notifyEmail: email,
      ...((RETENTION_CHOICES as readonly number[]).includes(months) ? { retentionMonths: months } : {}),
    },
    session.id,
  );

  positionsChanged(locale);
  redirect(`${positionsPath(locale)}?saved=1#settings`);
}
