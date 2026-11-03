/**
 * tests/google-config.test.ts
 *
 * The Google connection saved at /admin/settings/integrations.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const rows: { key: string; value: string }[] = [];
const writes: { key: string; value: string }[] = [];
vi.mock("@/lib/prisma", () => ({
  prisma: {
    siteSetting: {
      findMany: async () => rows,
      upsert: async ({ create }: { create: { key: string; value: string } }) => {
        writes.push(create);
        rows.push(create);
      },
      deleteMany: async () => ({ count: 0 }),
    },
  },
}));

import {
  getGoogleConfig,
  invalidateGoogleConfig,
  normaliseGscSiteUrl,
  parseServiceAccountJson,
  saveGoogleConfig,
} from "@/lib/google-config";

const KEY_FILE = JSON.stringify({
  type: "service_account",
  project_id: "andaman",
  client_email: "reader@andaman.iam.gserviceaccount.com",
  private_key: "-----BEGIN PRIVATE KEY-----\\nABC\\n-----END PRIVATE KEY-----\\n",
});

beforeEach(() => {
  process.env.NEXTAUTH_SECRET = "test-secret";
  process.env.GOOGLE_SA_EMAIL = "";
  process.env.GOOGLE_SA_PRIVATE_KEY = "";
  process.env.GSC_SITE_URL = "sc-domain:andamanassetsolution.com";
  process.env.GA4_PROPERTY_ID = "";
  rows.length = 0;
  writes.length = 0;
  invalidateGoogleConfig();
});

describe("parseServiceAccountJson", () => {
  it("takes the email and a usable PEM from the key file", () => {
    const parsed = parseServiceAccountJson(KEY_FILE);
    expect(parsed.ok && parsed.email).toBe("reader@andaman.iam.gserviceaccount.com");
    expect(parsed.ok && parsed.privateKey).toContain("\nABC\n");
  });

  it("refuses something that is not a service account key", () => {
    expect(parseServiceAccountJson("nope")).toEqual({ ok: false, error: "NOT_JSON" });
    expect(parseServiceAccountJson('{"type":"authorized_user"}')).toEqual({ ok: false, error: "NOT_SERVICE_ACCOUNT" });
  });
});

describe("normaliseGscSiteUrl", () => {
  it.each([
    ["andamanassetsolution.com", "sc-domain:andamanassetsolution.com"],
    ["sc-domain:AndamanAssetSolution.com", "sc-domain:andamanassetsolution.com"],
    ["https://andamanassetsolution.com", "https://andamanassetsolution.com/"],
    ["https://andamanassetsolution.com/", "https://andamanassetsolution.com/"],
    ["", ""],
  ])("%s → %s", (raw, expected) => {
    expect(normaliseGscSiteUrl(raw)).toBe(expected);
  });
});

describe("getGoogleConfig", () => {
  it("falls back to the environment, value by value", async () => {
    const config = await getGoogleConfig();
    expect(config.credentials).toBeNull();
    expect(config.gscSiteUrl).toBe("sc-domain:andamanassetsolution.com");
    expect(config.gscSource).toBe("env");
  });

  it("stores the key encrypted and reads it back over the environment", async () => {
    process.env.GOOGLE_SA_EMAIL = "env@x.iam.gserviceaccount.com";
    process.env.GOOGLE_SA_PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\\nENV\\n-----END PRIVATE KEY-----";
    await saveGoogleConfig({
      serviceAccount: { email: "saved@x.iam.gserviceaccount.com", privateKey: "PEM-SAVED" },
      ga4PropertyId: "560583599",
    });
    expect(JSON.stringify(writes)).not.toContain("PEM-SAVED");
    const config = await getGoogleConfig();
    expect(config.credentials).toEqual({ email: "saved@x.iam.gserviceaccount.com", privateKey: "PEM-SAVED" });
    expect(config.credentialsSource).toBe("admin");
    expect(config.ga4PropertyId).toBe("560583599");
  });
});
