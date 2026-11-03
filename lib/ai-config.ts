/**
 * lib/ai-config.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The AI key behind the media library's alt text, editable at
 * /admin/settings/integrations so nobody has to touch the server's .env.
 *
 * Same scheme as lib/line-config.ts: a site_settings row lib/settings.ts
 * never reads (so it cannot reach the public site), the key encrypted with
 * AES-256-GCM under a key derived from NEXTAUTH_SECRET with its own domain
 * separator. A saved value wins over GEMINI_API_KEY / GEMINI_MODEL in the
 * environment, which stay as the fallback. Rotating NEXTAUTH_SECRET makes
 * a saved key unreadable; it then reads as "not set" until pasted again.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";

const KEY = {
  gemini: "secret:ai.geminiKey",
  model: "ai.geminiModel",
} as const;

export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-lite";

export type AiConfig = {
  geminiKey: string | null;
  keySource: "admin" | "env" | null;
  model: string;
  modelSource: "admin" | "env" | "default";
  undecryptable: boolean;
  /** Fallback provider, env only. */
  anthropicKey: string | null;
};

function cipherKey(): Buffer {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET is required to store the AI key");
  return crypto.createHash("sha256").update(`${secret}::ai-v1`).digest();
}

export function encryptAiSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", cipherKey(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), body.toString("base64")].join(":");
}

export function decryptAiSecret(stored: string): string {
  const [version, iv, tag, body] = stored.split(":");
  if (version !== "v1" || !iv || !tag || !body) throw new Error("unrecognised AI secret format");
  const decipher = crypto.createDecipheriv("aes-256-gcm", cipherKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64")), decipher.final()]).toString("utf8");
}

const TTL_MS = 30_000;
let cache: { at: number; value: AiConfig } | null = null;

export function invalidateAiConfig(): void {
  cache = null;
}

export async function getAiConfig(): Promise<AiConfig> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;

  let rows: { key: string; value: string }[] = [];
  try {
    rows = await prisma.siteSetting.findMany({
      where: { key: { in: Object.values(KEY) } },
      select: { key: true, value: true },
    });
  } catch (error) {
    console.error("[ai-config] could not read AI settings", error);
  }
  const row = (k: string) => rows.find((r) => r.key === k)?.value;

  let undecryptable = false;
  let adminKey: string | null = null;
  const stored = row(KEY.gemini);
  if (stored) {
    try {
      adminKey = decryptAiSecret(stored) || null;
    } catch {
      undecryptable = true;
      console.error("[ai-config] saved Gemini key cannot be decrypted — was NEXTAUTH_SECRET changed?");
    }
  }
  const envKey = process.env.GEMINI_API_KEY?.trim() || null;
  const adminModel = row(KEY.model)?.trim() || null;
  const envModel = process.env.GEMINI_MODEL?.trim() || null;

  const value: AiConfig = {
    geminiKey: adminKey ?? envKey,
    keySource: adminKey ? "admin" : envKey ? "env" : null,
    model: adminModel ?? envModel ?? DEFAULT_GEMINI_MODEL,
    modelSource: adminModel ? "admin" : envModel ? "env" : "default",
    undecryptable,
    anthropicKey: process.env.ANTHROPIC_API_KEY?.trim() || null,
  };
  cache = { at: Date.now(), value };
  return value;
}

/** Blank key leaves it as it is; `clearKey` removes it; blank model = default. */
export async function saveAiConfig(
  input: { geminiKey?: string; model?: string; clearKey?: boolean },
  actorId?: string,
): Promise<void> {
  const put = (k: string, value: string) =>
    prisma.siteSetting.upsert({
      where: { key: k },
      create: { key: k, value, updatedBy: actorId ?? null },
      update: { value, updatedBy: actorId ?? null },
    });

  const key = input.geminiKey?.trim();
  if (key) await put(KEY.gemini, encryptAiSecret(key));
  if (input.clearKey) await prisma.siteSetting.deleteMany({ where: { key: KEY.gemini } });

  if (input.model !== undefined) {
    const model = input.model.trim();
    if (model) await put(KEY.model, model);
    else await prisma.siteSetting.deleteMany({ where: { key: KEY.model } });
  }
  invalidateAiConfig();
}

/** Asks Google whether the key works and the model exists. Never throws. */
export async function checkGeminiKey(
  key: string,
  model: string,
): Promise<{ ok: true } | { ok: false; error: "BAD_KEY" | "BAD_MODEL" | "UNREACHABLE"; detail?: string }> {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}`,
      { headers: { "x-goog-api-key": key }, signal: AbortSignal.timeout(8_000) },
    );
    if (response.ok) return { ok: true };
    const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    const detail = body?.error?.message;
    if (response.status === 404) return { ok: false, error: "BAD_MODEL", detail };
    return { ok: false, error: "BAD_KEY", detail };
  } catch (error) {
    return { ok: false, error: "UNREACHABLE", detail: error instanceof Error ? error.message : String(error) };
  }
}
