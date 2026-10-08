"use server";

/**
 * app/[locale]/admin/(club)/residents/actions.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Everything the unit drawer changes about a resident and their card.
 *
 * Two tiers, as agreed for ANDAMAN CLUB:
 *   SALES+  record a transfer, mark printed, record handover, add/remove a
 *           household member, edit the OTP e-mail, reveal the phone, send
 *           the backup house code — day-to-day work at the sales office.
 *   ADMIN+  reissue a card, sign devices out, record a resale — each kills
 *           a printed card or a resident's sessions, so one rank higher.
 * (Single QR downloads and the project ZIP are route handlers under
 * app/api/admin/club, with the same split.)
 *
 * Every change that touches a resident writes a CardEvent: the drawer's
 * access log is how the office answers "who did what to my card".
 * Errors come back as message keys under clubResidents.errors.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { locales } from "@/i18n";
import { requireAdminAction } from "@/lib/admin/guard";
import { sendClubEmail } from "@/lib/email";
import { maskEmail } from "@/lib/contact-mask";
import { HANDOVER_METHODS, MAX_HOUSEHOLD_MEMBERS, MEMBER_RELATIONS, PROGRAM_NAME } from "@/lib/club/constants";
import { logCardEvent, reissueCard } from "@/lib/club/cards";
import { newCardToken, newHouseCode } from "@/lib/club/token";

export type ResidentActionResult = { ok: true; value?: string } | { ok: false; error: string };

const fail = (error: string): ResidentActionResult => ({ ok: false, error });

function refresh() {
  for (const locale of locales) revalidatePath(`/${locale}/admin/residents`);
}

/** Guards throw; the drawer wants a message instead of an error page. */
async function guard(minimum: Role) {
  try {
    return await requireAdminAction(minimum);
  } catch {
    return null;
  }
}

const id = z.string().min(10).max(40).regex(/^[a-z0-9]+$/);
const email = z.string().trim().toLowerCase().email().max(254);
const phone = z.string().trim().min(6).max(30).regex(/^[+0-9()\-\s.]+$/);
const nationality = z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/);
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  /* Noon in Phuket, so the date never slips a day in any time zone the
     server or a viewer is in. */
  .transform((value) => new Date(`${value}T12:00:00+07:00`))
  .refine((value) => !Number.isNaN(value.getTime()));
const text = (key: string, form: FormData) => String(form.get(key) ?? "");

// ── Record transfer (SOLD → TRANSFERRED) ───────────────────────────────

const transferSchema = z.object({
  ownerName: z.string().trim().min(2).max(120),
  nationality,
  phone,
  email: z.union([z.literal(""), email]),
  transferDate: isoDate,
  purpose: z.string().trim().max(60),
});

export async function recordTransfer(unitId: string, _prev: ResidentActionResult | null, form: FormData): Promise<ResidentActionResult> {
  const session = await guard(Role.SALES);
  if (!session) return fail("forbidden");
  if (!id.safeParse(unitId).success) return fail("invalid");

  const parsed = transferSchema.safeParse({
    ownerName: text("ownerName", form),
    nationality: text("nationality", form) || "TH",
    phone: text("phone", form),
    email: text("email", form),
    transferDate: text("transferDate", form),
    purpose: text("purpose", form),
  });
  if (!parsed.success) return fail(`field.${String(parsed.error.issues[0]?.path[0] ?? "invalid")}`);
  const input = parsed.data;

  const unit = await prisma.projectUnit.findUnique({
    where: { id: unitId },
    select: { id: true, status: true, unitNumber: true, project: { select: { cardCode: true } }, resident: { select: { id: true } } },
  });
  if (!unit) return fail("notFound");
  if (unit.resident) return fail("alreadyResident");
  if (unit.status !== "SOLD") return fail("notSold");
  const cardCode = unit.project.cardCode;
  if (!cardCode) return fail("noCardCode");

  await prisma.$transaction(async (tx) => {
    const resident = await tx.resident.create({
      data: {
        unitId,
        ownerName: input.ownerName,
        nationality: input.nationality,
        phone: input.phone,
        email: input.email || null,
        transferDate: input.transferDate,
        purpose: input.purpose || null,
        houseCode: newHouseCode(cardCode, unit.unitNumber),
      },
    });
    await tx.residentCard.create({ data: { residentId: resident.id, token: newCardToken(), version: 1, issuedAt: new Date() } });
    await tx.projectUnit.update({ where: { id: unitId }, data: { status: "TRANSFERRED" } });
  });

  refresh();
  return { ok: true };
}

// ── Card status ─────────────────────────────────────────────────────────

