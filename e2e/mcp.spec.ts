/**
 * e2e/mcp.spec.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The AI connection end to end, against the real database: an
 * administrator makes a key for the Bot account, a client uses it over
 * /api/mcp in both protocol eras, and the key stops working the moment it
 * is revoked.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { APIRequestContext } from "@playwright/test";
import { expect, test } from "./harness";
import { BOT } from "./fixtures";
import { signIn } from "./sign-in";

test.setTimeout(180_000);

const MODERN = "2026-07-28";

function client(request: APIRequestContext, key: string) {
  let id = 0;
  return {
    /** A 2026-07-28 request: version and method in headers and in _meta. */
    modern(method: string, params: Record<string, unknown> = {}) {
      const headers: Record<string, string> = { Authorization: `Bearer ${key}`, "MCP-Protocol-Version": MODERN, "Mcp-Method": method };
      if (typeof params.name === "string") headers["Mcp-Name"] = params.name;
      return request.post("/api/mcp", {
        headers,
        data: { jsonrpc: "2.0", id: ++id, method, params: { ...params, _meta: { "io.modelcontextprotocol/protocolVersion": MODERN } } },
      });
    },
    /** An older client: no version header before initialize. */
    legacy(method: string, params: Record<string, unknown> = {}) {
      return request.post("/api/mcp", {
        headers: { Authorization: `Bearer ${key}` },
        data: { jsonrpc: "2.0", id: ++id, method, params },
      });
    },
  };
}

test("an AI client connects with a key, is held to it, and loses access when it is revoked", async ({ page, request }) => {
  // Nothing without a key, and nothing but POST.
  const anonymous = await request.post("/api/mcp", { data: { jsonrpc: "2.0", id: 1, method: "tools/list" } });
  expect(anonymous.status()).toBe(401);
  expect(anonymous.headers()["www-authenticate"]).toContain("Bearer");
  expect((await request.post("/api/mcp", { headers: { Authorization: "Bearer aas_not-a-real-key" }, data: {} })).status()).toBe(401);
  expect((await request.get("/api/mcp")).status()).toBe(405);

  // An administrator makes a read-only key for the Bot account.
  await page.goto("/en/login");
  await signIn(page);
  await page.goto("/en/admin/settings/integrations");
  const card = page.getByTestId("mcp-card");
  await expect(card).toContainText("/api/mcp");
  await card.getByLabel("Key name").fill("e2e read key");
  await card.getByLabel("Bot account").selectOption({ label: BOT.name });
  await card.getByRole("button", { name: "Create key" }).click();
  const key = (await card.getByTestId("mcp-new-key-value").innerText()).trim();
  expect(key).toMatch(/^aas_[A-Za-z0-9_-]{40,}$/);

  // Shown once: after a reload the page knows only its first characters.
  await page.reload();
  await expect(page.getByTestId("mcp-new-key")).toHaveCount(0);
  await expect(page.getByTestId("mcp-card")).toContainText("e2e read key");
  expect(await page.content()).not.toContain(key);

  const mcp = client(request, key);

  // Older handshake.
  const init = await mcp.legacy("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "e2e", version: "1" } });
  expect(init.status()).toBe(200);
  expect((await init.json()).result).toMatchObject({ protocolVersion: "2025-06-18", serverInfo: { name: "andaman-asset-solution" } });

  // Current revision: discovery, the tool list, a call.
  expect((await (await mcp.modern("server/discover")).json()).result.supportedVersions).toContain(MODERN);
  const tools = (await (await mcp.modern("tools/list")).json()).result.tools as { name: string }[];
  expect(tools.map((tool) => tool.name)).toEqual(expect.arrayContaining(["whoami", "system_status", "confirm_deletion", "job_status"]));

  const who = (await (await mcp.modern("tools/call", { name: "whoami", arguments: {} })).json()).result;
  expect(who.isError).toBe(false);
  expect(who.structuredContent).toMatchObject({ role: "BOT", scope: "read", capabilities: { viewCustomerContact: false, manageUsers: false } });

  const status = (await (await mcp.modern("tools/call", { name: "system_status", arguments: {} })).json()).result;
  expect(status.isError).toBe(false);
  expect(Array.isArray(status.structuredContent.services)).toBe(true);

  // A read-only key cannot reach a tool that changes anything.
  const refused = (await (await mcp.modern("tools/call", { name: "confirm_deletion", arguments: { requestId: "x", confirmationCode: "y" } })).json()).result;
  expect(refused).toMatchObject({ isError: true, structuredContent: { error: "FORBIDDEN" } });

  // Another site's page cannot drive the endpoint, key or no key.
  const foreign = await request.post("/api/mcp", {
    headers: { Authorization: `Bearer ${key}`, Origin: "https://evil.example" },
    data: { jsonrpc: "2.0", id: 9, method: "ping" },
  });
  expect(foreign.status()).toBe(403);

  // Revoked: the same key is refused at once.
  await page.getByTestId("mcp-card").getByRole("button", { name: "Revoke" }).first().click();
  await expect(page.getByTestId("mcp-card")).toContainText("Revoked");
  expect((await mcp.modern("tools/list")).status()).toBe(401);
});
