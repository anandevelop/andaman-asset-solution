"use server";

/**
 * app/[locale]/admin/(system)/settings/integrations/line-actions.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The LINE card on /admin/settings/integrations: credentials, the master
 * switch, which chats receive lead alerts, and a test message.
 *
 * ADMIN and above, like every other integration setting. The credentials
 * are write-only from here: nothing returns them to the browser, the card
 * only learns whether each one is set.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { z } from "zod";
import { requireAdminAction } from "@/lib/admin/guard";
import { rateLimit } from "@/lib/rate-limit";
import {
  getLineConfig,
  parseLineId,
  removeLineDestination,
  saveLineCredentials,
  setLineEnabled,
  upsertLineDestination,
} from "@/lib/line-config";
import { fetchLineBotInfo, sendLineTest } from "@/lib/line";

export type LineActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string; detail?: string };

const PAGE = (locale: string) => `/${locale}/admin/settings/integrations`;

async function guarded(locale: string, run: (actorId: string) => Promise<LineActionResult>) {
  let actorId: string;
  try {
    actorId = (await requireAdminAction(Role.ADMIN)).id;
  } catch {
    return { ok: false, error: "FORBIDDEN" } as const;
  }
  try {
    const result = await run(actorId);
    revalidatePath(PAGE(locale));
    return result;
  } catch (error) {
    console.error("[line-actions]", error);
    return { ok: false, error: "SAVE_FAILED" } as const;
  }
}

const credentialsSchema = z.object({
  channelSecret: z.string().max(200).optional(),
  accessToken: z.string().max(2000).optional(),
  clear: z.array(z.enum(["secret", "token"])).max(2).optional(),
});

export async function saveLineCredentialsAction(locale: string, input: unknown) {
  return guarded(locale, async (actorId) => {
    const parsed = credentialsSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "INVALID_INPUT" };
    const { channelSecret, accessToken, clear } = parsed.data;

    if (channelSecret?.trim() && !/^[0-9a-f]{32}$/i.test(channelSecret.trim())) {
      return { ok: false, error: "BAD_SECRET" };
    }
    // Check a new token with LINE before keeping it: a wrong token is the
    // most common setup mistake and otherwise fails silently, lead by lead.
    if (accessToken?.trim()) {
      const bot = await fetchLineBotInfo(accessToken.trim());
      if (!bot) return { ok: false, error: "BAD_TOKEN" };
    }

    await saveLineCredentials({ channelSecret, accessToken, clear }, actorId);
    return { ok: true };
  });
}

export async function setLineEnabledAction(locale: string, enabled: boolean) {
  return guarded(locale, async (actorId) => {
    await setLineEnabled(Boolean(enabled), actorId);
    return { ok: true };
  });
}

export async function addLineDestinationAction(locale: string, rawId: string, name: string) {
  return guarded(locale, async (actorId) => {
    const parsed = parseLineId(String(rawId ?? ""));
    if (!parsed) return { ok: false, error: "BAD_ID" };
    await upsertLineDestination(
      { ...parsed, name: String(name ?? "").trim().slice(0, 80), enabled: true, source: "manual" },
      actorId,
    );
    return { ok: true };
  });
}

export async function updateLineDestinationAction(
  locale: string,
  id: string,
  patch: { enabled?: boolean; name?: string },
) {
  return guarded(locale, async (actorId) => {
    const current = (await getLineConfig()).destinations.find((d) => d.id === id);
    if (!current) return { ok: false, error: "NOT_FOUND" };
    await upsertLineDestination(
      {
        ...current,
        enabled: patch.enabled ?? current.enabled,
        name: patch.name !== undefined ? String(patch.name).trim().slice(0, 80) : current.name,
      },
      actorId,
    );
    return { ok: true };
  });
}

export async function removeLineDestinationAction(locale: string, id: string) {
  return guarded(locale, async (actorId) => {
    await removeLineDestination(String(id), actorId);
    return { ok: true };
  });
}

export async function sendLineTestAction(locale: string, onlyTo?: string) {
  return guarded(locale, async (actorId) => {
    // Every test is a message against the OA's monthly quota.
    if (!rateLimit(`line-test:${actorId}`, { limit: 5, windowMs: 10 * 60_000 }).ok) {
      return { ok: false, error: "RATE_LIMITED" };
    }
    const result = await sendLineTest(onlyTo || undefined);
    if ("error" in result) return { ok: false, error: result.error };
    if (result.failed.length > 0) {
      return {
        ok: false,
        error: "SEND_FAILED",
        detail: result.failed.map((f) => `${f.to}: ${f.status ?? "-"} ${f.detail}`).join("\n"),
      };
    }
    return { ok: true, message: String(result.sent) };
  });
}
