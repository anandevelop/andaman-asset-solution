/**
 * lib/agents/admin.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Co-agents (the mockup's VIEWS.agency): reads for /admin/agents, the
 * per-sales-person registration links, and ref resolution for the public
 * form at /<locale>/agent/register?ref=<refSlug>.
 *
 * Channel: an agent's salesPersonId is the "Registration Channel"; a
 * self-registered agent without one came through the generic website link.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { prisma } from "@/lib/prisma";

// CLUB_SITE_URL first: it is read at run time, while NEXT_PUBLIC_SITE_URL
// is baked into the image as the production domain — staging would
// otherwise hand out registration links to the live site.
export const SITE_URL = (process.env.CLUB_SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://andamanassetsolution.com").replace(/\/$/, "");

export function registrationUrl(locale: string, refSlug: string | null): string {
  return `${SITE_URL}/${locale}/agent/register${refSlug ? `?ref=${encodeURIComponent(refSlug)}` : ""}`;
}

/** "Ray B." → "Ray": what the mockup calls the sales person's nickname. */
export function salesNick(person: { nameEn: string; nameTh: string }): string {
  return (person.nameEn || person.nameTh).trim().split(/\s+/)[0] || person.nameTh;
}

function slugBase(person: { id: string; nameEn: string }): string {
  const word = person.nameEn
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^(khun|mr\.?|ms\.?|mrs\.?)\s+/, "")
    .split(/\s+/)[0]
    ?.replace(/[^a-z0-9]+/g, "");
  return word && word !== "web" ? word.slice(0, 24) : `sales${person.id.slice(-4).toLowerCase()}`;
}

/** Give every active sales person a refSlug (nickname-based, unique). */
export async function ensureRefSlugs(): Promise<void> {
  const missing = await prisma.salesPerson.findMany({
    where: { isActive: true, refSlug: null },
    select: { id: true, nameEn: true },
  });
  if (!missing.length) return;
  const taken = new Set(
    (await prisma.salesPerson.findMany({ where: { refSlug: { not: null } }, select: { refSlug: true } })).map((row) => row.refSlug),
  );
  for (const person of missing) {
    const base = slugBase(person);
    let slug = base;
    for (let n = 2; taken.has(slug); n += 1) slug = `${base}${n}`;
    taken.add(slug);
    await prisma.salesPerson.update({ where: { id: person.id }, data: { refSlug: slug } });
  }
}

export async function salesPeopleForAgents() {
  const people = await prisma.salesPerson.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      nameEn: true,
      nameTh: true,
      positionEn: true,
      positionTh: true,
      isActive: true,
      refSlug: true,
      agentLinkEnabled: true,
    },
  });
  return people.map((person) => ({ ...person, nick: salesNick(person) }));
}
export type AgentSalesPerson = Awaited<ReturnType<typeof salesPeopleForAgents>>[number];

export async function agentsForAdmin() {
  return prisma.agent.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: { _count: { select: { leads: true } } },
  });
}
export type AdminAgent = Awaited<ReturnType<typeof agentsForAdmin>>[number];

export const phoneKey = (value: string | null | undefined) => {
  const digits = (value ?? "").replace(/\D/g, "").replace(/^66/, "0");
  return digits.length >= 6 ? digits : "";
};

/** agentId → names of other agents sharing an email or phone. */
export function duplicateMap(agents: Pick<AdminAgent, "id" | "name" | "email" | "phone" | "whatsapp">[]): Map<string, string[]> {
  const byKey = new Map<string, { id: string; name: string }[]>();
  const add = (key: string, agent: { id: string; name: string }) => {
    if (!key) return;
    const list = byKey.get(key) ?? [];
    if (!list.some((row) => row.id === agent.id)) list.push(agent);
    byKey.set(key, list);
  };
  for (const agent of agents) {
    add(agent.email ? `e:${agent.email.trim().toLowerCase()}` : "", agent);
    add(phoneKey(agent.phone) && `p:${phoneKey(agent.phone)}`, agent);
    add(phoneKey(agent.whatsapp) && `p:${phoneKey(agent.whatsapp)}`, agent);
  }
  const result = new Map<string, string[]>();
  for (const list of byKey.values()) {
    if (list.length < 2) continue;
    for (const agent of list) {
      const others = new Set(result.get(agent.id) ?? []);
      list.filter((row) => row.id !== agent.id).forEach((row) => others.add(row.name));
      result.set(agent.id, [...others]);
    }
  }
  return result;
}

export type RefResolution =
  | { open: true; salesPerson: { id: string; nick: string } | null }
  | { open: false };

/** `?ref=` → which link this is. No ref (or "web") = the generic website link. */
export async function resolveAgentRef(ref: string | null | undefined): Promise<RefResolution> {
  const slug = (ref ?? "").trim().toLowerCase();
  if (!slug || slug === "web") return { open: true, salesPerson: null };
  if (!/^[a-z0-9-]{1,40}$/.test(slug)) return { open: false };
  const person = await prisma.salesPerson.findUnique({
    where: { refSlug: slug },
    select: { id: true, nameEn: true, nameTh: true, isActive: true, agentLinkEnabled: true },
  });
  if (!person || !person.isActive || !person.agentLinkEnabled) return { open: false };
  return { open: true, salesPerson: { id: person.id, nick: salesNick(person) } };
}
