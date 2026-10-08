/**
 * lib/club/portal-actions-helpers.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Small server-side pieces the member portal's pages and actions share:
 *
 *   club_pending  who is half-way through signing in (after a card scan
 *                 or a house code, before the OTP). Signed with the same
 *                 HMAC idea as lib/club/session.ts so a visitor cannot
 *                 swap in another house's id; 15 minutes; httpOnly. It is
 *                 what lets the scan page drop the card token from the URL.
 *   club_theme    dark | light | auto, chosen in Account (1 year).
 *   club_a2hs     "show" after the first remembered OTP sign-in, "done"
 *                 once the add-to-home-screen banner is dismissed. Not
 *                 httpOnly: the banner hides itself from the client.
 * ─────────────────────────────────────────────────────────────────────────
 */
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSession, type ClubSession } from "./session";
import { getResidentContext } from "./portal";
import { clubBase } from "./paths";

const PENDING_COOKIE = "club_pending";
const PENDING_MINUTES = 15;
export const THEME_COOKIE = "club_theme";
export const INSTALL_COOKIE = "club_a2hs";

export type ClubTheme = "dark" | "light" | "auto";
export type PendingSignIn = { residentId: string; via: "qr" | "code"; exp: number };

function secret(): string {
  const value = process.env.CLUB_SESSION_SECRET || `${process.env.NEXTAUTH_SECRET ?? ""}:club`;
  if (value.length < 16) throw new Error("CLUB_SESSION_SECRET (or NEXTAUTH_SECRET) is not set");
  return value;
}

function mac(body: string): string {
  // A different label from the session cookie, so one can never be replayed as the other.
  return createHmac("sha256", secret()).update(`pending:${body}`).digest("hex");
}

const cookieBase = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

export async function setPendingSignIn(residentId: string, via: PendingSignIn["via"]): Promise<void> {
  const payload: PendingSignIn = { residentId, via, exp: Date.now() + PENDING_MINUTES * 60_000 };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  (await cookies()).set(PENDING_COOKIE, `${body}.${mac(body)}`, { ...cookieBase, maxAge: PENDING_MINUTES * 60 });
}

export async function readPendingSignIn(): Promise<PendingSignIn | null> {
  const raw = (await cookies()).get(PENDING_COOKIE)?.value;
  if (!raw) return null;
  const [body, sig] = raw.split(".");
  if (!body || !sig) return null;
  const expected = Buffer.from(mac(body), "hex");
  const given = Buffer.from(sig, "hex");
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString()) as PendingSignIn;
    return parsed.exp > Date.now() ? parsed : null;
  } catch {
    return null;
  }
}

export async function clearPendingSignIn(): Promise<void> {
  (await cookies()).delete(PENDING_COOKIE);
}

export async function readTheme(): Promise<ClubTheme> {
  const value = (await cookies()).get(THEME_COOKIE)?.value;
  return value === "light" || value === "auto" ? value : "dark";
}

export async function shouldShowInstallHint(): Promise<boolean> {
  return (await cookies()).get(INSTALL_COOKIE)?.value === "show";
}

/** The portal's home URL: "/" on the member host, "/<locale>/club" elsewhere. */
export function homeHref(base: string): string {
  return base || "/";
}

/**
 * Every signed-in page starts here: the session, the resident's house and
 * the base for links. No session (or a house that no longer exists) goes
 * back to the portal's home, which shows the sign-in screen.
 */
export async function requireResident(locale: string) {
  const base = await clubBase(locale);
  const session = await getSession();
  if (!session) redirect(homeHref(base));
  const ctx = await getResidentContext(session.residentId);
  if (!ctx) redirect(homeHref(base));
  return { base, session, ctx, viewer: viewerOf(session, ctx.resident) };
}

/** Who is holding the phone: the owner, or the household member who verified. */
export function viewerOf(
  session: ClubSession,
  resident: { ownerName: string; email: string | null; members: { id: string; name: string; email: string }[] },
) {
  const member = session.memberId ? resident.members.find((m) => m.id === session.memberId) : undefined;
  return member
    ? { name: member.name, email: member.email, isOwner: false }
    : { name: resident.ownerName, email: resident.email, isOwner: true };
}
