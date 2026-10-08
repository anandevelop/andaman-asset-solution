"use server";
/**
 * app/[locale]/club/actions.ts — the member portal's server actions.
 *
 * Every action re-checks who is asking: the pending sign-in cookie for the
 * OTP steps, the resident session for everything else. Household changes
 * are owner-only (session.memberId === null).
 */
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { escapeHtml, sendClubEmail } from "@/lib/email";
import { rateLimit } from "@/lib/rate-limit";
import { findCardByToken, logCardEvent } from "@/lib/club/cards";
import { MAX_HOUSEHOLD_MEMBERS, MEMBER_RELATIONS, PROGRAM_NAME } from "@/lib/club/constants";
import { householdEmails, requestOtp, verifyOtp } from "@/lib/club/otp";
import { clubBase, requestIp, requestUserAgent } from "@/lib/club/paths";
import { projectName } from "@/lib/club/portal";
import { deviceLabel, endSession, forgetThisDevice, getSession, rememberDevice, startSession } from "@/lib/club/session";
import {
  INSTALL_COOKIE,
  THEME_COOKIE,
  clearPendingSignIn,
  homeHref,
  readPendingSignIn,
  setPendingSignIn,
} from "@/lib/club/portal-actions-helpers";
import { CLUB_LOCALES } from "@/components/club/format";
import type { CodeState, MemberState, SendOtpState, VerifyOtpState } from "@/components/club/types";

const YEAR = 365 * 86_400;
const CODE_WINDOW_MS = 30 * 60_000;
const CODE_ATTEMPTS = 5;

function readLocale(formData: FormData): string {
  const value = String(formData.get("locale") ?? "");
  return (CLUB_LOCALES as readonly string[]).includes(value) ? value : "th";
}

const clientCookie = { sameSite: "lax" as const, path: "/", secure: process.env.NODE_ENV === "production" };

/* ── Theme ─────────────────────────────────────────────────────────────── */

export async function setThemeAction(formData: FormData): Promise<void> {
  const theme = String(formData.get("theme") ?? "");
  if (theme !== "dark" && theme !== "light" && theme !== "auto") return;
  (await cookies()).set(THEME_COOKIE, theme, { ...clientCookie, httpOnly: true, maxAge: YEAR });
  revalidatePath("/[locale]/club", "layout");
}

/* ── Card scan → "I'm a resident" ─────────────────────────────────────── */

/**
 * The status page posts the code and token here; the pending sign-in goes
 * into a signed cookie and the browser lands on /verify, so the token is
 * no longer in the address bar or the history entry the resident keeps.
 */
export async function claimScanAction(formData: FormData): Promise<void> {
  const locale = readLocale(formData);
  const base = await clubBase(locale);
  const card = await findCardByToken(String(formData.get("code") ?? ""), String(formData.get("token") ?? ""));
  if (!card || card.revokedAt) redirect(homeHref(base));
  await setPendingSignIn(card.residentId, "qr");
  redirect(`${base}/verify`);
}

/* ── House code ───────────────────────────────────────────────────────── */

export async function houseCodeAction(_prev: CodeState, formData: FormData): Promise<CodeState> {
  const locale = readLocale(formData);
  const code = String(formData.get("code") ?? "").trim().toUpperCase().replace(/\s+/g, "-");
  if (!/^[A-Z]{2,4}-[A-Z0-9]{1,10}-[A-Z0-9]{4}$/.test(code)) return { error: "format" };

  // Only misses count, per IP: a resident who types it right first time never gets closer to a lock.
  const key = `club-code:${(await requestIp()) ?? "unknown"}`;
  const limit = { limit: CODE_ATTEMPTS, windowMs: CODE_WINDOW_MS };
  if (!rateLimit(key, { ...limit, check: true }).ok) return { error: "locked" };

  const resident = await prisma.resident.findUnique({ where: { houseCode: code }, select: { id: true } });
  if (!resident) {
    const result = rateLimit(key, limit);
    return result.remaining > 0 ? { error: "notFound", left: result.remaining } : { error: "locked" };
  }
  await setPendingSignIn(resident.id, "code");
  redirect(`${await clubBase(locale)}/verify`);
}

/* ── OTP ──────────────────────────────────────────────────────────────── */

export async function sendOtpAction(_prev: SendOtpState, formData: FormData): Promise<SendOtpState> {
  const locale = readLocale(formData);
  const pending = await readPendingSignIn();
  if (!pending) return { error: "noPending" };
  const recipients = await householdEmails(pending.residentId);
  if (!recipients.length) return { error: "noEmail" };
  const target = recipients[Number(formData.get("to") ?? 0)] ?? recipients[0];
  const result = await requestOtp(pending.residentId, target.email, locale, await requestIp());
  return result.ok ? { sentTo: result.maskedEmail, at: Date.now() } : { error: result.reason };
}

