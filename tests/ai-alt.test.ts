/**
 * tests/ai-alt.test.ts
 *
 * The prompt and the reply parsing behind "AI เขียน alt ที่ขาด".
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { AltError, altPrompt, isAiAltConfigured, parseAltReply } from "@/lib/ai-alt";

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

describe("isAiAltConfigured", () => {
  it("follows ANTHROPIC_API_KEY", () => {
    const before = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "";
    expect(isAiAltConfigured()).toBe(false);
    process.env.ANTHROPIC_API_KEY = "sk-test";
    expect(isAiAltConfigured()).toBe(true);
    process.env.ANTHROPIC_API_KEY = before;
  });
});
