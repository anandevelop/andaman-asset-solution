"use server";

/**
 * The three things an admin can do with a held enquiry
 * (/admin/leads/suspect, lib/leads/suspect.ts). Each is logged — who, which
 * record, what — without the person's name, like a lead erasure.
 */

import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdminAction } from "@/lib/admin/guard";
import { deleteSuspect, markSuspectSpam, releaseSuspect } from "@/lib/leads/suspect";

export type SuspectActionResult = { ok: true; leadId?: string } | { ok: false; error: "FORBIDDEN" | "NOT_FOUND" | "FAILED" };

const idSchema = z.string().min(1).max(40);

async function act(
  locale: string,
  id: unknown,
  action: "release_suspect" | "spam_suspect" | "delete_suspect",
  run: (id: string, actorId: string) => Promise<{ ok: boolean; leadId?: string }>,
): Promise<SuspectActionResult> {
  let actor;
  try {
    actor = await requireAdminAction(Role.ADMIN);
  } catch {
    return { ok: false, error: "FORBIDDEN" };
  }
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return { ok: false, error: "NOT_FOUND" };

  try {
    const result = await run(parsed.data, actor.id);
    if (!result.ok) return { ok: false, error: "NOT_FOUND" };
    await prisma.auditLog.create({
      data: {
        actorId: actor.id,
        actorEmail: actor.email.slice(0, 200),
        actorRole: actor.role,
        action,
        model: "SuspectLead",
        recordId: parsed.data,
        recordLabel: null,
        changedFields: result.leadId ? [result.leadId] : [],
      },
    });
    revalidatePath(`/${locale}/admin/leads`);
    revalidatePath(`/${locale}/admin/leads/suspect`);
    revalidatePath(`/${locale}/admin`);
    return { ok: true, leadId: result.leadId };
  } catch (error) {
    console.error(`[suspect] ${action} failed`, error);
    return { ok: false, error: "FAILED" };
  }
}

/** It is a real enquiry: make it a lead, routed and announced now. */
export async function releaseSuspectLead(locale: string, id: unknown) {
  return act(locale, id, "release_suspect", async (suspectId) => {
    const result = await releaseSuspect(suspectId);
    return result ? { ok: true, leadId: result.leadId } : { ok: false };
  });
}

/** Spam: delete it and block its email and phone. */
export async function markSuspectLeadSpam(locale: string, id: unknown) {
  return act(locale, id, "spam_suspect", async (suspectId, actorId) => ({
    ok: await markSuspectSpam(suspectId, actorId),
  }));
}

/** Delete without blocking — the team's own test, say. */
export async function deleteSuspectLead(locale: string, id: unknown) {
  return act(locale, id, "delete_suspect", async (suspectId) => ({ ok: await deleteSuspect(suspectId) }));
}
