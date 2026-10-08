/**
 * lib/club/otp.ts — e-mail OTP for the resident portal.
 *
 * 6 digits, 10 minutes, single use. 5 wrong codes inside 15 minutes lock
 * the house for 15 minutes and are logged (OTP_LOCK) so sales can see it.
 * Counters live in the database, not process memory, so they survive a
 * restart and apply across instances.
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import { isEmailConfigured, sendClubEmail } from "@/lib/email";
import { maskEmail } from "@/lib/contact-mask";
import {
  OTP_LOCK_MINUTES,
  OTP_MAX_ATTEMPTS,
  OTP_MAX_SENDS_PER_HOUR,
  OTP_TTL_MINUTES,
  PROGRAM_NAME,
} from "./constants";
import { newOtpCode, sha256 } from "./token";
import { logCardEvent } from "./cards";

const MIN = 60_000;

export type OtpRequestResult =
  | { ok: true; maskedEmail: string }
  | { ok: false; reason: "noEmail" | "tooMany" | "locked" | "unknownEmail" };

export type OtpVerifyResult =
  | { ok: true }
  | { ok: false; reason: "wrong" | "expired" | "locked"; left?: number };

/** Every address allowed to receive this house's codes: owner + members. */
export async function householdEmails(residentId: string) {
  const resident = await prisma.resident.findUniqueOrThrow({
    where: { id: residentId },
    include: { members: { orderBy: { createdAt: "asc" } } },
  });
  return [
    ...(resident.email ? [{ email: resident.email, memberId: null as string | null, name: resident.ownerName, relation: "owner" }] : []),
    ...resident.members.map((m) => ({ email: m.email, memberId: m.id as string | null, name: m.name, relation: m.relation })),
  ];
}

async function isLocked(residentId: string): Promise<boolean> {
  const since = new Date(Date.now() - OTP_LOCK_MINUTES * MIN);
  const lock = await prisma.cardEvent.findFirst({ where: { residentId, kind: "OTP_LOCK", createdAt: { gte: since } } });
  return Boolean(lock);
}

export async function requestOtp(residentId: string, toEmail: string | null, locale: string, ip?: string | null): Promise<OtpRequestResult> {
  const recipients = await householdEmails(residentId);
  if (!recipients.length) return { ok: false, reason: "noEmail" };
  const target = toEmail ? recipients.find((r) => r.email === toEmail) : recipients[0];
  if (!target) return { ok: false, reason: "unknownEmail" };
  if (await isLocked(residentId)) return { ok: false, reason: "locked" };

  const sentLastHour = await prisma.residentOtp.count({
    where: { residentId, createdAt: { gte: new Date(Date.now() - 60 * MIN) } },
  });
  if (sentLastHour >= OTP_MAX_SENDS_PER_HOUR) return { ok: false, reason: "tooMany" };

  const code = newOtpCode();
  await prisma.residentOtp.create({
    data: { residentId, email: target.email, codeHash: sha256(code), expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * MIN) },
  });
  if (!isEmailConfigured() && process.env.NODE_ENV !== "production") {
    // Local development without SMTP: the only way to read the code.
    console.info(`[club] OTP for ${maskEmail(target.email)}: ${code}`);
  }
  await sendClubEmail({
    to: target.email,
    subject: `${PROGRAM_NAME} · ${code}`,
    ...otpEmailBody(code, locale),
  });
  await logCardEvent(residentId, "OTP_SENT", target.name, { ip });
  return { ok: true, maskedEmail: maskEmail(target.email) };
}

export async function verifyOtp(residentId: string, code: string, ip?: string | null): Promise<OtpVerifyResult & { email?: string }> {
  if (await isLocked(residentId)) return { ok: false, reason: "locked" };
  const otp = await prisma.residentOtp.findFirst({
    where: { residentId, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!otp || otp.expiresAt < new Date()) return { ok: false, reason: "expired" };

  if (sha256(code.trim()) !== otp.codeHash) {
    const attempts = otp.attempts + 1;
    await prisma.residentOtp.update({ where: { id: otp.id }, data: { attempts } });
    await logCardEvent(residentId, "OTP_FAIL", "resident", { ip });
    if (attempts >= OTP_MAX_ATTEMPTS) {
      await prisma.residentOtp.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });
      await logCardEvent(residentId, "OTP_LOCK", "system", { ip });
      return { ok: false, reason: "locked" };
    }
    return { ok: false, reason: "wrong", left: OTP_MAX_ATTEMPTS - attempts };
  }
  await prisma.residentOtp.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });
  return { ok: true, email: otp.email };
}

const OTP_COPY: Record<string, { lead: string; ttl: string; ignore: string }> = {
  th: { lead: "รหัสยืนยันเข้าสู่ ANDAMAN CLUB ของคุณคือ", ttl: `ใช้ได้ ${OTP_TTL_MINUTES} นาที ใช้ได้ครั้งเดียว`, ignore: "ถ้าคุณไม่ได้ขอรหัสนี้ ไม่ต้องทำอะไร บัญชีของคุณยังปลอดภัย" },
  en: { lead: "Your ANDAMAN CLUB verification code is", ttl: `Valid for ${OTP_TTL_MINUTES} minutes, single use.`, ignore: "If you did not ask for this code, you can ignore this e-mail." },
  zh: { lead: "您的 ANDAMAN CLUB 验证码是", ttl: `${OTP_TTL_MINUTES} 分钟内有效，仅可使用一次。`, ignore: "如果不是您本人申请，请忽略此邮件。" },
  ru: { lead: "Ваш код подтверждения ANDAMAN CLUB:", ttl: `Действует ${OTP_TTL_MINUTES} минут, однократно.`, ignore: "Если вы не запрашивали код, просто проигнорируйте письмо." },
};

function otpEmailBody(code: string, locale: string) {
  const c = OTP_COPY[locale] ?? OTP_COPY.en;
  const text = `${c.lead} ${code}\n${c.ttl}\n\n${c.ignore}`;
  const html = `<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:420px;margin:auto;padding:24px;color:#1d1d1f">
<p style="letter-spacing:.3em;font-size:11px;color:#8a6d3f;margin:0 0 18px">${PROGRAM_NAME}</p>
<p style="margin:0 0 10px">${c.lead}</p>
<p style="font-size:32px;letter-spacing:.3em;font-weight:600;margin:0 0 10px">${code}</p>
<p style="color:#6e6e73;font-size:13px;margin:0 0 18px">${c.ttl}</p>
<p style="color:#86868b;font-size:12px;margin:0">${c.ignore}</p></div>`;
  return { text, html };
}
