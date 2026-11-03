"use server";

/**
 * The "PageSpeed Insights" card on /admin/settings/integrations. ADMIN and
 * above, like the cards beside it. A new key is tried on the home page
 * before it is kept, so a typo shows here rather than as a failed scan.
 */

import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { z } from "zod";
import { requireAdminAction } from "@/lib/admin/guard";
import { GOOGLE_DAILY_QUOTA, PSI_SCHEDULES, PSI_STRATEGY_SETS, getPsiConfig, savePsiConfig } from "@/lib/pagespeed/config";
import { runPageSpeed } from "@/lib/pagespeed/run";

export type PsiActionResult = { ok: true } | { ok: false; error: string; detail?: string };

export type PsiTestResult =
  | { ok: true; performance: number | null; seconds: number; cached: boolean }
  | { ok: false; error: string; detail?: string };

const schema = z.object({
  apiKey: z.string().max(200).optional(),
  clearKey: z.boolean().optional(),
  schedule: z.enum(PSI_SCHEDULES).optional(),
  strategies: z.enum(PSI_STRATEGY_SETS).optional(),
  alertBelow: z.number().int().min(0).max(100).optional(),
  dailyCap: z.number().int().min(10).max(GOOGLE_DAILY_QUOTA).optional(),
});

async function actor(): Promise<string | null> {
  try {
    return (await requireAdminAction(Role.ADMIN)).id;
  } catch {
    return null;
  }
}

export async function savePsiSettingsAction(locale: string, input: unknown): Promise<PsiActionResult> {
  const actorId = await actor();
  if (!actorId) return { ok: false, error: "FORBIDDEN" };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID_INPUT" };

  try {
    await savePsiConfig(parsed.data, actorId);
  } catch (error) {
    console.error("[psi-actions]", error);
    return { ok: false, error: "SAVE_FAILED" };
  }
  revalidatePath(`/${locale}/admin/settings/integrations`);
  revalidatePath(`/${locale}/admin/seo/speed`);
  return { ok: true };
}

/** One real call: the Thai home page on mobile. Counts towards the day. */
export async function testPsiAction(): Promise<PsiTestResult> {
  if (!(await actor())) return { ok: false, error: "FORBIDDEN" };
  const config = await getPsiConfig();
  if (!config.apiKey) return { ok: false, error: "NO_KEY" };
  const started = Date.now();
  const outcome = await runPageSpeed({ path: "/th", strategy: "mobile", source: "test" });
  if (!outcome.ok) return { ok: false, error: outcome.error, detail: outcome.detail };
  return {
    ok: true,
    performance: outcome.run.performance,
    seconds: Math.round((Date.now() - started) / 100) / 10,
    cached: outcome.cached,
  };
}
