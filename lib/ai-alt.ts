/**
 * lib/ai-alt.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Alt text drafted by AI for the media library ("AI เขียน alt ที่ขาด", the
 * single-image button, and "AI alt ตอนอัปโหลด").
 *
 * One call per image: the photo itself plus what the library knows about
 * it (tags, where it is used — "Victory · gallery"), and back come four
 * short descriptions, en/th/zh/ru. The caller writes only the languages
 * that are still missing; anything a person typed stays.
 *
 * PROVIDER
 *
 * Google Gemini by default — a key from aistudio.google.com (free tier),
 * saved at /admin/settings/integrations or as GEMINI_API_KEY; see
 * lib/ai-config.ts. Default model gemini-2.5-flash-lite: the free tier's
 * highest daily allowance, and plenty for one sentence.
 * ANTHROPIC_API_KEY is used instead only when no Gemini key is set.
 * Note: on Gemini's free tier Google may use the prompts and images to
 * improve its products — these are already-public website photos.
 *
 * RATE LIMIT
 *
 * The free tier allows a handful of requests a minute, so calls are spaced
 * AI_ALT_RPM apart (default 10/min) across the whole process — the bulk
 * button, the panel button and uploads share one queue. A 429 comes back as
 * RATE_LIMIT with the wait Google asked for; the bulk loop sleeps and goes on.
 *
 * The image is fetched here and sent inline (base64) rather than as a URL.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { absoluteAssetUrl } from "@/lib/seo";
import { siteConfig } from "@/config/site";
import { getAiConfig } from "@/lib/ai-config";

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_ANTHROPIC_MODEL = "claude-haiku-4-5";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const SUPPORTED = ["image/jpeg", "image/png", "image/gif", "image/webp"];

export const ALT_LOCALES = ["en", "th", "zh", "ru"] as const;
export type AltLocale = (typeof ALT_LOCALES)[number];
export type AltDraft = Record<AltLocale, string>;

export type AltProvider = "gemini" | "anthropic";

/** Gemini when a key is saved in the back office or GEMINI_API_KEY is set. */
export async function aiAltProvider(): Promise<AltProvider | null> {
  const config = await getAiConfig();
  if (config.geminiKey) return "gemini";
  if (config.anthropicKey) return "anthropic";
  return null;
}

export async function isAiAltConfigured(): Promise<boolean> {
  return (await aiAltProvider()) !== null;
}

export class AltError extends Error {
  constructor(
    public code:
      | "NOT_CONFIGURED"
      | "IMAGE_FETCH"
      | "IMAGE_TYPE"
      | "IMAGE_TOO_LARGE"
      | "RATE_LIMIT"
      | "API"
      | "PARSE",
    message?: string,
    /** RATE_LIMIT: seconds the provider asked us to wait. */
    public retryAfterSec?: number,
  ) {
    super(message ?? code);
  }
}

// ── Pacing ──────────────────────────────────────────────────────────────

let nextSlotAt = 0;

/** Milliseconds between calls, from AI_ALT_RPM (default 10 a minute). */
export function altIntervalMs(): number {
  const rpm = Number(process.env.AI_ALT_RPM ?? 10);
  return Math.ceil(60_000 / (Number.isFinite(rpm) && rpm > 0 ? rpm : 10));
}

/** Waits for this process's next free slot and claims it. */
async function waitForSlot(): Promise<void> {
  const now = Date.now();
  const at = Math.max(now, nextSlotAt);
  nextSlotAt = at + altIntervalMs();
  if (at > now) await new Promise((resolve) => setTimeout(resolve, at - now));
}

/** How long until a call could start without waiting, in ms. */
export function msUntilNextSlot(): number {
  return Math.max(0, nextSlotAt - Date.now());
}

/** After a 429: nobody calls again before `seconds` have passed. */
function backOff(seconds: number): void {
  nextSlotAt = Math.max(nextSlotAt, Date.now() + seconds * 1000);
}

// ── Prompt / reply ──────────────────────────────────────────────────────

/** The prompt, kept pure for the test. */
export function altPrompt(context: { tags: string[]; usedOn: string[] }): string {
  const lines = [
    `You write image alt text for ${siteConfig.name}, a developer of pool villas in Phuket, Thailand.`,
    "Describe what is actually visible in this photo in one short, plain sentence (max ~120 characters).",
    "No 'image of' / 'photo of', no marketing words such as luxury, stunning or exclusive, no guessing names you cannot see.",
    "If the context below names the project or room, you may use that name.",
  ];
  if (context.usedOn.length) lines.push(`Used on: ${context.usedOn.slice(0, 5).join("; ")}.`);
  if (context.tags.length) lines.push(`Tags: ${context.tags.slice(0, 10).join(", ")}.`);
  lines.push(
    'Answer with JSON only: {"en": "...", "th": "...", "zh": "...", "ru": "..."} — English, Thai, Simplified Chinese, Russian, each a natural sentence in that language, not a word-for-word translation.',
  );
  return lines.join("\n");
}

