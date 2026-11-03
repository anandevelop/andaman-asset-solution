"use server";

/**
 * The "Google" card on /admin/settings/integrations: GA4 tag ID, GA4
 * property, Search Console property and the service account key file.
 * ADMIN and above. The key file is parsed and encrypted here; only the
 * account's email ever goes back to the page.
 */

import { revalidatePath, updateTag } from "next/cache";
import { Role } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdminAction } from "@/lib/admin/guard";
import { SETTING_VALIDATORS } from "@/lib/validations";
import {
  getGoogleConfig,
  normaliseGscSiteUrl,
  parseServiceAccountJson,
  saveGoogleConfig,
} from "@/lib/google-config";
import { checkGoogleConnection, type GoogleCheck } from "@/lib/google-check";
import { resetTokenCache } from "@/lib/seo/google-client";

const schema = z.object({
  gaMeasurementId: z.string().trim().max(40),
  ga4PropertyId: z
    .string()
    .trim()
    .max(20)
    .regex(/^\d*$/, "digits"),
  gscSiteUrl: z.string().trim().max(300),
  /** Pasted or picked key file; blank keeps the saved one. */
  serviceAccountJson: z.string().max(20_000).optional(),
  removeServiceAccount: z.boolean().optional(),
});

export type GoogleSaveResult = { ok: true } | { ok: false; error: string; field?: string };

async function actor() {
  return (await requireAdminAction(Role.ADMIN)).id;
}

export async function saveGoogleSettingsAction(locale: string, input: unknown): Promise<GoogleSaveResult> {
  let actorId: string;
  try {
    actorId = await actor();
  } catch {
    return { ok: false, error: "FORBIDDEN" };
  }
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const field = String(parsed.error.issues[0]?.path[0] ?? "");
    return { ok: false, error: field === "ga4PropertyId" ? "BAD_PROPERTY_ID" : "INVALID_INPUT", field };
  }
  const { gaMeasurementId, ga4PropertyId, gscSiteUrl, serviceAccountJson, removeServiceAccount } = parsed.data;

  // The browser tag ID is a site setting (lib/settings.ts) — same validator.
  if (gaMeasurementId) {
    const check = SETTING_VALIDATORS["analytics.gaMeasurementId"]?.safeParse(gaMeasurementId);
    if (check && !check.success) return { ok: false, error: "BAD_MEASUREMENT_ID", field: "gaMeasurementId" };
  }

  let serviceAccount: { email: string; privateKey: string } | null | undefined;
  if (removeServiceAccount) serviceAccount = null;
  else if (serviceAccountJson?.trim()) {
    const account = parseServiceAccountJson(serviceAccountJson.trim());
    if (!account.ok) return { ok: false, error: account.error, field: "serviceAccountJson" };
    serviceAccount = { email: account.email, privateKey: account.privateKey };
  }

  try {
    await saveGoogleConfig(
      { serviceAccount, gscSiteUrl: normaliseGscSiteUrl(gscSiteUrl), ga4PropertyId },
      actorId,
    );
    const key = "analytics.gaMeasurementId";
    const value = gaMeasurementId.toUpperCase();
    if (value) {
      await prisma.siteSetting.upsert({
        where: { key },
        create: { key, value, updatedBy: actorId },
        update: { value, updatedBy: actorId },
      });
    } else {
      await prisma.siteSetting.deleteMany({ where: { key } });
    }
    resetTokenCache();
    updateTag("site-settings");
    // The GA tag is in every public page's <head>.
    revalidatePath("/", "layout");
    revalidatePath(`/${locale}/admin/settings/integrations`);
    revalidatePath(`/${locale}/admin/seo`, "layout");
    return { ok: true };
  } catch (error) {
    console.error("[google-actions] save failed", error);
    return { ok: false, error: "SAVE_FAILED" };
  }
}

/**
 * Tests what the form shows: a pasted key file when there is one, else the
 * saved or .env account; the IDs as typed. Nothing is saved.
 */
export async function testGoogleConnectionAction(input: {
  ga4PropertyId: string;
  gscSiteUrl: string;
  serviceAccountJson?: string;
}): Promise<{ ok: true; result: GoogleCheck; email: string | null } | { ok: false; error: string }> {
  try {
    await actor();
  } catch {
    return { ok: false, error: "FORBIDDEN" };
  }
  const config = await getGoogleConfig();
  let credentials = config.credentials;
  if (input.serviceAccountJson?.trim()) {
    const account = parseServiceAccountJson(input.serviceAccountJson.trim());
    if (!account.ok) return { ok: false, error: account.error };
    credentials = { email: account.email, privateKey: account.privateKey };
  }
  const result = await checkGoogleConnection({
    credentials,
    gscSiteUrl: normaliseGscSiteUrl(input.gscSiteUrl) || null,
    ga4PropertyId: input.ga4PropertyId.trim() || null,
  });
  return { ok: true, result, email: credentials?.email ?? null };
}
