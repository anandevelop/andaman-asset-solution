/**
 * tests/mcp-registry.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Rules that must hold for every tool the AI connection offers, checked
 * over the real list so a new tool cannot be added without meeting them.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
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
vi.mock("@/app/[locale]/admin/(content)/news/actions", () => ({ createArticle: vi.fn(), updateArticle: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/app/[locale]/admin/(catalog)/projects/[id]/content/actions", () => ({ saveProjectContent: vi.fn() }));
vi.mock("@/app/[locale]/admin/(catalog)/projects/[id]/seo/actions", () => ({ saveLocaleSeo: vi.fn() }));
vi.mock("@/app/[locale]/admin/(catalog)/projects/[id]/units/actions", () => ({ saveUnit: vi.fn() }));
vi.mock("@/app/[locale]/admin/(content)/events/actions", () => ({ createEvent: vi.fn(), updateEvent: vi.fn() }));
vi.mock("@/app/[locale]/admin/(content)/pages/faq/actions", () => ({ createFaq: vi.fn(), deleteFaq: vi.fn(), updateFaq: vi.fn() }));
vi.mock("@/app/[locale]/admin/(content)/pages/copy/actions", () => ({ updateSiteCopy: vi.fn() }));
vi.mock("@/lib/site-copy-content", () => ({ allCopyDefaults: vi.fn() }));

import "@/lib/mcp/tools";
import { allTools, describeTools, mayUse, WITHHELD_FROM_MCP } from "@/lib/mcp/registry";
import { deletionKinds, deletionTier } from "@/lib/mcp/deletions";

/** Areas the AI connection may read and never change. */
const READ_ONLY_AREAS = /^(system|settings|user|users)_/;
/** Words that mean data goes away. Such a tool must be marked destructive. */
const REMOVES = /(^|_)(delete|remove|erase|purge|clear|wipe|destroy|empty|replace)(_|$)/;

describe("every MCP tool", () => {
  const tools = allTools();

  it("exists", () => {
    expect(tools.length).toBeGreaterThanOrEqual(36);
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
    expect(deletionKinds()).toEqual(expect.arrayContaining(["media", "news.trash", "faq"]));
  });

  it("confirms every deletion in the conversation, as the team decided", () => {
    for (const kind of deletionKinds()) expect(deletionTier(kind), kind).toBe("chat");
  });

  it("offers no way to publish, and none to reach customers, users or settings", () => {
    for (const tool of tools) {
      expect(tool.name, tool.name).not.toMatch(/publish|lead_|leads_(?!summary)|appointment|agent|user_|users_|setting/);
    }
  });

  it("never offers users, keys or settings for editing", () => {
    for (const tool of tools) {
      expect(tool.name, tool.name).not.toMatch(/token|api_key|password|two_factor|role/);
    }
  });
});

/*
  The decision for this connection: an AI client never sees who a customer
  is, and never sees an account's secrets. Checked on the source of the
  tools themselves, because a query that selects a customer's phone number
  is a leak whether or not any test happens to call it.
*/
describe("job applications", () => {
  it("are withheld from the connector whatever role it runs as", () => {
    expect(WITHHELD_FROM_MCP).toContain("manageCareers");
    for (const role of ["SUPER_ADMIN", "BOT", "HR"] as const) expect(mayUse(role as never, "manageCareers"), role).toBe(false);
    expect(allTools().filter((tool) => tool.capability === "manageCareers")).toEqual([]);
    expect(allTools().filter((tool) => /career|applicant|job_application|vacanc/.test(tool.name)).map((tool) => tool.name)).toEqual([]);
  });
});

describe("what the tools may read", () => {
  const dir = path.join(process.cwd(), "lib", "mcp", "tools");
  const sources = readdirSync(dir)
    .filter((file) => file.endsWith(".ts"))
    .map((file) => [file, readFileSync(path.join(dir, file), "utf8")] as const);

  const PERSONAL = /\b(email|phone|phoneCountry|whatsapp|whatsappNumber|phoneNumber|message|nationality|ipAddress|userAgent|agencyName|passwordHash|totpSecret|adminNotes|reservedBy\w*|notes)\s*:\s*true\b/;
  const PEOPLE_TABLES = /prisma\.(user|agent|leadNote|recoveryCode|account|session|suspectLead|leadBlock|salesPerson|auditLog|apiToken|siteSetting|jobApplication|jobApplicationFile|jobApplicationNote|jobPosition)\./;

  it.each(sources)("%s selects no customer contact data or secrets", (_file, source) => {
    expect(source).not.toMatch(PERSONAL);
  });

  it.each(sources)("%s does not query the tables that are about people or keys", (_file, source) => {
    expect(source).not.toMatch(PEOPLE_TABLES);
  });

  it.each(sources)("%s has nothing to do with job applications", (_file, source) => {
    // CVs, salaries and phone numbers of people who are not customers:
    // no tool reads them, and manageCareers is withheld from the connector.
    expect(source).not.toMatch(/@\/lib\/careers\//);
  });

  it.each(sources)("%s never returns whole rows of enquiries or registrations", (_file, source) => {
    // groupBy / count / aggregate only — and findMany on enquiries solely for dates.
    for (const call of source.matchAll(/prisma\.(leadInquiry|eventRegistration|appointment)\.(\w+)\(([\s\S]{0,200})/g)) {
      const [, table, method, args] = call;
      if (["count", "groupBy", "aggregate"].includes(method)) continue;
      expect(`${table}.${method}`, "only counts").toBe("leadInquiry.findMany");
      expect(args).toMatch(/select:\s*\{\s*createdAt:\s*true\s*\}/);
    }
  });
});
