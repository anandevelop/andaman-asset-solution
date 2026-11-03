"use server";

/**
 * The "AI (Gemini)" card on /admin/settings/integrations. ADMIN and above,
 * like the LINE card beside it. A new key is checked with Google before it
 * is kept, so a typo shows here rather than as 308 failed images later.
 */

import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { z } from "zod";
import { requireAdminAction } from "@/lib/admin/guard";
import { checkGeminiKey, DEFAULT_GEMINI_MODEL, getAiConfig, saveAiConfig } from "@/lib/ai-config";

export type AiActionResult = { ok: true } | { ok: false; error: string; detail?: string };

const schema = z.object({
  geminiKey: z.string().max(200).optional(),
  model: z
    .string()
    .trim()
    .max(80)
    .regex(/^[a-z0-9.\-]*$/i, "model")
    .optional(),
  clearKey: z.boolean().optional(),
});

export async function saveAiSettingsAction(locale: string, input: unknown): Promise<AiActionResult> {
  let actorId: string;
  try {
    actorId = (await requireAdminAction(Role.ADMIN)).id;
  } catch {
    return { ok: false, error: "FORBIDDEN" };
  }
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID_INPUT" };
  const { geminiKey, model, clearKey } = parsed.data;

  // Check whatever would be in effect after this save.
  const current = await getAiConfig();
  const keyToCheck = geminiKey?.trim() || (clearKey ? null : current.geminiKey);
  const modelToCheck = model === undefined ? current.model : model.trim() || DEFAULT_GEMINI_MODEL;
  if (keyToCheck && (geminiKey?.trim() || model !== undefined)) {
    const check = await checkGeminiKey(keyToCheck, modelToCheck);
    if (!check.ok) return { ok: false, error: check.error, detail: check.detail };
  }

  try {
    await saveAiConfig({ geminiKey, model, clearKey }, actorId);
    revalidatePath(`/${locale}/admin/settings/integrations`);
    revalidatePath(`/${locale}/admin/media`);
    return { ok: true };
  } catch (error) {
    console.error("[ai-actions]", error);
    return { ok: false, error: "SAVE_FAILED" };
  }
}