export async function markCardPrinted(cardId: string): Promise<ResidentActionResult> {
  const session = await guard(Role.SALES);
  if (!session) return fail("forbidden");
  if (!id.safeParse(cardId).success) return fail("invalid");

  const card = await prisma.residentCard.findUnique({ where: { id: cardId } });
  if (!card || card.revokedAt) return fail("notFound");
  if (card.status !== "NONE") return { ok: true };

  await prisma.residentCard.update({ where: { id: cardId }, data: { status: "PRINTED", printedAt: new Date() } });
  await logCardEvent(card.residentId, "CARD_PRINTED", session.name);
  refresh();
  return { ok: true };
}

const handoverSchema = z.object({
  handedTo: z.string().trim().min(2).max(120),
  handedAt: isoDate,
  method: z.enum(HANDOVER_METHODS),
});

/** The receiver's ID card is checked at the counter but never recorded. */
export async function recordHandover(cardId: string, _prev: ResidentActionResult | null, form: FormData): Promise<ResidentActionResult> {
  const session = await guard(Role.SALES);
  if (!session) return fail("forbidden");
  if (!id.safeParse(cardId).success) return fail("invalid");

  const parsed = handoverSchema.safeParse({
    handedTo: text("handedTo", form),
    handedAt: text("handedAt", form),
    method: text("method", form),
  });
  if (!parsed.success) return fail(`field.${String(parsed.error.issues[0]?.path[0] ?? "invalid")}`);

  const card = await prisma.residentCard.findUnique({ where: { id: cardId } });
  if (!card || card.revokedAt) return fail("notFound");

  await prisma.residentCard.update({
    where: { id: cardId },
    data: {
      status: "HANDED",
      printedAt: card.printedAt ?? new Date(),
      handedAt: parsed.data.handedAt,
      handedTo: parsed.data.handedTo,
      handoverMethod: parsed.data.method,
      handedBy: session.name,
    },
  });
  await logCardEvent(card.residentId, "CARD_HANDED", session.name);
  refresh();
  return { ok: true };
}

// ── Contact details ─────────────────────────────────────────────────────

/** The full number, once, logged. Not cached anywhere on the client. */
export async function revealResidentPhone(residentId: string): Promise<ResidentActionResult> {
  const session = await guard(Role.SALES);
  if (!session) return fail("forbidden");
  if (!id.safeParse(residentId).success) return fail("invalid");

  const resident = await prisma.resident.findUnique({ where: { id: residentId }, select: { phone: true } });
  if (!resident) return fail("notFound");
  await logCardEvent(residentId, "PHONE_REVEALED", session.name);
  return { ok: true, value: resident.phone };
}

/**
 * The OTP address is the key to the portal, so a change is announced to
 * the old address: if someone talked the office into it, the owner hears.
 */
export async function updateResidentEmail(residentId: string, _prev: ResidentActionResult | null, form: FormData): Promise<ResidentActionResult> {
  const session = await guard(Role.SALES);
  if (!session) return fail("forbidden");
  if (!id.safeParse(residentId).success) return fail("invalid");

  const parsed = email.safeParse(text("email", form));
  if (!parsed.success) return fail("field.email");
  const next = parsed.data;

  const resident = await prisma.resident.findUnique({ where: { id: residentId }, include: { members: { select: { email: true } } } });
  if (!resident) return fail("notFound");
  if (resident.email === next) return { ok: true };
  if (resident.members.some((m) => m.email === next)) return fail("emailIsMember");

  await prisma.resident.update({ where: { id: residentId }, data: { email: next } });
  await logCardEvent(residentId, "EMAIL_CHANGED", session.name);

  if (resident.email) {
    await sendClubEmail({
      to: resident.email,
      subject: `${PROGRAM_NAME} · อีเมลรับรหัสเข้าใช้ถูกเปลี่ยน / Sign-in e-mail changed`,
      text:
        `อีเมลสำหรับรับรหัส OTP ของบ้านคุณถูกเปลี่ยนเป็น ${maskEmail(next)} โดยเจ้าหน้าที่ Andaman Asset Solution\n` +
        `หากคุณไม่ได้ขอเปลี่ยน กรุณาติดต่อสำนักงานขายทันที\n\n` +
        `The e-mail that receives your sign-in codes was changed to ${maskEmail(next)} by Andaman Asset Solution staff.\n` +
        `If you did not ask for this, please contact the sales office right away.`,
      html:
        `<p>อีเมลสำหรับรับรหัส OTP ของบ้านคุณถูกเปลี่ยนเป็น <b>${maskEmail(next)}</b> โดยเจ้าหน้าที่ Andaman Asset Solution<br>หากคุณไม่ได้ขอเปลี่ยน กรุณาติดต่อสำนักงานขายทันที</p>` +
        `<p>The e-mail that receives your sign-in codes was changed to <b>${maskEmail(next)}</b> by Andaman Asset Solution staff.<br>If you did not ask for this, please contact the sales office right away.</p>`,
    });
  }

  refresh();
  return { ok: true };
}

