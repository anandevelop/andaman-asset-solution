/**
 * lib/mcp/registry.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The tools the AI connection offers, and the one place a call is checked
 * before it runs.
 *
 * A tool declares what it needs — `access` ("read" changes nothing; "write"
 * does) and optionally a capability from lib/permissions.ts — and
 * callTool() refuses before the handler is entered. A handler therefore
 * never has to remember to check, and tests/mcp-registry.test.ts can prove
 * the rule for every tool at once rather than one at a time.
 *
 * `destructive: true` marks a tool that asks for a deletion. It must go
 * through requestDeletion (lib/mcp/deletions.ts); the Prisma-level guard in
 * lib/mcp/context.ts is what makes that a fact rather than a convention.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { z } from "zod";
import { can, type Capability } from "@/lib/permissions";
import type { McpActor } from "@/lib/mcp/context";

export type ToolDefinition<Shape extends z.ZodRawShape = z.ZodRawShape> = {
  name: string;
  title: string;
  description: string;
  access: "read" | "write";
  capability?: Capability;
  destructive?: boolean;
  input: Shape;
  handler: (args: z.infer<z.ZodObject<Shape>>, actor: McpActor) => Promise<unknown>;
};

const globalForTools = globalThis as unknown as { mcpTools?: Map<string, ToolDefinition> };
const tools = (globalForTools.mcpTools ??= new Map<string, ToolDefinition>());

export function defineTool<Shape extends z.ZodRawShape>(tool: ToolDefinition<Shape>): void {
  if (!/^[a-z][a-z0-9_]{2,63}$/.test(tool.name)) throw new Error(`bad tool name "${tool.name}"`);
  tools.set(tool.name, tool as unknown as ToolDefinition);
}

export function allTools(): ToolDefinition[] {
  return [...tools.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** The shape `tools/list` sends. Same for every key: what a key may *call* is decided at the call. */
export function describeTools() {
  return allTools().map((tool) => ({
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: { ...z.toJSONSchema(z.object(tool.input).strict()), $schema: undefined },
    annotations: {
      title: tool.title,
      readOnlyHint: tool.access === "read",
      destructiveHint: Boolean(tool.destructive),
      openWorldHint: false,
    },
  }));
}

export type ToolOutcome =
  | { kind: "ok"; value: unknown }
  | { kind: "tool_error"; code: string; message: string }
  | { kind: "unknown_tool" }
  | { kind: "invalid_arguments"; message: string };

/**
 * What the AI connection does not reach, whatever the account's role says.
 *
 * In the back office a Bot account now has the owner's reach apart from
 * user accounts (lib/permissions.ts). The connection is a different matter:
 * what goes through it leaves the server for an AI provider, and the
 * decision made for it — customers are counted, never shown; accounts are
 * not offered — stands until somebody decides otherwise. So it is written
 * down here, as a rule, rather than left to the accident that no tool for
 * it happens to exist yet.
 */
export const WITHHELD_FROM_MCP: readonly Capability[] = ["viewCustomerContact", "exportCustomerData", "manageUsers"];

export function mayUse(role: McpActor["role"], capability: Capability): boolean {
  return !WITHHELD_FROM_MCP.includes(capability) && can(role, capability);
}

export function mayCall(tool: Pick<ToolDefinition, "access" | "capability">, actor: Pick<McpActor, "scope" | "role">): boolean {
  if (tool.access === "write" && actor.scope !== "write") return false;
  if (tool.capability && !mayUse(actor.role, tool.capability)) return false;
  return true;
}

/** Messages a handler may throw on purpose; anything else is reported as INTERNAL. */
const KNOWN_ERRORS = /^[A-Z][A-Z0-9_]{2,40}(?::.*)?$/;

export async function callTool(name: string, rawArgs: unknown, actor: McpActor): Promise<ToolOutcome> {
  const tool = tools.get(name);
  if (!tool) return { kind: "unknown_tool" };

  if (!mayCall(tool, actor)) {
    return {
      kind: "tool_error",
      code: "FORBIDDEN",
      message:
        tool.access === "write" && actor.scope !== "write"
          ? "This key is read-only. An administrator can issue a key with write access."
          : "This account is not allowed to do that.",
    };
  }

  const parsed = z.object(tool.input).strict().safeParse(rawArgs ?? {});
  if (!parsed.success) {
    return { kind: "invalid_arguments", message: parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ") };
  }

  try {
    return { kind: "ok", value: await tool.handler(parsed.data, actor) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (KNOWN_ERRORS.test(message)) return { kind: "tool_error", code: message.split(":")[0], message };
    console.error(`[mcp] tool ${name} failed`, error);
    return { kind: "tool_error", code: "INTERNAL", message: "The tool failed. The error was logged." };
  }
}
