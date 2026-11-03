/**
 * tests/ai-alt.test.ts
 *
 * The prompt, reply parsing, provider choice and pacing behind the media
 * library's AI alt text.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: { siteSetting: { findMany: async () => [] } } }));

import {
  AltError,
  aiAltProvider,
  altIntervalMs,
  altPrompt,
  parseAltReply,
  retryDelayFrom,
} from "@/lib/ai-alt";
import { invalidateAiConfig } from "@/lib/ai-config";

const env = { ...process.env };
afterEach(() => {
  process.env = { ...env };
});

describe("parseAltReply", () => {
  it("reads the four languages, even with text around the JSON", () => {
    const draft = parseAltReply(
      'Here you go:\n{"en":"Pool  terrace at dusk","th":"ระเบียงสระว่ายน้ำยามเย็น","zh":"黄昏时的泳池露台","ru":"Терраса у бассейна вечером"}',
    );
    expect(draft.en).toBe("Pool terrace at dusk");
    expect(draft.ru).toBe("Терраса у бассейна вечером");
  });

  it("refuses a reply missing a language", () => {
    expect(() => parseAltReply('{"en":"x","th":"y","zh":"z"}')).toThrow(AltError);
    expect(() => parseAltReply("no json")).toThrow(AltError);
  });
});

describe("altPrompt", () => {
  it("carries the context and steers away from marketing words", () => {
    const prompt = altPrompt({ tags: ["victory", "pool"], usedOn: ["Victory · gallery"] });
    expect(prompt).toContain("Used on: Victory · gallery");
    expect(prompt).toContain("Tags: victory, pool");
    expect(prompt).toMatch(/no marketing words such as luxury/);
  });
});

describe("provider", () => {
  it("prefers Gemini, falls back to Anthropic, else none", async () => {
    process.env.GEMINI_API_KEY = "g";
    process.env.ANTHROPIC_API_KEY = "a";
    invalidateAiConfig();
    expect(await aiAltProvider()).toBe("gemini");
    process.env.GEMINI_API_KEY = "";
    invalidateAiConfig();
    expect(await aiAltProvider()).toBe("anthropic");
    process.env.ANTHROPIC_API_KEY = "";
    invalidateAiConfig();
    expect(await aiAltProvider()).toBeNull();
  });
});

describe("pacing", () => {
  it("spaces calls from AI_ALT_RPM", () => {
    process.env.AI_ALT_RPM = "15";
    expect(altIntervalMs()).toBe(4000);
    process.env.AI_ALT_RPM = "nonsense";
    expect(altIntervalMs()).toBe(6000);
  });

  it("reads Gemini's retryDelay", () => {
    expect(retryDelayFrom({ error: { details: [{ "@type": "x" }, { retryDelay: "23s" }] } })).toBe(23);
    expect(retryDelayFrom({ error: {} })).toBeNull();
  });
});
