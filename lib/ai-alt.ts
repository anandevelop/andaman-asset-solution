/**
 * lib/ai-alt.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Alt text drafted by Claude for the media library's "AI เขียน alt ที่ขาด".
 *
 * One call per image: the photo itself plus what the library knows about
 * it (tags, where it is used — "Victory · gallery"), and back come four
 * short descriptions, en/th/zh/ru. Only the languages that are still
 * missing are written; anything a person typed stays.
 *
 * The image is fetched here and sent as base64 rather than handed to the
 * API as a URL: the API's own fetch of a CloudFront or legacy-host URL is
 * one more thing that can fail without saying why.
 *
 * Needs ANTHROPIC_API_KEY. Without it the button explains itself and does
 * nothing. ANTHROPIC_MODEL picks the model (default below — a small vision
 * model is plenty for one-sentence descriptions).
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { absoluteAssetUrl } from "@/lib/seo";
import { siteConfig } from "@/config/site";

const API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-haiku-4-5";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const SUPPORTED = ["image/jpeg", "image/png", "image/gif", "image/webp"];

export const ALT_LOCALES = ["en", "th", "zh", "ru"] as const;
export type AltLocale = (typeof ALT_LOCALES)[number];
export type AltDraft = Record<AltLocale, string>;

export function isAiAltConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

export class AltError extends Error {
  constructor(
    public code: "NOT_CONFIGURED" | "IMAGE_FETCH" | "IMAGE_TYPE" | "IMAGE_TOO_LARGE" | "API" | "PARSE",
    message?: string,
  ) {
    super(message ?? code);
  }
}

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

async function imageAsBase64(url: string): Promise<{ data: string; mediaType: string }> {
  const absolute = absoluteAssetUrl(url);
  let response: Response;
  try {
    response = await fetch(absolute, { signal: AbortSignal.timeout(15_000) });
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

export async function draftAltText(
  imageUrl: string,
  context: { tags: string[]; usedOn: string[] },
): Promise<AltDraft> {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) throw new AltError("NOT_CONFIGURED");

  const image = await imageAsBase64(imageUrl);

  let response: Response;
  try {
    response = await fetch(API_URL, {
      method: "POST",
      signal: AbortSignal.timeout(30_000),
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL,
        max_tokens: 600,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } },
              { type: "text", text: altPrompt(context) },
            ],
          },
        ],
      }),
    });
  } catch (error) {
    throw new AltError("API", error instanceof Error ? error.message : String(error));
  }

  const body = (await response.json().catch(() => null)) as
    | { content?: { type: string; text?: string }[]; error?: { message?: string } }
    | null;
  if (!response.ok) throw new AltError("API", body?.error?.message ?? `HTTP ${response.status}`);

  const text = (body?.content ?? []).filter((block) => block.type === "text").map((block) => block.text ?? "").join("");
  return parseAltReply(text);
}
