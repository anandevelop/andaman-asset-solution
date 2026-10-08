"use server";

/**
 * app/[locale]/admin/(club)/partners/actions.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Partner master data (SUPER_ADMIN / ADMIN) and the per-house benefit
 * requests (every CRM role; the role rule itself lives in
 * lib/club/admin-partners.ts so the unit drawer and the approvals tab
 * cannot disagree).
 * ─────────────────────────────────────────────────────────────────────────
 */

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isValidPct, parsePct } from "@/lib/club/benefits";
import { PARTNER_CATEGORIES } from "@/lib/club/constants";
import {
  NOTE_LOCALES,
  approveAllBenefitRequests,
  cancelBenefitRequest,
  clubProjects,
  decideBenefitRequest,
  requestBenefitChange,
  requireClubAction,
  resetUnitBenefits,
  type BenefitResult,
} from "@/lib/club/admin-partners";

export type ActionResult = { ok: true; count?: number; failed?: number } | { ok: false; error: string; cap?: number };

function revalidateClub(locale: string) {
  revalidatePath(`/${locale}/admin/partners`);
  revalidatePath(`/${locale}/admin/residents`);
}

/** Any thrown guard error becomes FORBIDDEN instead of an error page. */
async function guarded<T extends ActionResult | BenefitResult>(run: () => Promise<T>): Promise<T | ActionResult> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof Error && /UNAUTHORISED|TWO_FACTOR/.test(error.message)) return { ok: false, error: "FORBIDDEN" };
    console.error("[club/partners]", error);
    return { ok: false, error: "generic" };
  }
}

/* ── Inline edits in the partner table ─────────────────────────────────── */

export async function setPartnerPct(locale: string, partnerId: string, raw: string): Promise<ActionResult> {
  return guarded(async () => {
    await requireClubAction(Role.ADMIN);
    const pct = parsePct(raw);
    if (pct !== null && !isValidPct(pct)) return { ok: false, error: "range" } as const;
    await prisma.partner.update({ where: { id: partnerId }, data: { discountPct: pct } });
    // Overrides above the new default stay as they are: the portal shows
    // min(override, default), and the unit drawer flags them red.
    const lowered = pct
      ? await prisma.partnerUnitOverride.count({ where: { partnerId, discountPct: { gt: pct } } })
      : 0;
    revalidateClub(locale);
    return { ok: true, count: lowered } as const;
  });
}

export async function togglePartnerProject(locale: string, partnerId: string, projectId: string): Promise<ActionResult> {
  return guarded(async () => {
    await requireClubAction(Role.ADMIN);
    const links = await prisma.partnerProject.findMany({ where: { partnerId }, select: { projectId: true } });
    const on = links.some((link) => link.projectId === projectId);
    if (on) {
      if (links.length <= 1) return { ok: false, error: "atLeastOne" } as const;
      await prisma.partnerProject.delete({ where: { partnerId_projectId: { partnerId, projectId } } });
    } else {
      const project = await prisma.project.findFirst({ where: { id: projectId, cardCode: { not: null } }, select: { id: true } });
      if (!project) return { ok: false, error: "NOT_FOUND" } as const;
      await prisma.partnerProject.create({ data: { partnerId, projectId } });
    }
    revalidateClub(locale);
    return { ok: true } as const;
  });
}

export async function setPartnerActive(locale: string, partnerId: string, active: boolean): Promise<ActionResult> {
  return guarded(async () => {
    await requireClubAction(Role.ADMIN);
    await prisma.partner.update({ where: { id: partnerId }, data: { isActive: active } });
    revalidateClub(locale);
    return { ok: true } as const;
  });
}

/* ── The partner drawer form ───────────────────────────────────────────── */

export type PartnerFormState = { ok: boolean; message?: string; fields?: Record<string, string>; id?: string };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL = z.string().email();
const categoryKeys = PARTNER_CATEGORIES.map((c) => c.key) as [string, ...string[]];

