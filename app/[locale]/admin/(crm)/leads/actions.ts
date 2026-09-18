"use server";

/**
 * app/[locale]/admin/leads/actions.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Server actions for the lead pipeline. Prisma is called directly — a
 * separate REST layer would only re-implement the authorisation and
 * validation that already have to live here.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { revalidatePath } from "next/cache";
import { LeadStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdminAction } from "@/lib/admin/guard";

const updateStatusSchema = z.object({
  id: z.string().min(1),
  status: z.nativeEnum(LeadStatus),
});

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Inline status change from the leads table. Note that leads are never
 * created or deleted here — capture is the public API's job, and deletion
 * would break the PDPA consent audit trail.
 */
export async function updateLeadStatus(
  locale: string,
  id: string,
  status: string,
): Promise<ActionResult> {
  await requireAdminAction();

  const parsed = updateStatusSchema.safeParse({ id, status });
  if (!parsed.success) return { ok: false, error: "INVALID_INPUT" };

  try {
    await prisma.leadInquiry.update({
      where: { id: parsed.data.id },
      data: { status: parsed.data.status },
    });
  } catch {
    return { ok: false, error: "UPDATE_FAILED" };
  }

  revalidatePath(`/${locale}/admin/leads`);
  revalidatePath(`/${locale}/admin`);

  return { ok: true };
}
