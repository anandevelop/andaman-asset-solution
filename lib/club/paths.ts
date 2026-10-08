/**
 * lib/club/paths.ts — where portal links point.
 *
 * On member.andamanassetsolution.com the proxy hides "/<locale>/club", so
 * links are "/benefits". Anywhere else (localhost) they are
 * "/<locale>/club/benefits". Server components compute the base once with
 * clubBase() and pass it to client components as a prop.
 */
import "server-only";
import { headers } from "next/headers";

export async function clubBase(locale: string): Promise<string> {
  const host = ((await headers()).get("host") ?? "").toLowerCase();
  const member = host.startsWith("member.") || (!!process.env.CLUB_DEV_HOST && host === process.env.CLUB_DEV_HOST);
  return member ? "" : `/${locale}/club`;
}

export async function requestIp(): Promise<string | null> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
}

export async function requestUserAgent(): Promise<string | null> {
  return (await headers()).get("user-agent");
}
