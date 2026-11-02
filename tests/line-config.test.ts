/**
 * tests/line-config.test.ts
 *
 * LINE settings edited from the back office (lib/line-config.ts): the
 * credentials must be unreadable at rest, a saved value must win over the
 * environment, and a chat the OA was added to must not receive customers'
 * details until an admin switches it on.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    siteSetting: {
      findMany: async ({ where }: { where: { key: { in: string[] } } }) =>
        [...store].filter(([k]) => where.key.in.includes(k)).map(([key, value]) => ({ key, value })),
      findUnique: async ({ where }: { where: { key: string } }) =>
        store.has(where.key) ? { key: where.key, value: store.get(where.key)! } : null,
      upsert: async ({ where, create }: { where: { key: string }; create: { value: string } }) => {
        store.set(where.key, create.value);
      },
      deleteMany: async ({ where }: { where: { key: { in: string[] } } }) => {
        for (const k of where.key.in) store.delete(k);
      },
    },
  },
}));

import {
  decryptLineSecret,
  encryptLineSecret,
  getActiveRecipients,
  getLineConfig,
  invalidateLineConfig,
  parseLineId,
  recordLineChat,
  saveLineCredentials,
  setLineEnabled,
  upsertLineDestination,
} from "@/lib/line-config";

const GROUP = "C" + "a".repeat(32);
const USER = "U" + "b".repeat(32);
const saved = { ...process.env };

beforeEach(() => {
  store.clear();
  process.env.NEXTAUTH_SECRET = "test-nextauth-secret-0000000000000000";
  delete process.env.LINE_CHANNEL_SECRET;
  delete process.env.LINE_CHANNEL_ACCESS_TOKEN;
  delete process.env.LINE_NOTIFY_TO;
  invalidateLineConfig();
});

afterEach(() => {
  process.env = { ...saved };
});

describe("credential encryption", () => {
  it("round-trips and never stores the plain value", () => {
    const stored = encryptLineSecret("my-token");
    expect(stored).not.toContain("my-token");
    expect(decryptLineSecret(stored)).toBe("my-token");
  });

  it("cannot be read after NEXTAUTH_SECRET changes", () => {
    const stored = encryptLineSecret("my-token");
    process.env.NEXTAUTH_SECRET = "a-different-secret-111111111111111111";
    expect(() => decryptLineSecret(stored)).toThrow();
  });

  it("reports an unreadable credential instead of failing", async () => {
    await saveLineCredentials({ accessToken: "tok" });
    process.env.NEXTAUTH_SECRET = "a-different-secret-111111111111111111";
    invalidateLineConfig();
    const config = await getLineConfig();
    expect(config.accessToken).toBeNull();
    expect(config.undecryptable).toBe(true);
  });
});

describe("parseLineId", () => {
  it("knows groups, people and rooms", () => {
    expect(parseLineId(GROUP)?.type).toBe("group");
    expect(parseLineId(USER)?.type).toBe("user");
    expect(parseLineId("R" + "c".repeat(32))?.type).toBe("room");
  });

  it("rejects anything else", () => {
    expect(parseLineId("C123")).toBeNull();
    expect(parseLineId("@andamanasset")).toBeNull();
  });
});

describe("where the settings come from", () => {
  it("falls back to the environment", async () => {
    process.env.LINE_CHANNEL_ACCESS_TOKEN = "env-token";
    process.env.LINE_NOTIFY_TO = GROUP;
    const config = await getLineConfig();
    expect(config.tokenSource).toBe("env");
    expect(config.destinations[0]).toMatchObject({ id: GROUP, enabled: true, source: "env" });
    expect(await getActiveRecipients()).toEqual({ token: "env-token", to: [GROUP] });
  });

  it("prefers what an admin saved", async () => {
    process.env.LINE_CHANNEL_ACCESS_TOKEN = "env-token";
    await saveLineCredentials({ accessToken: "admin-token" });
    const config = await getLineConfig();
    expect(config.accessToken).toBe("admin-token");
    expect(config.tokenSource).toBe("admin");
  });

  it("sends nothing when the master switch is off", async () => {
    await saveLineCredentials({ accessToken: "admin-token" });
    await upsertLineDestination({ id: GROUP, type: "group", name: "Sales", enabled: true, source: "manual" });
    expect(await getActiveRecipients()).not.toBeNull();
    await setLineEnabled(false);
    expect(await getActiveRecipients()).toBeNull();
  });
});

describe("chats the OA is added to", () => {
  it("are recorded switched off", async () => {
    await saveLineCredentials({ accessToken: "admin-token" });
    await recordLineChat(GROUP, "group", "Sales team", "join");
    const config = await getLineConfig();
    expect(config.destinations).toEqual([
      expect.objectContaining({ id: GROUP, name: "Sales team", enabled: false, source: "join" }),
    ]);
    expect(await getActiveRecipients()).toBeNull();
  });

  it("keep an admin's switch when the OA rejoins, and stop when it leaves", async () => {
    await upsertLineDestination({ id: GROUP, type: "group", name: "Sales", enabled: true, source: "join" });
    await recordLineChat(GROUP, "group", "Sales renamed", "join");
    expect((await getLineConfig()).destinations[0]).toMatchObject({ enabled: true, name: "Sales renamed" });
    await recordLineChat(GROUP, "group", "", "leave");
    expect((await getLineConfig()).destinations[0].enabled).toBe(false);
  });
});
