/**
 * e2e/mcp-editing.spec.ts
 * ─────────────────────────────────────────────────────────────────────────
 * An AI client working in the team's place, against the real database:
 * project text and SEO, a unit's price and status, an event, FAQs and the
 * site's wording — each saved through the back office's own action — and
 * the three lines it does not cross: publishing, releasing a reserved unit,
 * and the legal pages.
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
const STAMP = Date.now();
const EVENT_SLUG = `mcp-e2e-event-${STAMP}`;
const UNIT = `MCP-${String(STAMP).slice(-6)}`;

test.afterAll(async () => {
  await db().event.deleteMany({ where: { slug: { startsWith: "mcp-e2e-event-" } } });
  await db().projectUnit.deleteMany({ where: { unitNumber: { startsWith: "MCP-" } } });
  await db().faq.deleteMany({ where: { category: "mcp-e2e" } });
  await db().siteCopy.deleteMany({ where: { value: { contains: "mcp-e2e" } } });
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
    return { status: response.status(), result: body.result as { isError: boolean; structuredContent: Record<string, any> } };
  };
}

test("an AI client edits projects, units, events, FAQs and wording — and stops at the three lines", async ({ page, request }) => {
  await page.goto("/en/login");
  await signIn(page);
  await page.goto("/en/admin/settings/integrations");
  const card = page.getByTestId("mcp-card");
  await card.getByLabel("Key name").fill("e2e editing key");
  await card.getByLabel("Bot account").selectOption({ label: BOT.name });
  await card.getByLabel("Access").selectOption("write");
  await card.getByRole("button", { name: "Create key" }).click();
  const call = caller(request, (await card.getByTestId("mcp-new-key-value").innerText()).trim());

  const project = await db().project.findFirstOrThrow({ where: { slug: PROJECTS[0].slug }, select: { id: true, isPublished: true } });

  // ── Project text and SEO, one language, one field ───────────────────
  const before = await db().projectTranslation.findUnique({ where: { projectId_locale: { projectId: project.id, locale: "en" } } });
  const text = await call("project_update_content", { projectId: project.id, locale: "en", tagline: "A tagline written through the AI connection" });
  expect(text.result.structuredContent).toMatchObject({ status: "saved", liveOnSite: project.isPublished });
  const after = await db().projectTranslation.findUniqueOrThrow({ where: { projectId_locale: { projectId: project.id, locale: "en" } } });
  expect(after.tagline).toBe("A tagline written through the AI connection");
  if (before) expect(after).toMatchObject({ name: before.name, description: before.description, metaTitle: before.metaTitle });
  // A project from before the per-language table starts from its own columns.
  else expect(after.name).toBe((await db().project.findUniqueOrThrow({ where: { id: project.id } })).nameEn);

  expect((await call("project_update_seo", { projectId: project.id, locale: "en", metaDescription: "A meta description from the AI connection.", targetKeywords: ["phuket villa"] })).result.structuredContent).toMatchObject({ status: "saved" });
  expect(await db().projectTranslation.findUniqueOrThrow({ where: { projectId_locale: { projectId: project.id, locale: "en" } } })).toMatchObject({
    metaDescription: "A meta description from the AI connection.",
    targetKeywords: ["phuket villa"],
    tagline: "A tagline written through the AI connection",
  });
  expect((await db().project.findUniqueOrThrow({ where: { id: project.id } })).isPublished).toBe(project.isPublished);

  // ── A unit: price and status forward, notes untouched, no release ───
  const unit = await db().projectUnit.create({ data: { projectId: project.id, unitNumber: UNIT, status: "AVAILABLE", priceTHB: 9_000_000, adminNotes: "internal: owner's cousin is interested" } });
  const priced = await call("unit_update", { unitId: unit.id, priceTHB: 9_500_000, status: "RESERVED" });
  expect(priced.result.structuredContent).toMatchObject({ status: "saved", changed: ["priceTHB", "status"] });
  expect(JSON.stringify(priced.result)).not.toContain("cousin");
  const saved = await db().projectUnit.findUniqueOrThrow({ where: { id: unit.id } });
  expect(Number(saved.priceTHB)).toBe(9_500_000);
  expect(saved).toMatchObject({ status: "RESERVED", adminNotes: "internal: owner's cousin is interested", unitNumber: UNIT });
  const listed = (await call("units_list", { projectId: project.id, status: "RESERVED" })).result;
  expect(JSON.stringify(listed)).toContain(UNIT);
  expect(JSON.stringify(listed)).not.toContain("cousin");

  const release = await call("unit_update", { unitId: unit.id, status: "AVAILABLE" });
  expect(release.result).toMatchObject({ isError: true, structuredContent: { error: "FORBIDDEN" } });
  expect((await db().projectUnit.findUniqueOrThrow({ where: { id: unit.id } })).status).toBe("RESERVED");
  const audit = await db().auditLog.findFirst({ where: { model: "ProjectUnit", action: "update" }, orderBy: { createdAt: "desc" } });
  expect(audit?.actorEmail).toBe(BOT.email);

  // ── An event: created hidden, edited, still hidden ──────────────────
  const made = await call("event_create_draft", { locale: "en", slug: EVENT_SLUG, title: "Open house (AI connection test)", startsAt: "2027-03-06T10:00:00+07:00", capacity: 40 });
  expect(made.result.structuredContent).toMatchObject({ status: "created", published: false });
  const eventId = made.result.structuredContent.id as string;
  expect((await call("event_update", { id: eventId, locale: "th", title: "โอเพ่นเฮาส์ (ทดสอบ)", location: "The Trinity Village" })).result.structuredContent).toMatchObject({ status: "saved", created: true, published: false });
  const event = await db().event.findUniqueOrThrow({ where: { id: eventId }, include: { translations: true } });
  expect(event).toMatchObject({ isPublished: false, capacity: 40, location: "The Trinity Village" });
  expect(event.startsAt.toISOString()).toBe("2027-03-06T03:00:00.000Z");
  expect(event.translations.map((t) => t.locale).sort()).toEqual(["en", "th"]);
  expect((await request.get(`/en/events/${EVENT_SLUG}`)).status()).toBe(404);

  // ── FAQs: added hidden, edited, deleted only after confirmation ─────
  const faq = await call("faq_create", { locale: "en", question: "Can a foreigner buy a villa in Thailand?", answer: "Yes, with limits. See our guide.", category: "mcp-e2e" });
  expect(faq.result.structuredContent).toMatchObject({ status: "created", shownOnSite: false });
  const faqId = faq.result.structuredContent.id as string;
  expect((await call("faq_update", { id: faqId, locale: "th", question: "ต่างชาติซื้อวิลล่าในไทยได้ไหม", answer: "ได้ แต่มีข้อจำกัด ดูรายละเอียดในคู่มือ" })).result.structuredContent).toMatchObject({ status: "saved", created: true });
  expect((await call("faq_list")).result.structuredContent.faqs.find((row: { id: string }) => row.id === faqId)).toMatchObject({ isPublished: false, missingLanguages: ["zh", "ru"] });

  const asked = (await call("faq_delete", { ids: [faqId] })).result.structuredContent;
  expect(asked).toMatchObject({ status: "confirmation_required", tier: "chat" });
  expect(await db().faq.count({ where: { id: faqId } })).toBe(1);
  expect((await call("confirm_deletion", { requestId: asked.requestId, confirmationCode: asked.confirmationCode })).result.structuredContent).toMatchObject({ deleted: 1 });
  expect(await db().faq.count({ where: { id: faqId } })).toBe(0);

  // ── The site's wording: live at once; the legal pages are not offered ─
  const spaces = (await call("site_copy_get", { locale: "en" })).result.structuredContent.namespaces as { namespace: string; editableHere: boolean }[];
  expect(spaces.find((s) => s.namespace === "privacyPolicy")?.editableHere).toBe(false);
  const contact = (await call("site_copy_get", { locale: "en", namespace: "contact" })).result.structuredContent.entries as { key: string; text: string }[];
  const target = contact.find((entry) => !/[{<]/.test(entry.text) && entry.text.length > 8)!;
  const wording = await call("site_copy_update", { locale: "en", entries: { [target.key]: `${target.text} (mcp-e2e)` } });
  expect(wording.result.structuredContent).toMatchObject({ status: "saved", liveOnSite: true });
  expect((await db().siteCopy.findUniqueOrThrow({ where: { locale_key: { locale: "en", key: target.key } } })).value).toBe(`${target.text} (mcp-e2e)`);

  const legalKey = ((await call("site_copy_get", { locale: "en", namespace: "terms" })).result.structuredContent.entries as { key: string }[])[0].key;
  expect((await call("site_copy_update", { locale: "en", entries: { [legalKey]: "All sales are final. (mcp-e2e)" } })).result).toMatchObject({ isError: true, structuredContent: { error: "FORBIDDEN" } });
  expect(await db().siteCopy.count({ where: { key: legalKey, value: { contains: "mcp-e2e" } } })).toBe(0);
});
