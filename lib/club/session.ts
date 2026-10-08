/**
 * lib/club/session.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The resident's session — completely separate from staff NextAuth.
 *
 * Two host-only cookies on member.andamanassetsolution.com:
 *   club_s  signed {resident, member, device, expiry}; 12 h; httpOnly.
 *   club_d  a random device secret; only its SHA-256 is stored
 *           (TrustedDevice.tokenHash). 90 days, sliding from last use.
 *
 * A resident session can never authorise an admin route and a staff
 * session is ignored here: different cookie names, a different secret
 * (CLUB_SESSION_SECRET, falling back to NEXTAUTH_SECRET + a suffix), and
 * no shared code path.
 * ─────────────────────────────────────────────────────────────────────────
 */
import "server-only";
import { createHmac } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { TRUSTED_DEVICE_DAYS } from "./constants";
import { newDeviceSecret, sha256, safeEqualHex } from "./token";

const SESSION_COOKIE = "club_s";
const DEVICE_COOKIE = "club_d";
const SESSION_HOURS = 12;
const DAY = 86_400_000;

export type ClubSession = {
  residentId: string;
  /** Null = the owner signed in; otherwise a ResidentMember id. */
  memberId: string | null;
  deviceId: string | null;
  exp: number;
};

function secret(): string {
  const value = process.env.CLUB_SESSION_SECRET || `${process.env.NEXTAUTH_SECRET ?? ""}:club`;
  if (value.length < 16) throw new Error("CLUB_SESSION_SECRET (or NEXTAUTH_SECRET) is not set");
  return value;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

function encode(session: ClubSession): string {
  const body = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${body}.${sign(body)}`;
}

function decode(raw: string | undefined): ClubSession | null {
  if (!raw) return null;
  const [body, mac] = raw.split(".");
  if (!body || !mac || !safeEqualHex(sign(body), mac)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString()) as ClubSession;
    return parsed.exp > Date.now() ? parsed : null;
  } catch {
    return null;
  }
}

const cookieBase = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

export async function startSession(input: Omit<ClubSession, "exp">): Promise<void> {
  const jar = await cookies();
  const session: ClubSession = { ...input, exp: Date.now() + SESSION_HOURS * 3_600_000 };
  jar.set(SESSION_COOKIE, encode(session), { ...cookieBase, maxAge: SESSION_HOURS * 3600 });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

/**
 * The signed-in resident, or null. Falls back to the trusted-device cookie
 * so "remember this device" survives the 12-hour session. Every hit slides
 * the device's 90 days and checks it has not been revoked from the admin.
 */
export async function getSession(): Promise<ClubSession | null> {
  const jar = await cookies();
  const session = decode(jar.get(SESSION_COOKIE)?.value);
  if (session) {
    if (session.deviceId) {
      const device = await prisma.trustedDevice.findUnique({ where: { id: session.deviceId } });
      if (!device || device.revokedAt || device.expiresAt < new Date()) return null;
    }
    return session;
  }
  const device = await trustedDeviceFromCookie();
  if (!device) return null;
  return { residentId: device.residentId, memberId: device.memberId, deviceId: device.id, exp: Date.now() + SESSION_HOURS * 3_600_000 };
}

export async function trustedDeviceFromCookie() {
  const jar = await cookies();
  const raw = jar.get(DEVICE_COOKIE)?.value;
  if (!raw) return null;
  const device = await prisma.trustedDevice.findUnique({ where: { tokenHash: sha256(raw) } });
  if (!device || device.revokedAt || device.expiresAt < new Date()) return null;
  await prisma.trustedDevice.update({
    where: { id: device.id },
    data: { lastSeen: new Date(), expiresAt: new Date(Date.now() + TRUSTED_DEVICE_DAYS * DAY) },
  });
  return device;
}

/** Called after a successful OTP when "remember this device" is ticked. */
export async function rememberDevice(residentId: string, memberId: string | null, label: string) {
  const raw = newDeviceSecret();
  const device = await prisma.trustedDevice.create({
    data: {
      residentId,
      memberId,
      label: label.slice(0, 80) || "Browser",
      tokenHash: sha256(raw),
      expiresAt: new Date(Date.now() + TRUSTED_DEVICE_DAYS * DAY),
    },
  });
  const jar = await cookies();
  jar.set(DEVICE_COOKIE, raw, { ...cookieBase, maxAge: TRUSTED_DEVICE_DAYS * 86400 });
  return device;
}

export async function forgetThisDevice(): Promise<void> {
  const jar = await cookies();
  const raw = jar.get(DEVICE_COOKIE)?.value;
  if (raw) {
    await prisma.trustedDevice.updateMany({ where: { tokenHash: sha256(raw) }, data: { revokedAt: new Date() } });
  }
  jar.delete(DEVICE_COOKIE);
  jar.delete(SESSION_COOKIE);
}

/** "Mozilla/5.0 (iPhone…) … Safari" → "iPhone · Safari". */
export function deviceLabel(userAgent: string | null): string {
  const ua = userAgent ?? "";
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : "Browser";
  const app = / Line\//.test(ua) ? "LINE" : /CriOS|Chrome\//.test(ua) && !/Edg\//.test(ua) ? "Chrome" : /Edg\//.test(ua) ? "Edge" : /Firefox|FxiOS/.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "";
  return app ? `${os} · ${app}` : os;
}
