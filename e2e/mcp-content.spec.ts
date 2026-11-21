/**
 * e2e/mcp-content.spec.ts
 * ─────────────────────────────────────────────────────────────────────────
 * News, projects, units, events and the numbers, through the AI connection
 * and against the real database: an article drafted and translated by a
 * client is a draft a person can open in the back office, the trash is
 * reached only through a confirmation, and nothing that identifies a
 * customer comes out of any tool.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { APIRequestContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { pgAdapter } from "../lib/prisma-adapter";
import { expect, test } from "./harness";
import { BOT, PROJECTS } from "./fixtures";
import { signIn } from "./sign-in";

test.setTimeout(240_000);

const MODERN = "2026-07-28";
let client: PrismaClient | null = null;
const db = () => (client ??= new PrismaClient({ adapter: pgAdapter(process.env.E2E_DATABASE_URL) }));
const SLUG = `mcp-e2e-article-${Date.now()}`;
const SECRET_NAME = "Zebediah Quillfeather";
const SECRET_PHONE = "+66811112222";

test.afterAll(async () => {
  await db().newsArticle.deleteMany({ where: { slug: { startsWith: "mcp-e2e-article-" } } });
  await db().leadInquiry.deleteMany({ where: { name: SECRET_NAME } });
  await client?.$disconnect();
});

function caller(request: APIRequestContext, key: string) {
  let id = 0;
  return async (name: string, args: Record<string, unknown> = {}) => {
    const response = await request.post("/api/mcp", {
      headers: { Authorization: `Bearer ${key}`, "MCP-Protocol-Version": MODERN, "Mcp-Method": "tools/call", "Mcp-Name": name },
      data: { jsonrpc: "2.0", id: ++id, method: "tools/call", params: { name, arguments: args, _meta: { "io.modelcontextprotocol/protocolVersion": MODERN } } },
    });
    const body = await response.json();
    return { status: response.status(), raw: JSON.stringify(body), result: body.result as { isError: boolean; structuredContent: Record<string, any> } };
  };
}

test("an AI client drafts and translates an article, reads the catalogue and the numbers, and never sees a customer", async ({ page, request }) => {
  await page.goto("/en/login");
  await signIn(page);
  await page.goto("/en/admin/settings/integrations");
  const card = page.getByTestId("mcp-card");
  await card.getByLabel("Key name").fill("e2e content key");
  await card.getByLabel("Bot account").selectOption({ label: BOT.name });
  await card.getByLabel("Access").selectOption("write");
  await card.getByRole("button", { name: "Create key" }).click();
  const call = caller(request, (await card.getByTestId("mcp-new-key-value").innerText()).trim());

  // ── News ────────────────────────────────────────────────────────────
  const invalid = await call("news_create_draft", { locale: "en", slug: "Not A Slug", title: "x", content: "y" });
  expect(invalid.status).toBe(400);

  const created = await call("news_create_draft", {
    locale: "en",
    slug: SLUG,
    title: "Buying a villa in Phuket as a foreigner",
    content: "## The short answer\n\nYes, with limits. This is a test article written through the AI connection.",
    excerpt: "What a foreign buyer can and cannot own.",
    tags: ["guide", "mcp-e2e"],
  });
  expect(created.result.structuredContent).toMatchObject({ status: "created", published: false });
  const articleId = created.result.structuredContent.id as string;
  expect(articleId).toBeTruthy();

  // A second language, then an edit that touches one field only.
  expect((await call("news_update", { id: articleId, locale: "th", title: "ต่างชาติซื้อวิลล่าในภูเก็ตได้ไหม", content: "## คำตอบสั้น\n\nได้ แต่มีข้อจำกัด" })).result.structuredContent).toMatchObject({ status: "saved", created: true });
  expect((await call("news_update", { id: articleId, locale: "en", metaDescription: "A developer's plain answer for foreign buyers." })).result.structuredContent).toMatchObject({ status: "saved", created: false });
  // A language that does not exist yet needs both title and content.
  expect((await call("news_update", { id: articleId, locale: "ru", title: "Только заголовок" })).result).toMatchObject({ isError: true, structuredContent: { error: "VALIDATION_FAILED" } });

  const read = (await call("news_get", { slug: SLUG })).result.structuredContent;
  expect(read).toMatchObject({ isPublished: false, tags: ["guide", "mcp-e2e"] });
  expect(Object.keys(read.versions).sort()).toEqual(["en", "th"]);
  expect(read.versions.en).toMatchObject({ title: "Buying a villa in Phuket as a foreigner", metaDescription: "A developer's plain answer for foreign buyers." });
  expect(read.versions.en.content).toContain("The short answer");

  // Still a draft, in the bot's name, and not on the public site.
  const stored = await db().newsArticle.findUniqueOrThrow({ where: { id: articleId }, include: { author: true } });
  expect(stored).toMatchObject({ isPublished: false, contentStatus: "DRAFT" });
  expect(stored.author?.email).toBe(BOT.email);
  expect((await request.get(`/en/news/${SLUG}`)).status()).toBe(404);
  // …and a person can open it in the editor.
  await page.goto(`/en/admin/news/${articleId}/edit`);
  await expect(page.locator('input[name="title"]').first()).toHaveValue("Buying a villa in Phuket as a foreigner");

  const listed = (await call("news_list", { query: "mcp-e2e-article" })).result.structuredContent;
  expect(listed.items[0]).toMatchObject({ id: articleId, missingLanguages: ["zh", "ru"] });

  // The trash is reached only through a confirmation.
  const asked = (await call("news_delete", { ids: [articleId] })).result.structuredContent;
  expect(asked).toMatchObject({ status: "confirmation_required" });
  expect((await db().newsArticle.findUniqueOrThrow({ where: { id: articleId } })).deletedAt).toBeNull();
  expect((await call("confirm_deletion", { requestId: asked.requestId, confirmationCode: asked.confirmationCode })).result.structuredContent).toMatchObject({ status: "deleted", deleted: 1 });
  expect((await db().newsArticle.findUniqueOrThrow({ where: { id: articleId } })).deletedAt).not.toBeNull();
  expect((await call("news_get", { id: articleId })).result).toMatchObject({ isError: true });

  // ── Catalogue ───────────────────────────────────────────────────────
  const projects = (await call("projects_list")).result.structuredContent.projects as { id: string; slug: string }[];
  expect(projects.map((p) => p.slug)).toEqual(expect.arrayContaining(PROJECTS.map((p) => p.slug)));
  const project = (await call("project_get", { slug: PROJECTS[0].slug })).result.structuredContent;
  expect(project.versions).toBeTruthy();
  expect((await call("units_list", { projectId: projects[0].id })).result.isError).toBe(false);
  expect((await call("progress_list", { projectId: projects[0].id })).result.isError).toBe(false);
  expect((await call("ebrochures_list")).result.isError).toBe(false);
  expect((await call("events_list")).result.isError).toBe(false);
  expect((await call("traffic_summary", { days: 7 })).result.isError).toBe(false);
  expect((await call("seo_overview")).result.isError).toBe(false);

  // ── Customers: counted, never shown ─────────────────────────────────
  await db().leadInquiry.create({
    data: { name: SECRET_NAME, email: "zebediah@customer.test", phone: SECRET_PHONE, message: "Please call me about unit A1", source: "CONTACT_PAGE", projectId: projects[0].id, consentGiven: true },
  });
  const leads = await call("leads_summary", { days: 1 });
  expect(leads.result.structuredContent.total).toBeGreaterThanOrEqual(1);
  expect(leads.result.structuredContent.bySource.CONTACT_PAGE).toBeGreaterThanOrEqual(1);

  // Every read tool, swept for anything of that customer's.
  const everything = [
    leads.raw,
    (await call("projects_list")).raw,
    (await call("project_get", { id: projects[0].id })).raw,
    (await call("units_list", { projectId: projects[0].id })).raw,
    (await call("events_list")).raw,
    (await call("traffic_summary", { days: 1 })).raw,
    (await call("system_errors")).raw,
  ].join("\n");
  for (const secret of [SECRET_NAME, "Zebediah", "zebediah@customer.test", SECRET_PHONE, "unit A1"]) {
    expect(everything, secret).not.toContain(secret);
  }
});
