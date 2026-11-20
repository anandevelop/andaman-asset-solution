/**
 * tests/mcp-registry.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Rules that must hold for every tool the AI connection offers, checked
 * over the real list so a new tool cannot be added without meeting them.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/admin/system-health", () => ({ getSystemHealth: vi.fn() }));
vi.mock("@/lib/system-errors", () => ({ recentSystemErrors: vi.fn() }));
// The tools' collaborators are not under test here — only what each tool declares.
vi.mock("@/app/[locale]/admin/(content)/media/actions", () => ({ updateMediaMeta: vi.fn() }));
vi.mock("@/lib/mcp/media-import", () => ({ MEDIA_IMPORT_JOB: "media.import" }));
vi.mock("@/lib/media", () => ({ getMediaLibrary: vi.fn() }));
vi.mock("@/lib/media-usage", () => ({ findMediaUsage: vi.fn(), findMediaUsageForUrls: vi.fn(), isMediaUrlInUse: vi.fn() }));
vi.mock("@/lib/s3", () => ({ deleteS3Object: vi.fn(), objectKeyFromUrl: vi.fn() }));

import "@/lib/mcp/tools";
import { allTools, describeTools } from "@/lib/mcp/registry";
import { deletionKinds } from "@/lib/mcp/deletions";

/** Areas the AI connection may read and never change. */
const READ_ONLY_AREAS = /^(system|settings|user|users)_/;
/** Words that mean data goes away. Such a tool must be marked destructive. */
const REMOVES = /(^|_)(delete|remove|erase|purge|clear|wipe|destroy|empty|replace)(_|$)/;

describe("every MCP tool", () => {
  const tools = allTools();

  it("exists", () => {
    expect(tools.length).toBeGreaterThanOrEqual(6);
  });

  it.each(tools.map((tool) => [tool.name, tool] as const))("%s: is described and has a usable schema", (_name, tool) => {
    expect(tool.description.length).toBeGreaterThan(30);
    expect(tool.title.length).toBeGreaterThan(2);
    const listed = describeTools().find((entry) => entry.name === tool.name)!;
    expect(JSON.parse(JSON.stringify(listed.inputSchema))).toMatchObject({ type: "object", additionalProperties: false });
  });

  it.each(tools.map((tool) => [tool.name, tool] as const))("%s: a tool that removes data says so and needs a write key", (name, tool) => {
    if (REMOVES.test(name)) expect(tool.destructive, `${name} must be destructive: true`).toBe(true);
    if (tool.destructive) expect(tool.access).toBe("write");
  });

  it.each(tools.map((tool) => [tool.name, tool] as const))("%s: the system area is read-only", (name, tool) => {
    if (READ_ONLY_AREAS.test(name)) expect(tool.access).toBe("read");
  });

  it.each(tools.map((tool) => [tool.name, tool] as const))("%s: names the capability it needs unless it is about the connection itself", (name, tool) => {
    const aboutTheConnection = ["whoami", "confirm_deletion", "deletion_status", "job_status"].includes(name) || READ_ONLY_AREAS.test(name);
    if (!aboutTheConnection) expect(tool.capability, `${name} needs a capability`).toBeTruthy();
  });

  it("has an executor behind every area that can ask for a deletion", () => {
    expect(deletionKinds()).toContain("media");
  });

  it("never offers users, keys or settings for editing", () => {
    for (const tool of tools) {
      expect(tool.name, tool.name).not.toMatch(/token|api_key|password|two_factor|role/);
    }
  });
});