/** Sends the backup house code to the owner's e-mail (it still needs an OTP). */
export async function sendBackupCode(residentId: string): Promise<ResidentActionResult> {
  const session = await guard(Role.SALES);
  if (!session) return fail("forbidden");
  if (!id.safeParse(residentId).success) return fail("invalid");

  const resident = await prisma.resident.findUnique({ where: { id: residentId }, select: { email: true, houseCode: true } });
  if (!resident) return fail("notFound");
  if (!resident.email) return fail("noEmail");

  await sendClubEmail({
    to: resident.email,
    subject: `${PROGRAM_NAME} · รหัสประจำบ้าน / House code`,
    text:
      `รหัสประจำบ้านของคุณ: ${resident.houseCode}\nใช้เข้าพอร์ทัลลูกบ้านเมื่อไม่มีบัตร ระบบจะส่งรหัส OTP มาที่อีเมลนี้อีกครั้ง\n\n` +
      `Your house code: ${resident.houseCode}\nUse it to sign in to the resident portal without your card; a one-time code will still be sent to this e-mail.`,
    html:
      `<p>รหัสประจำบ้านของคุณ: <b style="font-family:monospace">${resident.houseCode}</b><br>ใช้เข้าพอร์ทัลลูกบ้านเมื่อไม่มีบัตร ระบบจะส่งรหัส OTP มาที่อีเมลนี้อีกครั้ง</p>` +
      `<p>Your house code: <b style="font-family:monospace">${resident.houseCode}</b><br>Use it to sign in to the resident portal without your card; a one-time code will still be sent to this e-mail.</p>`,
  });
  return { ok: true, value: maskEmail(resident.email) };
}

// ── Household members ───────────────────────────────────────────────────

const memberSchema = z.object({
  name: z.string().trim().min(2).max(120),
  relation: z.enum(MEMBER_RELATIONS),
  email,
});

export async function addMember(residentId: string, _prev: ResidentActionResult | null, form: FormData): Promise<ResidentActionResult> {
  const session = await guard(Role.SALES);
  if (!session) return fail("forbidden");
  if (!id.safeParse(residentId).success) return fail("invalid");

  const parsed = memberSchema.safeParse({ name: text("name", form), relation: text("relation", form), email: text("email", form) });
  if (!parsed.success) return fail(`field.${String(parsed.error.issues[0]?.path[0] ?? "invalid")}`);
  const input = parsed.data;

  const resident = await prisma.resident.findUnique({ where: { id: residentId }, include: { members: { select: { email: true } } } });
  if (!resident) return fail("notFound");
  if (resident.members.length >= MAX_HOUSEHOLD_MEMBERS) return fail("membersFull");
  if (resident.email === input.email || resident.members.some((m) => m.email === input.email)) return fail("emailTaken");

  await prisma.residentMember.create({ data: { residentId, name: input.name, relation: input.relation, email: input.email, addedBy: session.name } });
  await logCardEvent(residentId, "MEMBER_ADDED", session.name);

  const note = (who: string) => ({
    subject: `${PROGRAM_NAME} · เพิ่มผู้มีสิทธิ์เข้าใช้ / Household member added`,
    text:
      `${who}\n${input.name} ถูกเพิ่มเป็นผู้มีสิทธิ์เข้าใช้พอร์ทัลลูกบ้าน รับรหัส OTP ที่ ${maskEmail(input.email)}\n` +
      `${input.name} was added to the resident portal and will receive sign-in codes at ${maskEmail(input.email)}.\n` +
      `หากไม่ถูกต้อง กรุณาติดต่อสำนักงานขาย / If this is wrong, please contact the sales office.`,
  });
  const mails = [{ to: input.email, ...note(`เรียน ${input.name} / Dear ${input.name},`) }];
  if (resident.email) mails.push({ to: resident.email, ...note(`เรียน ${resident.ownerName} / Dear ${resident.ownerName},`) });
  await Promise.all(mails.map((m) => sendClubEmail({ to: m.to, subject: m.subject, text: m.text, html: `<p>${m.text.replace(/\n/g, "<br>")}</p>` })));

  refresh();
  return { ok: true };
}

/** Removing a member also signs their devices out at once. */
export async function removeMember(memberId: string): Promise<ResidentActionResult> {
  const session = await guard(Role.SALES);
  if (!session) return fail("forbidden");
  if (!id.safeParse(memberId).success) return fail("invalid");

  const member = await prisma.residentMember.findUnique({ where: { id: memberId } });
  if (!member) return fail("notFound");

  await prisma.$transaction([
    prisma.trustedDevice.updateMany({ where: { residentId: member.residentId, memberId, revokedAt: null }, data: { revokedAt: new Date() } }),
    prisma.residentMember.delete({ where: { id: memberId } }),
  ]);
  await logCardEvent(member.residentId, "MEMBER_REMOVED", session.name);
  refresh();
  return { ok: true };
}

