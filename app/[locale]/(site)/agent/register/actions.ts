"use server";

/**
 * app/[locale]/(site)/agent/register/actions.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Public co-agent self-registration. Creates a PENDING Agent the sales
 * team approves in /admin/agents. PDPA: the privacy-notice acknowledgement
 * is required and recorded (AGENT_NOTICE_VERSION, time, form language);
 * the news opt-in is separate and optional — never a condition.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { RATE_LIMITS, clientIp, rateLimit } from "@/lib/rate-limit";
import { AGENT_NOTICE_VERSION } from "@/lib/agents/constants";
import { resolveAgentRef } from "@/lib/agents/admin";
import { locales } from "@/i18n";

export type AgentRegisterState =
  | { status: "idle" }
  | { status: "done" }
  | { status: "closed" }
  | { status: "error"; error: "required" | "badEmail" | "mustAck" | "rateLimited" | "error" };

const schema = z.object({
  name: z.string().min(1).max(120),
  company: z.string().max(120),
  phone: z.string().max(40),
  whatsapp: z.string().max(40),
  email: z.string().max(200),
});

export async function registerAgent(
  locale: string,
  ref: string | null,
  _previous: AgentRegisterState,
  formData: FormData,
): Promise<AgentRegisterState> {
  const text = (key: string) => ((formData.get(key) as string | null) ?? "").trim();

  // Honeypot: a bot filled the invisible field. Look successful, store nothing.
  if (text("company_url")) return { status: "done" };

  const ip = clientIp(await headers());
  if (!rateLimit(`agent-register:${ip}`, RATE_LIMITS.leads).ok) return { status: "error", error: "rateLimited" };

  const link = await resolveAgentRef(ref);
  if (!link.open) return { status: "closed" };

  const parsed = schema.safeParse({
    name: text("name"),
    company: text("company"),
    phone: text("phone"),
    whatsapp: text("whatsapp"),
    email: text("email").toLowerCase(),
  });
  if (!parsed.success) return { status: "error", error: "required" };
  const v = parsed.data;
  if (!v.phone && !v.whatsapp && !v.email) return { status: "error", error: "required" };
  if (v.email && !z.email().safeParse(v.email).success) return { status: "error", error: "badEmail" };
  if (formData.get("notice") !== "on") return { status: "error", error: "mustAck" };

  try {
    await prisma.agent.create({
      data: {
        name: v.name,
        company: v.company || null,
        phone: v.phone,
        whatsapp: v.whatsapp || null,
        email: v.email || null,
        salesPersonId: link.salesPerson?.id ?? null,
        status: "PENDING",
        selfRegistered: true,
        noticeVersion: AGENT_NOTICE_VERSION,
        noticeAt: new Date(),
        formLocale: (locales as readonly string[]).includes(locale) ? locale : "en",
        newsConsent: formData.get("news") === "on",
      },
    });
  } catch (error) {
    console.error("[registerAgent]", error);
    return { status: "error", error: "error" };
  }
  // TODO: notify the sales person (or the team) of a new self-registration.
  return { status: "done" };
}