const lines = (value: string) =>
  value
    .split(/\r?\n|,/)
    .map((line) => line.trim())
    .filter(Boolean);

function toDate(value: string): Date | null {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

export async function savePartner(
  locale: string,
  partnerId: string | null,
  _previous: PartnerFormState,
  formData: FormData,
): Promise<PartnerFormState> {
  const t = await getTranslations({ locale, namespace: "clubPartners" });
  try {
    await requireClubAction(Role.ADMIN);
  } catch {
    return { ok: false, message: t("errors.FORBIDDEN") };
  }

  const text = (key: string) => ((formData.get(key) as string | null) ?? "").trim();
  const schema = z
    .object({
      name: z.string().min(1, t("formErrors.name")).max(120, t("formErrors.tooLong")),
      category: z.enum(categoryKeys, { message: t("formErrors.category") }),
      area: z.string().max(120, t("formErrors.tooLong")),
      pct: z.string().refine((v) => v === "" || isValidPct(Number(v)), t("formErrors.pct")),
      note: z.string().max(80, t("formErrors.tooLong")),
      noteEn: z.string().max(80, t("formErrors.tooLong")),
      noteZh: z.string().max(80, t("formErrors.tooLong")),
      noteRu: z.string().max(80, t("formErrors.tooLong")),
      validFrom: z.string().refine((v) => v === "" || DATE.test(v), t("formErrors.date")),
      validTo: z.string().refine((v) => v === "" || DATE.test(v), t("formErrors.date")),
      phones: z.array(z.string().max(40, t("formErrors.tooLong"))).max(10),
      contactName: z.string().max(120, t("formErrors.tooLong")),
      emails: z.array(z.string()).max(10),
      website: z.string().max(300, t("formErrors.tooLong")),
      coverImage: z.string().max(1000),
      isActive: z.boolean(),
      projectIds: z.array(z.string()).min(1, t("formErrors.projects")),
    })
    .superRefine((value, ctx) => {
      const bad = value.emails.filter((email) => !EMAIL.safeParse(email).success);
      if (bad.length) ctx.addIssue({ code: "custom", path: ["emails"], message: t("formErrors.emails", { list: bad.join(", ") }) });
      if (value.validFrom && value.validTo && value.validTo < value.validFrom) {
        ctx.addIssue({ code: "custom", path: ["validTo"], message: t("formErrors.dates") });
      }
      if (value.website) {
        try {
          const url = new URL(value.website);
          if (!/^https?:$/.test(url.protocol)) throw new Error("protocol");
        } catch {
          ctx.addIssue({ code: "custom", path: ["website"], message: t("formErrors.website") });
        }
      }
    });

  let website = text("website");
  if (website && !/^https?:\/\//i.test(website)) website = `https://${website}`;

  const parsed = schema.safeParse({
    name: text("name"),
    category: text("category"),
    area: text("area"),
    pct: text("pct"),
    note: text("note"),
    noteEn: text("note_en"),
    noteZh: text("note_zh"),
    noteRu: text("note_ru"),
    validFrom: text("validFrom"),
    validTo: text("validTo"),
    phones: lines(text("phones")),
    contactName: text("contactName"),
    emails: lines(text("emails")).map((email) => email.toLowerCase()),
    website,
    coverImage: text("coverImage"),
    isActive: formData.get("isActive") === "on",
    projectIds: formData.getAll("projectIds").map(String).filter(Boolean),
  });
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      fields[key] ??= issue.message;
    }
    return { ok: false, fields };
  }
  const v = parsed.data;

  const allowed = new Set((await clubProjects()).map((project) => project.id));
  const projectIds = v.projectIds.filter((id) => allowed.has(id));
  if (!projectIds.length) return { ok: false, fields: { projectIds: t("formErrors.projects") } };

  const data = {
    name: v.name,
    category: v.category,
    area: v.area || null,
    discountPct: v.pct ? Number(v.pct) : null,
    discountNote: v.note || null,
    phones: v.phones,
    contactName: v.contactName || null,
    emails: v.emails,
    website: v.website || null,
    coverImage: v.coverImage || null,
    isActive: v.isActive,
    validFrom: toDate(v.validFrom),
    validTo: toDate(v.validTo),
  };
  const notes: Record<(typeof NOTE_LOCALES)[number], string> = { en: v.noteEn, zh: v.noteZh, ru: v.noteRu };

  try {
    const id = await prisma.$transaction(async (tx) => {
      const partner = partnerId
        ? await tx.partner.update({ where: { id: partnerId }, data })
        : await tx.partner.create({ data });
      for (const code of NOTE_LOCALES) {
        if (notes[code]) {
          await tx.partnerTranslation.upsert({
            where: { partnerId_locale: { partnerId: partner.id, locale: code } },
            update: { discountNote: notes[code] },
            create: { partnerId: partner.id, locale: code, discountNote: notes[code] },
          });
        } else {
          await tx.partnerTranslation.deleteMany({ where: { partnerId: partner.id, locale: code } });
        }
      }
      await tx.partnerProject.deleteMany({ where: { partnerId: partner.id, projectId: { notIn: projectIds } } });
      await tx.partnerProject.createMany({
        data: projectIds.map((projectId) => ({ partnerId: partner.id, projectId })),
        skipDuplicates: true,
      });
      return partner.id;
    });
    revalidateClub(locale);
    return { ok: true, message: t("form.saved"), id };
  } catch (error) {
    console.error("[savePartner]", error);
    return { ok: false, message: t("errors.generic") };
  }
}