/** The JSON object out of the model's reply, trimmed; throws when a language is missing. */
export function parseAltReply(text: string): AltDraft {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new AltError("PARSE", "no JSON in reply");
  let value: unknown;
  try {
    value = JSON.parse(match[0]);
  } catch {
    throw new AltError("PARSE", "invalid JSON in reply");
  }
  const draft = {} as AltDraft;
  for (const locale of ALT_LOCALES) {
    const raw = (value as Record<string, unknown>)?.[locale];
    const clean = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim().slice(0, 250) : "";
    if (!clean) throw new AltError("PARSE", `missing ${locale}`);
    draft[locale] = clean;
  }
  return draft;
}

/** "23s" / "1.5s" in a Gemini 429's RetryInfo → seconds. */
export function retryDelayFrom(body: unknown): number | null {
  const details = (body as { error?: { details?: { retryDelay?: string }[] } })?.error?.details ?? [];
  for (const detail of details) {
    const match = detail?.retryDelay?.match(/^([\d.]+)s$/);
    if (match) return Math.ceil(Number(match[1]));
  }
  return null;
}

// ── Calls ───────────────────────────────────────────────────────────────

async function imageAsBase64(url: string): Promise<{ data: string; mediaType: string }> {
  let response: Response;
  try {
    response = await fetch(absoluteAssetUrl(url), { signal: AbortSignal.timeout(15_000) });
  } catch (error) {
    throw new AltError("IMAGE_FETCH", error instanceof Error ? error.message : String(error));
  }
  if (!response.ok) throw new AltError("IMAGE_FETCH", `HTTP ${response.status}`);
  const mediaType = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!SUPPORTED.includes(mediaType)) throw new AltError("IMAGE_TYPE", mediaType || "unknown");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_IMAGE_BYTES) throw new AltError("IMAGE_TOO_LARGE", `${bytes.length} bytes`);
  return { data: bytes.toString("base64"), mediaType };
}

async function post(url: string, headers: Record<string, string>, body: unknown) {
  try {
    const response = await fetch(url, {
      method: "POST",
      signal: AbortSignal.timeout(30_000),
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    const json = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    return { response, json };
  } catch (error) {
    throw new AltError("API", error instanceof Error ? error.message : String(error));
  }
}

async function callGemini(image: { data: string; mediaType: string }, prompt: string): Promise<string> {
  const config = await getAiConfig();
  const { response, json } = await post(
    `${GEMINI_URL}/${encodeURIComponent(config.model)}:generateContent`,
    { "x-goog-api-key": config.geminiKey! },
    {
      contents: [
        { role: "user", parts: [{ inline_data: { mime_type: image.mediaType, data: image.data } }, { text: prompt }] },
      ],
      generationConfig: { temperature: 0.3, maxOutputTokens: 600, responseMimeType: "application/json" },
    },
  );
  const message = (json?.error as { message?: string } | undefined)?.message;
  if (response.status === 429) {
    const wait = retryDelayFrom(json) ?? 60;
    backOff(wait);
    throw new AltError("RATE_LIMIT", message ?? "rate limited", wait);
  }
  if (!response.ok) throw new AltError("API", message ?? `HTTP ${response.status}`);
  const candidates = (json?.candidates as { content?: { parts?: { text?: string }[] } }[] | undefined) ?? [];
  return (candidates[0]?.content?.parts ?? []).map((part) => part.text ?? "").join("");
}

async function callAnthropic(image: { data: string; mediaType: string }, prompt: string): Promise<string> {
  const { response, json } = await post(
    ANTHROPIC_URL,
    { "x-api-key": (await getAiConfig()).anthropicKey!, "anthropic-version": "2023-06-01" },
    {
      model: process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL,
      max_tokens: 600,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } },
            { type: "text", text: prompt },
          ],
        },
      ],
    },
  );
  const message = (json?.error as { message?: string } | undefined)?.message;
  if (response.status === 429) {
    const wait = Number(response.headers.get("retry-after")) || 60;
    backOff(wait);
    throw new AltError("RATE_LIMIT", message ?? "rate limited", wait);
  }
  if (!response.ok) throw new AltError("API", message ?? `HTTP ${response.status}`);
  const blocks = (json?.content as { type: string; text?: string }[] | undefined) ?? [];
  return blocks.filter((block) => block.type === "text").map((block) => block.text ?? "").join("");
}

export async function draftAltText(
  imageUrl: string,
  context: { tags: string[]; usedOn: string[] },
): Promise<AltDraft> {
  const provider = await aiAltProvider();
  if (!provider) throw new AltError("NOT_CONFIGURED");

  const image = await imageAsBase64(imageUrl);
  await waitForSlot();
  const prompt = altPrompt(context);
  const text = provider === "gemini" ? await callGemini(image, prompt) : await callAnthropic(image, prompt);
  return parseAltReply(text);
}
