/**
 * tests/mcp-protocol.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The protocol half of /api/mcp as a plain function: both eras of the
 * handshake, what each kind of failure looks like on the wire, and the one
 * check every tool call passes before its handler runs.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { Role } from "@prisma/client";

vi.mock("server-only", () => ({}));

import { decodeHeaderValue, handleMcp, LEGACY_VERSIONS, MODERN_VERSION, type RequestHeaders } from "@/lib/mcp/protocol";
import { defineTool, mayCall } from "@/lib/mcp/registry";
import type { McpActor } from "@/lib/mcp/context";

const reader: McpActor = { userId: "u", name: "Bot", email: "b@t", role: Role.BOT, tokenId: "t", tokenName: "k", scope: "read" };
const writer: McpActor = { ...reader, scope: "write" };

const ran = vi.fn();
defineTool({ name: "t_echo", title: "Echo", description: "d", access: "read", input: { text: z.string().max(20) }, handler: async ({ text }) => ({ text }) });
defineTool({ name: "t_write", title: "Write", description: "d", access: "write", input: {}, handler: async () => { ran(); return "done"; } });
defineTool({ name: "t_leads", title: "Leads", description: "d", access: "read", capability: "viewCustomerContact", input: {}, handler: async () => { ran(); return {}; } });
defineTool({ name: "t_known", title: "Known", description: "d", access: "read", input: {}, handler: async () => { throw new Error("NOT_FOUND"); } });
defineTool({ name: "t_crash", title: "Crash", description: "d", access: "read", input: {}, handler: async () => { throw new Error("connect ECONNREFUSED 10.0.0.5:5432"); } });

const legacy: RequestHeaders = { protocolVersion: null, method: null, name: null };
const modern = (method: string, name: string | null = null): RequestHeaders => ({ protocolVersion: MODERN_VERSION, method, name });
const rpc = (method: string, params?: unknown, id: number | string = 1) => JSON.stringify({ jsonrpc: "2.0", id, method, params });
const withMeta = (params: Record<string, unknown> = {}) => ({ ...params, _meta: { "io.modelcontextprotocol/protocolVersion": MODERN_VERSION } });
type Body = { result?: Record<string, unknown>; error?: { code: number; message: string; data?: unknown } };

describe("older clients (initialize handshake)", () => {
  it("answers initialize with the version asked for when it is one we speak", async () => {
    for (const version of LEGACY_VERSIONS) {
      const { status, body } = await handleMcp(rpc("initialize", { protocolVersion: version, capabilities: {} }), legacy, reader);
      expect(status).toBe(200);
      expect((body as Body).result).toMatchObject({ protocolVersion: version, capabilities: { tools: {} }, serverInfo: { name: "andaman-asset-solution" } });
    }
  });

  it("offers its newest handshake version to a client asking for an unknown one", async () => {
    const { body } = await handleMcp(rpc("initialize", { protocolVersion: "1999-01-01" }), legacy, reader);
    expect((body as Body).result?.protocolVersion).toBe(LEGACY_VERSIONS[0]);
  });

  it("accepts notifications without a body", async () => {
    const answer = await handleMcp(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }), legacy, reader);
    expect(answer).toEqual({ status: 202, body: null });
  });

  it("keeps protocol errors inside a 200", async () => {
    const { status, body } = await handleMcp(rpc("resources/list"), legacy, reader);
    expect(status).toBe(200);
    expect((body as Body).error?.code).toBe(-32601);
  });

  it("answers a batch the way 2025-03-26 allowed", async () => {
    const batch = JSON.stringify([
      { jsonrpc: "2.0", id: 1, method: "ping" },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
    ]);
    const { status, body } = await handleMcp(batch, legacy, reader);
    expect(status).toBe(200);
    expect((body as unknown[]).length).toBe(2);
  });
});

describe("2026-07-28 clients (no handshake)", () => {
  it("describes itself to server/discover", async () => {
    const { status, body } = await handleMcp(rpc("server/discover", withMeta()), modern("server/discover"), reader);
    expect(status).toBe(200);
    expect((body as Body).result).toMatchObject({ resultType: "complete", capabilities: { tools: {} } });
    expect((body as Body).result?.supportedVersions).toContain(MODERN_VERSION);
  });

  it("rejects a version it does not speak, naming the ones it does", async () => {
    const { status, body } = await handleMcp(rpc("ping"), { protocolVersion: "2030-01-01", method: "ping", name: null }, reader);
    expect(status).toBe(400);
    expect((body as Body).error).toMatchObject({ code: -32022, data: { requested: "2030-01-01" } });
  });

  it("requires the header and the body to agree", async () => {
    expect((await handleMcp(rpc("tools/list", withMeta()), modern("ping"), reader)).status).toBe(400);
    expect((await handleMcp(rpc("tools/list", {}), modern("tools/list"), reader)).status).toBe(400);
    const wrongName = await handleMcp(rpc("tools/call", withMeta({ name: "t_echo", arguments: { text: "a" } })), modern("tools/call", "t_other"), reader);
    expect(wrongName.status).toBe(400);
    expect((wrongName.body as Body).error?.code).toBe(-32020);
  });

  it("uses HTTP status for protocol errors and refuses batches", async () => {
    expect((await handleMcp(rpc("resources/list", withMeta()), modern("resources/list"), reader)).status).toBe(404);
    expect((await handleMcp("[]", modern("ping"), reader)).status).toBe(400);
  });

  it("lists tools with a schema and honest hints", async () => {
    const { body } = await handleMcp(rpc("tools/list", withMeta()), modern("tools/list"), reader);
    const result = (body as Body).result as { tools: { name: string; inputSchema: { type: string }; annotations: { readOnlyHint: boolean } }[]; ttlMs: number };
    const echo = result.tools.find((tool) => tool.name === "t_echo")!;
    expect(echo.inputSchema.type).toBe("object");
    expect(echo.annotations.readOnlyHint).toBe(true);
    expect(result.tools.find((tool) => tool.name === "t_write")!.annotations.readOnlyHint).toBe(false);
    expect(result.ttlMs).toBeGreaterThan(0);
  });

  it("decodes a base64 Mcp-Name", () => {
    expect(decodeHeaderValue("t_echo")).toBe("t_echo");
    expect(decodeHeaderValue(`=?base64?${Buffer.from("ชื่อ").toString("base64")}?=`)).toBe("ชื่อ");
  });
});

describe("calling a tool", () => {
  const call = (name: string, args: unknown, actor = reader) =>
    handleMcp(rpc("tools/call", withMeta({ name, arguments: args })), modern("tools/call", name), actor);

  it("returns the result as text and as structured content", async () => {
    const { status, body } = await call("t_echo", { text: "hello" });
    expect(status).toBe(200);
    expect((body as Body).result).toMatchObject({ isError: false, structuredContent: { text: "hello" } });
  });

  it("rejects arguments the schema does not allow, including extra ones", async () => {
    expect((await call("t_echo", { text: "x".repeat(21) })).status).toBe(400);
    expect((await call("t_echo", { text: "ok", extra: 1 })).status).toBe(400);
    expect((await call("t_missing", {})).status).toBe(400);
  });

  it("stops a read-only key before a tool that changes anything", async () => {
    ran.mockClear();
    const { body } = await call("t_write", {});
    expect((body as Body).result).toMatchObject({ isError: true, structuredContent: { error: "FORBIDDEN" } });
    expect(ran).not.toHaveBeenCalled();
    await call("t_write", {}, writer);
    expect(ran).toHaveBeenCalledOnce();
  });

  it("stops before customer contact data, whatever the key and whatever the role", async () => {
    ran.mockClear();
    const { body } = await call("t_leads", {}, writer);
    expect((body as Body).result).toMatchObject({ isError: true, structuredContent: { error: "FORBIDDEN" } });
    expect(ran).not.toHaveBeenCalled();
    // The role may see customers in the back office; the connection does not carry them.
    for (const role of [Role.BOT, Role.ADMIN, Role.SUPER_ADMIN]) {
      expect(mayCall({ access: "read", capability: "viewCustomerContact" }, { scope: "write", role })).toBe(false);
      expect(mayCall({ access: "read", capability: "manageUsers" }, { scope: "write", role })).toBe(false);
    }
    expect(mayCall({ access: "read", capability: "viewContent" }, { scope: "read", role: Role.BOT })).toBe(true);
  });

  it("passes on an error a tool raised on purpose and hides one it did not", async () => {
    expect(((await call("t_known", {})).body as Body).result).toMatchObject({ isError: true, structuredContent: { error: "NOT_FOUND" } });
    const crash = JSON.stringify((await call("t_crash", {})).body);
    expect(crash).toContain("INTERNAL");
    expect(crash).not.toContain("10.0.0.5");
  });
});

describe("malformed input", () => {
  it("is refused without reaching a tool", async () => {
    expect((await handleMcp("{not json", legacy, reader)).status).toBe(400);
    expect((await handleMcp('"text"', legacy, reader)).status).toBe(400);
    expect((await handleMcp(JSON.stringify({ id: 1, method: "ping" }), legacy, reader)).status).toBe(400);
  });
});
