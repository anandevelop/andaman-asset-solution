/**
 * e2e/mcp-media.spec.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The media library through the AI connection, against the real database:
 * reading and describing images, an upload that is accepted at once and
 * finished in the background, and the deletion rule — asking removes
 * nothing, a wrong code removes nothing, the right code removes exactly
 * what was shown.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { APIRequestContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { pgAdapter } from "../lib/prisma-adapter";
import { expect, test } from "./harness";
import { BOT, MEDIA } from "./fixtures";
import { signIn } from "./sign-in";

test.setTimeout(240_000);

const MODERN = "2026-07-28";
let client: PrismaClient | null = null;
const db = () => (client ??= new PrismaClient({ adapter: pgAdapter(process.env.E2E_DATABASE_URL) }));

test.afterAll(async () => {
  await db().media.deleteMany({ where: { url: { startsWith: "/mcp-e2e-" } } });
  await client?.$disconnect();
});

function caller(request: APIRequestContext, key: string) {
  let id = 0;
  return async (name: string, args: Record<string, unknown> = {}) => {
    const response = await request.post("/api/mcp", {
      headers: { Authorization: `Bearer ${key}`, "MCP-Protocol-Version": MODERN, "Mcp-Method": "tools/call", "Mcp-Name": name },
      data: {
        jsonrpc: "2.0",
        id: ++id,
        method: "tools/call",
        params: { name, arguments: args, _meta: { "io.modelcontextprotocol/protocolVersion": MODERN } },
      },
    });
    const body = await response.json();
    return { status: response.status(), result: body.result as { isError: boolean; structuredContent: Record<string, any> }, error: body.error };
  };
}

test("an AI client reads, describes, uploads and — only after confirmation — deletes media", async ({ page, request }) => {
  await page.goto("/en/login");
  await signIn(page);
  await page.goto("/en/admin/settings/integrations");
  const card = page.getByTestId("mcp-card");
  await card.getByLabel("Key name").fill("e2e media key");
  await card.getByLabel("Bot account").selectOption({ label: BOT.name });
  await card.getByLabel("Access").selectOption("write");
  await card.getByRole("button", { name: "Create key" }).click();
  const key = (await card.getByTestId("mcp-new-key-value").innerText()).trim();
  const call = caller(request, key);

  // Two images nobody uses, and the seeded one, which must survive.
  const [spareA, spareB] = await Promise.all(
    ["a", "b"].map((n) => db().media.create({ data: { url: `/mcp-e2e-${n}-${Date.now()}.png`, mimeType: "image/png", tags: ["mcp-e2e"] } })),
  );
  const seeded = await db().media.findFirstOrThrow({ where: { url: MEDIA.url } });

  // Reading.
  const listed = await call("media_list", { tag: "mcp-e2e" });
  expect(listed.result.isError).toBe(false);
  expect(listed.result.structuredContent.total).toBe(2);
  expect(listed.result.structuredContent.items[0]).toMatchObject({ altComplete: false, usageCount: 0 });

  // Describing: only the languages sent change.
  const described = await call("media_update", { id: seeded.id, altText: { th: "รูปทดสอบจากชุดทดสอบ" } });
  expect(described.result.isError).toBe(false);
  expect((await db().media.findUniqueOrThrow({ where: { id: seeded.id } })).altText).toMatchObject({ en: MEDIA.altText.en, th: "รูปทดสอบจากชุดทดสอบ" });
  // …and it is in the activity log as the bot's doing.
  const entry = await db().auditLog.findFirst({ where: { model: "Media", recordId: seeded.id, action: "update" }, orderBy: { createdAt: "desc" } });
  expect(entry?.actorEmail).toBe(BOT.email);

  // Uploading: an address inside the network is refused before anything is queued…
  for (const url of ["https://169.254.169.254/latest/meta-data/", "http://example.com/a.jpg", "https://localhost/a.png"]) {
    const refused = await call("media_upload", { url });
    expect(refused.result, url).toMatchObject({ isError: true });
  }
  // …and a public one is accepted at once and worked on afterwards. This
  // environment has no storage, so the job ends FAILED — which is the point
  // being tested: the answer did not wait for it, and the reason is reported.
  const accepted = await call("media_upload", { url: "https://images.example.com/villa.jpg", tags: ["mcp-e2e"] });
  expect(accepted.result.structuredContent).toMatchObject({ status: "accepted" });
  const jobId = accepted.result.structuredContent.jobId as string;
  await expect
    .poll(async () => (await call("job_status", { jobId })).result.structuredContent.status, { timeout: 30_000 })
    .toMatch(/FAILED|QUEUED/);
  const job = (await call("job_status", { jobId })).result.structuredContent;
  expect(job.error).toBeTruthy();

  // Deleting. An image in use is refused outright.
  // (The seeded image is not referenced by any page in this database, so
  //  the two spares stand for "unused" and an unknown id for "not there".)
  expect((await call("media_delete", { ids: ["does-not-exist"] })).result).toMatchObject({ isError: true, structuredContent: { error: "NOT_FOUND" } });

  // Asking deletes nothing.
  const asked = await call("media_delete", { ids: [spareA.id, spareB.id] });
  expect(asked.result.structuredContent).toMatchObject({ status: "confirmation_required", tier: "chat" });
  expect(asked.result.structuredContent.summary).toContain("2 unused image");
  expect(await db().media.count({ where: { id: { in: [spareA.id, spareB.id] } } })).toBe(2);

  // A wrong code deletes nothing and spends the request.
  const { requestId, confirmationCode } = asked.result.structuredContent;
  expect((await call("confirm_deletion", { requestId, confirmationCode: "wrong" })).result).toMatchObject({ isError: true, structuredContent: { error: "WRONG_CODE" } });
  expect((await call("confirm_deletion", { requestId, confirmationCode })).result).toMatchObject({ isError: true, structuredContent: { error: "NOT_PENDING" } });
  expect(await db().media.count({ where: { id: { in: [spareA.id, spareB.id] } } })).toBe(2);

  // Asked again and confirmed properly: exactly those two go.
  const again = await call("media_delete", { ids: [spareA.id, spareB.id] });
  const confirmed = await call("confirm_deletion", { requestId: again.result.structuredContent.requestId, confirmationCode: again.result.structuredContent.confirmationCode });
  expect(confirmed.result.structuredContent).toMatchObject({ status: "deleted", deleted: 2 });
  expect(await db().media.count({ where: { id: { in: [spareA.id, spareB.id] } } })).toBe(0);
  expect(await db().media.count({ where: { id: seeded.id } })).toBe(1);
  expect((await call("deletion_status", { requestId: again.result.structuredContent.requestId })).result.structuredContent).toMatchObject({ status: "EXECUTED" });
});
