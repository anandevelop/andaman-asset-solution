/**
 * tests/ai-config.test.ts
 *
 * The Gemini key saved at /admin/settings/integrations: encrypted at rest,
 * and winning over GEMINI_API_KEY.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const rows: { key: string; value: string }[] = [];
vi.mock("@/lib/prisma", () => ({ prisma: { siteSetting: { findMany: async () => rows } } }));

import {
  DEFAULT_GEMINI_MODEL,
  decryptAiSecret,
  encryptAiSecret,
  getAiConfig,
  invalidateAiConfig,
} from "@/lib/ai-config";

beforeEach(() => {
  process.env.NEXTAUTH_SECRET = "test-secret";
  process.env.GEMINI_API_KEY = "";
  process.env.GEMINI_MODEL = "";
  rows.length = 0;
  invalidateAiConfig();
});

describe("ai-config", () => {
  it("round-trips the key and never stores it in clear", () => {
    const stored = encryptAiSecret("AIzaSECRET");
    expect(stored).not.toContain("AIzaSECRET");
    expect(decryptAiSecret(stored)).toBe("AIzaSECRET");
  });

  it("uses the saved key over the environment", async () => {
    process.env.GEMINI_API_KEY = "from-env";
    rows.push({ key: "secret:ai.geminiKey", value: encryptAiSecret("from-admin") });
    const config = await getAiConfig();
    expect(config.geminiKey).toBe("from-admin");
    expect(config.keySource).toBe("admin");
    expect(config.model).toBe(DEFAULT_GEMINI_MODEL);
  });

  it("falls back to GEMINI_API_KEY, and reads a key it cannot decrypt as unset", async () => {
    process.env.GEMINI_API_KEY = "from-env";
    rows.push({ key: "secret:ai.geminiKey", value: "v1:bad:bad:bad" }, { key: "ai.geminiModel", value: "gemini-2.5-flash" });
    const config = await getAiConfig();
    expect(config.geminiKey).toBe("from-env");
    expect(config.undecryptable).toBe(true);
    expect(config.model).toBe("gemini-2.5-flash");
  });
});