// ── ADMIN+: reissue, sign-out, resale ───────────────────────────────────

/** Lost card: version n+1, old QR and house code dead, every device out. */
export async function reissueResidentCard(residentId: string): Promise<ResidentActionResult> {
  const session = await guard(Role.ADMIN);
  if (!session) return fail("forbidden");
  if (!id.safeParse(residentId).success) return fail("invalid");

  const exists = await prisma.resident.count({ where: { id: residentId } });
  if (!exists) return fail("notFound");
  await prisma.$transaction((tx) => reissueCard(residentId, session.name, tx));
  refresh();
  return { ok: true };
}

export async function signOutDevice(deviceId: string): Promise<ResidentActionResult> {
  const session = await guard(Role.ADMIN);
  if (!session) return fail("forbidden");
  if (!id.safeParse(deviceId).success) return fail("invalid");

  const device = await prisma.trustedDevice.findUnique({ where: { id: deviceId } });
  if (!device) return fail("notFound");
  await prisma.trustedDevice.update({ where: { id: deviceId }, data: { revokedAt: new Date() } });
  await logCardEvent(device.residentId, "SIGN_OUT_DEVICE", session.name, { device: device.label });
  refresh();
  return { ok: true };
}

export async function signOutAllDevices(residentId: string): Promise<ResidentActionResult> {
  const session = await guard(Role.ADMIN);
  if (!session) return fail("forbidden");
  if (!id.safeParse(residentId).success) return fail("invalid");

  await prisma.trustedDevice.updateMany({ where: { residentId, revokedAt: null }, data: { revokedAt: new Date() } });
  await logCardEvent(residentId, "SIGN_OUT_ALL", session.name);
  refresh();
  return { ok: true };
}

const resaleSchema = z.object({
  ownerName: z.string().trim().min(2).max(120),
  nationality,
  phone,
  email,
  transferDate: isoDate,
  documentsChecked: z.literal("on"),
});

/**
 * Change of owner, all or nothing. The previous owner keeps a name-and-
 * dates row (ResidentOwnership); their phone, e-mail, household, devices,
 * OTPs and access log go (PDPA). The card is reissued, and per-house
 * benefit tweaks made for the old owner are reset to the project default.
 */
export async function recordResale(unitId: string, _prev: ResidentActionResult | null, form: FormData): Promise<ResidentActionResult> {
  const session = await guard(Role.ADMIN);
  if (!session) return fail("forbidden");
  if (!id.safeParse(unitId).success) return fail("invalid");

  const parsed = resaleSchema.safeParse({
    ownerName: text("ownerName", form),
    nationality: text("nationality", form) || "TH",
    phone: text("phone", form),
    email: text("email", form),
    transferDate: text("transferDate", form),
    documentsChecked: text("documentsChecked", form),
  });
  if (!parsed.success) return fail(`field.${String(parsed.error.issues[0]?.path[0] ?? "invalid")}`);
  const input = parsed.data;

  const resident = await prisma.resident.findUnique({ where: { unitId } });
  if (!resident) return fail("notFound");

  await prisma.$transaction(async (tx) => {
    await tx.residentOwnership.create({
      data: {
        residentId: resident.id,
        ownerName: resident.ownerName,
        nationality: resident.nationality,
        fromDate: resident.transferDate,
        toDate: input.transferDate,
        recordedBy: session.name,
      },
    });
    await tx.resident.update({
      where: { id: resident.id },
      data: {
        ownerName: input.ownerName,
        nationality: input.nationality,
        phone: input.phone,
        email: input.email,
        transferDate: input.transferDate,
        purpose: null,
        termsVersion: null,
        termsAcceptedAt: null,
        lastLoginAt: null,
      },
    });
    await tx.residentMember.deleteMany({ where: { residentId: resident.id } });
    await tx.residentOtp.deleteMany({ where: { residentId: resident.id } });
    await tx.cardEvent.deleteMany({ where: { residentId: resident.id } });
    await tx.trustedDevice.deleteMany({ where: { residentId: resident.id } });
    await reissueCard(resident.id, session.name, tx);
    await tx.partnerUnitOverride.deleteMany({ where: { unitId } });
    await tx.partnerOverrideRequest.updateMany({
      where: { unitId, status: "PENDING" },
      data: { status: "CANCELLED", decidedById: session.id, decidedByName: session.name, decidedAt: new Date(), reason: "resale" },
    });
    await logCardEvent(resident.id, "RESALE", session.name, {}, tx);
  });

  refresh();
  return { ok: true };
}