export async function deletePartner(locale: string, partnerId: string): Promise<ActionResult> {
  return guarded(async () => {
    await requireClubAction(Role.ADMIN);
    await prisma.partner.delete({ where: { id: partnerId } });
    revalidateClub(locale);
    return { ok: true } as const;
  });
}

/* ── Per-house benefits and approvals ──────────────────────────────────── */

export async function changeUnitBenefit(
  locale: string,
  unitId: string,
  partnerId: string,
  hidden: boolean,
  pct: number | null,
): Promise<BenefitResult | ActionResult> {
  return guarded(async () => {
    const session = await requireClubAction(Role.SALES);
    if (pct !== null && !Number.isInteger(pct)) return { ok: false, error: "range" } as const;
    const result = await requestBenefitChange(session, unitId, partnerId, { hidden, pct });
    if (result.ok) revalidateClub(locale);
    return result;
  });
}

export async function decideRequest(
  locale: string,
  requestId: string,
  approve: boolean,
  reason?: string,
): Promise<BenefitResult | ActionResult> {
  return guarded(async () => {
    const session = await requireClubAction(Role.SUPER_ADMIN);
    const result = await decideBenefitRequest(session, requestId, approve, reason?.slice(0, 300));
    if (result.ok) revalidateClub(locale);
    return result;
  });
}

export async function cancelRequest(locale: string, requestId: string): Promise<BenefitResult | ActionResult> {
  return guarded(async () => {
    const session = await requireClubAction(Role.SALES);
    const result = await cancelBenefitRequest(session, requestId);
    if (result.ok) revalidateClub(locale);
    return result;
  });
}

export async function approveAllRequests(locale: string, unitId?: string): Promise<ActionResult> {
  return guarded(async () => {
    const session = await requireClubAction(Role.SUPER_ADMIN);
    const { approved, failed } = await approveAllBenefitRequests(session, unitId);
    revalidateClub(locale);
    return { ok: true, count: approved, failed } as const;
  });
}

export async function resetUnit(locale: string, unitId: string): Promise<ActionResult> {
  return guarded(async () => {
    const session = await requireClubAction(Role.SALES);
    const { changed } = await resetUnitBenefits(session, unitId);
    revalidateClub(locale);
    return { ok: true, count: changed } as const;
  });
}