export async function verifyOtpAction(_prev: VerifyOtpState, formData: FormData): Promise<VerifyOtpState> {
  const locale = readLocale(formData);
  const code = String(formData.get("otp") ?? "").replace(/\D/g, "");
  if (code.length !== 6) return { error: "format" };
  const pending = await readPendingSignIn();
  if (!pending) return { error: "noPending" };

  const ip = await requestIp();
  const result = await verifyOtp(pending.residentId, code, ip);
  if (!result.ok) return { error: result.reason, left: result.left };

  const residentId = pending.residentId;
  const who = (await householdEmails(residentId)).find((r) => r.email === result.email);
  const memberId = who?.memberId ?? null;
  const label = deviceLabel(await requestUserAgent());

  let deviceId: string | null = null;
  const remember = formData.get("remember") === "on";
  if (remember) deviceId = (await rememberDevice(residentId, memberId, label)).id;
  await startSession({ residentId, memberId, deviceId });

  await prisma.resident.update({ where: { id: residentId }, data: { lastLoginAt: new Date() } });
  const actor = who?.name ?? "resident";
  if (pending.via === "code") await logCardEvent(residentId, "CODE_LOGIN", actor, { device: label, ip });
  await logCardEvent(residentId, "OTP_OK", actor, { device: label, ip });
  await clearPendingSignIn();

  // Offer the home-screen icon once, after the first remembered sign-in on a device.
  const jar = await cookies();
  if (remember && jar.get(INSTALL_COOKIE)?.value !== "done") {
    jar.set(INSTALL_COOKIE, "show", { ...clientCookie, httpOnly: false, maxAge: YEAR });
  }
  redirect(homeHref(await clubBase(locale)));
}

/* ── Household ────────────────────────────────────────────────────────── */

const memberSchema = z.object({
  name: z.string().trim().min(1).max(80),
  relation: z.enum(MEMBER_RELATIONS),
  email: z.string().trim().toLowerCase().pipe(z.email().max(160)),
});

export async function addMemberAction(_prev: MemberState, formData: FormData): Promise<MemberState> {
  const locale = readLocale(formData);
  const session = await getSession();
  if (!session || session.memberId !== null) return { error: "ownerOnly", at: Date.now() };

  const parsed = memberSchema.safeParse({
    name: formData.get("name"),
    relation: formData.get("relation"),
    email: formData.get("email"),
  });
  if (!parsed.success) return { error: "invalid", at: Date.now() };
  const { name, relation, email } = parsed.data;

  const resident = await prisma.resident.findUnique({
    where: { id: session.residentId },
    include: { members: true, unit: { include: { project: { select: { nameEn: true, nameTh: true } } } } },
  });
  if (!resident) return { error: "ownerOnly", at: Date.now() };
  if (resident.members.length >= MAX_HOUSEHOLD_MEMBERS) return { error: "full", at: Date.now() };
  const taken = [resident.email, ...resident.members.map((m) => m.email)].some((e) => e?.toLowerCase() === email);
  if (taken) return { error: "duplicate", at: Date.now() };

  try {
    await prisma.residentMember.create({
      data: { residentId: resident.id, name, relation, email, addedBy: resident.ownerName },
    });
  } catch {
    // @@unique([residentId, email]) — a double submit or a race.
    return { error: "duplicate", at: Date.now() };
  }
  await logCardEvent(resident.id, "MEMBER_ADDED", resident.ownerName);

  const t = await getTranslations({ locale, namespace: "club" });
  const house = `${projectName(resident.unit.project, locale)} · ${resident.unit.unitNumber}`;
  const memberText = t("email.memberBody", { owner: resident.ownerName, house });
  await sendClubEmail({ to: email, subject: `${PROGRAM_NAME} · ${t("email.memberSubject")}`, text: memberText, html: mailHtml(memberText) });
  if (resident.email) {
    const ownerText = t("email.ownerBody", { name, email, house });
    await sendClubEmail({ to: resident.email, subject: `${PROGRAM_NAME} · ${t("email.ownerSubject")}`, text: ownerText, html: mailHtml(ownerText) });
  }

  revalidatePath("/[locale]/club/account", "page");
  return { ok: true, at: Date.now() };
}

export async function removeMemberAction(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session || session.memberId !== null) return;
  const memberId = String(formData.get("memberId") ?? "");
  const member = await prisma.residentMember.findFirst({ where: { id: memberId, residentId: session.residentId } });
  if (!member) return;
  const resident = await prisma.resident.findUniqueOrThrow({ where: { id: session.residentId }, select: { ownerName: true } });

  await prisma.$transaction(async (tx) => {
    await tx.residentMember.delete({ where: { id: member.id } });
    // Their remembered phones stop working at once, and a code already in their inbox dies too.
    await tx.trustedDevice.updateMany({ where: { residentId: session.residentId, memberId: member.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await tx.residentOtp.updateMany({ where: { residentId: session.residentId, email: member.email, consumedAt: null }, data: { consumedAt: new Date() } });
    await logCardEvent(session.residentId, "MEMBER_REMOVED", resident.ownerName, {}, tx);
  });
  revalidatePath("/[locale]/club/account", "page");
}

/* ── Sign out ─────────────────────────────────────────────────────────── */

export async function signOutAction(formData: FormData): Promise<void> {
  const locale = readLocale(formData);
  await forgetThisDevice();
  await endSession();
  redirect(homeHref(await clubBase(locale)));
}

function mailHtml(text: string): string {
  return `<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:440px;margin:auto;padding:24px;color:#1d1d1f">
<p style="letter-spacing:.3em;font-size:11px;color:#8a6d3f;margin:0 0 18px">${PROGRAM_NAME}</p>
<p style="margin:0;line-height:1.6">${escapeHtml(text)}</p></div>`;
}
