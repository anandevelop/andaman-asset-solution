"use server";

/**
 * app/[locale]/admin/(club)/agents/actions.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Co-agent CRUD for the CRM roles. Rejecting a self-registration deletes
 * it (PDPA: nothing is kept for an agent we will not work with); deleting
 * an approved agent on the data subject's request is ADMIN and above, as
 * is switching a sales person's registration link.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toCsv } from "@/lib/csv";
import { rateLimit } from "@/lib/rate-limit";
import { requireClubAction } from "@/lib/club/admin-guard";
import { salesNick } from "@/lib/club/admin-agents";

export type AgentActionResult = { ok: true; csv?: string; phone?: string; whatsapp?: string | null } | { ok: false; error: string };
export type AgentFormState = { ok: boolean; message?: string; fields?: Record<string, string> };

const revalidateAgents = (locale: string) => revalidatePath(`/${locale}/admin/agents`);

async function guarded(minimum: Role, run: () => Promise<AgentActionResult>): Promise<AgentActionResult> {
  try {
    await requireClubAction(minimum);
  } catch {
    return { ok: false, error: "FORBIDDEN" };
  }
  try {
    return await run();
  } catch (error) {
    console.error("[club/agents]", error);
    return { ok: false, error: "generic" };
  }
}

export async function saveAgent(
  locale: string,
  agentId: string | null,
  _previous: AgentFormState,
  formData: FormData,
): Promise<AgentFormState> {
  const t = await getTranslations({ locale, namespace: "clubAgents.agents" });
  try {
    await requireClubAction(Role.SALES);
  } catch {
    return { ok: false, message: t("errForbidden") };
  }
  const text = (key: string) => ((formData.get(key) as string | null) ?? "").trim();
  const schema = z
    .object({
      name: z.string().min(1, t("errName")).max(120),
      company: z.string().max(120),
      phone: z.string().max(40),
      whatsapp: z.string().max(40),
      email: z.union([z.literal(""), z.email(t("errEmail")).max(200)]),
      salesPersonId: z.string().max(40),
    })
    .refine((v) => v.phone || v.whatsapp || v.email, { path: ["phone"], message: t("errContact") });
  const parsed = schema.safeParse({
    name: text("name"),
    company: text("company"),
    phone: text("phone"),
    whatsapp: text("whatsapp"),
    email: text("email").toLowerCase(),
    salesPersonId: text("salesPersonId"),
  });
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) fields[String(issue.path[0] ?? "form")] ??= issue.message;
    return { ok: false, fields };
  }
  const v = parsed.data;
  const salesPerson = v.salesPersonId
    ? await prisma.salesPerson.findUnique({ where: { id: v.salesPersonId }, select: { id: true } })
    : null;
  const data = {
    name: v.name,
    company: v.company || null,
    phone: v.phone,
    whatsapp: v.whatsapp || null,
    email: v.email || null,
    salesPersonId: salesPerson?.id ?? null,
  };
  try {
    if (agentId) await prisma.agent.update({ where: { id: agentId }, data });
    else await prisma.agent.create({ data: { ...data, status: "APPROVED" } });
  } catch (error) {
    console.error("[saveAgent]", error);
    return { ok: false, message: t("errGeneric") };
  }
  revalidateAgents(locale);
  return { ok: true, message: t("savedToast", { name: v.name }) };
}

export async function approveAgent(locale: string, agentId: string): Promise<AgentActionResult> {
  return guarded(Role.SALES, async () => {
    await prisma.agent.update({ where: { id: agentId }, data: { status: "APPROVED" } });
    revalidateAgents(locale);
    return { ok: true };
  });
}

/** Reject = delete; only a still-pending self-registration. */
export async function rejectAgent(locale: string, agentId: string): Promise<AgentActionResult> {
  return guarded(Role.SALES, async () => {
    const result = await prisma.agent.deleteMany({ where: { id: agentId, status: "PENDING" } });
    if (!result.count) return { ok: false, error: "NOT_FOUND" };
    revalidateAgents(locale);
    return { ok: true };
  });
}

/** Erasure on the data subject's request. Leads stay, unlinked (onDelete: SetNull). */
export async function deleteAgent(locale: string, agentId: string): Promise<AgentActionResult> {
  return guarded(Role.ADMIN, async () => {
    await prisma.agent.delete({ where: { id: agentId } });
    revalidateAgents(locale);
    return { ok: true };
  });
}

/** The table masks phones; the full number is fetched on demand. */
export async function revealAgentPhone(agentId: string): Promise<AgentActionResult> {
  let userId = "";
  try {
    userId = (await requireClubAction(Role.SALES)).id;
  } catch {
    return { ok: false, error: "FORBIDDEN" };
  }
  if (!rateLimit(`agent-reveal:${userId}`, { limit: 60, windowMs: 10 * 60_000 }).ok) return { ok: false, error: "RATE_LIMITED" };
  const agent = await prisma.agent.findUnique({ where: { id: agentId }, select: { phone: true, whatsapp: true } });
  if (!agent) return { ok: false, error: "NOT_FOUND" };
  return { ok: true, phone: agent.phone, whatsapp: agent.whatsapp };
}

export async function setAgentLink(locale: string, salesPersonId: string, enabled: boolean): Promise<AgentActionResult> {
  return guarded(Role.ADMIN, async () => {
    await prisma.salesPerson.update({ where: { id: salesPersonId }, data: { agentLinkEnabled: enabled } });
    revalidateAgents(locale);
    return { ok: true };
  });
}

export async function exportAgentsCsv(locale: string): Promise<AgentActionResult> {
  return guarded(Role.SALES, async () => {
    const t = await getTranslations({ locale, namespace: "clubAgents.agents" });
    const agents = await prisma.agent.findMany({
      orderBy: { createdAt: "asc" },
      include: { salesPerson: { select: { nameEn: true, nameTh: true } }, _count: { select: { leads: true } } },
    });
    const csv = toCsv(
      [
        t("csvName"),
        t("csvCompany"),
        t("csvPhone"),
        t("csvWhatsapp"),
        t("csvEmail"),
        t("csvChannel"),
        t("csvStatus"),
        t("csvLeads"),
        t("csvNotice"),
        t("csvNoticeAt"),
        t("csvNews"),
        t("csvCreated"),
      ],
      agents.map((agent) => [
        agent.name,
        agent.company,
        agent.phone,
        agent.whatsapp,
        agent.email,
        agent.salesPerson ? salesNick(agent.salesPerson) : agent.selfRegistered ? t("channelWebsite") : "",
        t(agent.status === "PENDING" ? "statusPENDING" : "statusAPPROVED"),
        agent._count.leads,
        agent.noticeVersion,
        agent.noticeAt,
        agent.newsConsent ? "Y" : "N",
        agent.createdAt,
      ]),
    );
    return { ok: true, csv };
  });
}
