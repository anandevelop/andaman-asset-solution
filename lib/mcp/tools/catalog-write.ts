/**
 * lib/mcp/tools/catalog-write.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Editing for an AI client working in the team's place: project text and
 * SEO, units, events and FAQs. Each tool saves through the action the back
 * office's own screen uses, so the same validation, the same rules and the
 * same activity log apply, with the bot as the one who did it.
 *
 * THREE THINGS THESE TOOLS DO NOT DO, each on purpose.
 *
 * They do not publish. Whether something is live is left exactly as it
 * was; a new event or FAQ starts hidden. Text saved on a project that is
 * already published does appear on the site at once — the answer says so
 * (`liveOnSite`) — because that is what saving it means in the back office
 * too.
 *
 * They do not release a unit. Marking a reserved or sold unit AVAILABLE
 * erases who reserved it. That is a sales decision with a customer on the
 * other end of it, and it stays with a person.
 *
 * They do not touch a unit's internal notes or its reservation. Notes are
 * carried through a save unchanged, unseen.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { locales } from "@/i18n";
import { defineTool } from "@/lib/mcp/registry";
import { registerDeletion, requestDeletion } from "@/lib/mcp/deletions";
import { describeFailure, redirectTarget, toForm } from "@/lib/mcp/tools/form";
import { saveProjectContent } from "@/app/[locale]/admin/(catalog)/projects/[id]/content/actions";
import { saveLocaleSeo } from "@/app/[locale]/admin/(catalog)/projects/[id]/seo/actions";
import { saveUnit } from "@/app/[locale]/admin/(catalog)/projects/[id]/units/actions";
import { createEvent, updateEvent } from "@/app/[locale]/admin/(content)/events/actions";
import { createFaq, deleteFaq, updateFaq } from "@/app/[locale]/admin/(content)/pages/faq/actions";
import { updateSiteCopy } from "@/app/[locale]/admin/(content)/pages/copy/actions";
import { allCopyDefaults } from "@/lib/site-copy-content";

const localeInput = z.enum(locales).describe("Which language version: en, th, zh or ru");
const slugInput = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(2).max(140);
const ADMIN_LOCALE = "th";

/* ── Projects ──────────────────────────────────────────────────────────── */

defineTool({
  name: "project_update_content",
  title: "Edit a project's text in one language",
  description:
    "Edits the text of one language version of a project: name, tagline, location line, description, concept design, about-this-project. Only the fields you send change; adds the language if it does not exist yet (name is then required). If the project is published the new text is live on the website immediately — the answer says whether it is.",
  access: "write",
  capability: "editContent",
  input: {
    projectId: z.string().min(1).max(64),
    locale: localeInput,
    name: z.string().trim().min(1).max(300).optional(),
    tagline: z.string().trim().max(500).optional(),
    location: z.string().trim().max(300).optional(),
    description: z.string().trim().max(8000).optional(),
    conceptDesign: z.string().trim().max(20000).optional(),
    aboutThisProject: z.string().trim().max(20000).optional(),
  },
  handler: async ({ projectId, locale, ...changes }) => {
    const current = await prisma.projectTranslation.findUnique({
      where: { projectId_locale: { projectId, locale } },
      select: { name: true, tagline: true, location: true, description: true, conceptDesign: true, aboutThisProject: true, metaTitle: true, metaDescription: true },
    });
    // Projects older than the per-language table keep English and Thai in
    // columns on the project itself; start from those rather than blank.
    const legacy =
      !current && (locale === "en" || locale === "th")
        ? await prisma.project.findFirst({
            where: { id: projectId, deletedAt: null },
            select: { nameEn: true, nameTh: true, taglineEn: true, taglineTh: true, descriptionEn: true, descriptionTh: true, location: true, metaTitleEn: true, metaTitleTh: true, metaDescriptionEn: true, metaDescriptionTh: true },
          })
        : null;
    const base = current ?? (legacy
      ? locale === "en"
        ? { name: legacy.nameEn, tagline: legacy.taglineEn, location: legacy.location, description: legacy.descriptionEn, conceptDesign: null, aboutThisProject: null, metaTitle: legacy.metaTitleEn, metaDescription: legacy.metaDescriptionEn }
        : { name: legacy.nameTh, tagline: legacy.taglineTh, location: legacy.location, description: legacy.descriptionTh, conceptDesign: null, aboutThisProject: null, metaTitle: legacy.metaTitleTh, metaDescription: legacy.metaDescriptionTh }
      : null);
    const name = changes.name ?? base?.name;
    if (!name) throw new Error(`VALIDATION_FAILED:the ${locale} version does not exist yet — send a name`);
    const result = await saveProjectContent(ADMIN_LOCALE, {
      projectId,
      locale,
      values: {
        name,
        tagline: changes.tagline ?? base?.tagline ?? "",
        location: changes.location ?? base?.location ?? "",
        description: changes.description ?? base?.description ?? "",
        conceptDesign: changes.conceptDesign ?? base?.conceptDesign ?? "",
        aboutThisProject: changes.aboutThisProject ?? base?.aboutThisProject ?? "",
        metaTitle: base?.metaTitle ?? "",
        metaDescription: base?.metaDescription ?? "",
      },
    });
    if (!result.ok) throw new Error(result.error);
    return { status: "saved", projectId, locale, created: !current, liveOnSite: result.wentLive };
  },
});

defineTool({
  name: "project_update_seo",
  title: "Edit a project's SEO in one language",
  description:
    "Sets the search-result title (meta title), meta description and target keywords of one language version of a project. Only the fields you send change. Does not change whether the page is indexed. Live immediately if the project is published.",
  access: "write",
  capability: "editContent",
  input: {
    projectId: z.string().min(1).max(64),
    locale: localeInput,
    metaTitle: z.string().trim().max(300).optional(),
    metaDescription: z.string().trim().max(600).optional(),
    targetKeywords: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  },
  handler: async ({ projectId, locale, ...changes }) => {
    const current = await prisma.projectTranslation.findUnique({
      where: { projectId_locale: { projectId, locale } },
      select: { metaTitle: true, metaDescription: true, noIndex: true, targetKeywords: true },
    });
    const result = await saveLocaleSeo(ADMIN_LOCALE, {
      projectId,
      locale,
      metaTitle: changes.metaTitle ?? current?.metaTitle ?? "",
      metaDescription: changes.metaDescription ?? current?.metaDescription ?? "",
      noIndex: current?.noIndex ?? false,
      targetKeywords: changes.targetKeywords ?? current?.targetKeywords ?? [],
    });
    if (!result.ok) throw new Error(result.error);
    return { status: "saved", projectId, locale };
  },
});

/* ── Units ─────────────────────────────────────────────────────────────── */

defineTool({
  name: "unit_update",
  title: "Edit a unit",
  description:
    "Edits one unit: price in THB, sales status, land area, facing, view, phase, whether it is released for sale. Only the fields you send change. Prices and status show on the public project page at once. Status may move forward (AVAILABLE → RESERVED → SOLD → TRANSFERRED) but a reserved or sold unit cannot be set back to AVAILABLE here: that erases who reserved it and is done by a person in the back office.",
  access: "write",
  capability: "manageProjects",
  input: {
    unitId: z.string().min(1).max(64),
    priceTHB: z.number().min(0).max(9_999_999_999).optional(),
    status: z.enum(["AVAILABLE", "RESERVED", "SOLD", "TRANSFERRED"]).optional(),
    landAreaSqm: z.number().min(0).max(99_999).optional(),
    facing: z.string().trim().max(60).optional(),
    viewLabel: z.string().trim().max(60).optional(),
    phase: z.number().int().min(1).max(99).optional(),
    releasedForSale: z.boolean().optional(),
  },
  handler: async ({ unitId, ...changes }) => {
    if (Object.values(changes).every((value) => value === undefined)) throw new Error("NOTHING_TO_CHANGE");
    // Every column the form carries, so that saving changes only what was
    // asked. Notes pass through unseen; nothing here is returned.
    const unit = await prisma.projectUnit.findUnique({ where: { id: unitId }, include: { project: { select: { slug: true } } } });
    if (!unit) throw new Error("NOT_FOUND");
    if (changes.status === "AVAILABLE" && unit.status !== "AVAILABLE") {
      throw new Error("FORBIDDEN:releasing a reserved or sold unit removes its reservation and must be done by a person in the back office");
    }
    const form = toForm({
      unitTypeId: unit.unitTypeId ?? "",
      unitNumber: unit.unitNumber,
      status: changes.status ?? unit.status,
      landAreaSqm: changes.landAreaSqm ?? (unit.landAreaSqm === null ? "" : String(unit.landAreaSqm)),
      adminNotes: unit.adminNotes ?? "",
      sortOrder: unit.sortOrder,
      facing: changes.facing ?? unit.facing ?? "",
      viewLabel: changes.viewLabel ?? unit.viewLabel ?? "",
      priceTHB: changes.priceTHB ?? (unit.priceTHB === null ? "" : String(unit.priceTHB)),
      phase: changes.phase ?? (unit.phase === null ? "" : unit.phase),
      releasedForSale: changes.releasedForSale ?? unit.releasedForSale,
    });
    const state = await saveUnit(ADMIN_LOCALE, unit.projectId, unit.project.slug, unitId, { ok: false }, form);
    if (!state.ok) throw new Error(describeFailure(state));
    return { status: "saved", unitId, unitNumber: unit.unitNumber, changed: Object.keys(changes).filter((key) => changes[key as keyof typeof changes] !== undefined) };
  },
});

/* ── Events ────────────────────────────────────────────────────────────── */

const eventFields = {
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(8000),
  location: z.string().trim().max(240),
  startsAt: z.string().datetime({ offset: true }).describe("Start, ISO 8601 with offset, e.g. 2026-12-05T10:00:00+07:00"),
  endsAt: z.string().datetime({ offset: true }),
  coverImageUrl: z.string().trim().max(600).describe("An image url from the media library"),
  capacity: z.number().int().min(1).max(100_000),
  metaTitle: z.string().trim().max(200),
  metaDescription: z.string().trim().max(400),
};

defineTool({
  name: "event_create_draft",
  title: "Create an unpublished event",
  description:
    "Creates an event in one language, unpublished (add the other languages with event_update). A person publishes it from the back office. Returns the new event's id.",
  access: "write",
  capability: "editContent",
  input: {
    locale: localeInput,
    slug: slugInput,
    title: eventFields.title,
    startsAt: eventFields.startsAt,
    endsAt: eventFields.endsAt.optional(),
    description: eventFields.description.optional(),
    location: eventFields.location.optional(),
    coverImageUrl: eventFields.coverImageUrl.optional(),
    capacity: eventFields.capacity.optional(),
    metaTitle: eventFields.metaTitle.optional(),
    metaDescription: eventFields.metaDescription.optional(),
  },
  handler: async (input) => {
    try {
      const state = await createEvent(ADMIN_LOCALE, { ok: false }, toForm({ ...input, isPublished: false }));
      throw new Error(describeFailure(state));
    } catch (error) {
      const target = redirectTarget(error);
      if (!target) throw error;
      return { status: "created", id: /\/events\/([^/]+)\/edit/.exec(target)?.[1], slug: input.slug, published: false };
    }
  },
});

defineTool({
  name: "event_update",
  title: "Edit an event in one language",
  description:
    "Edits an event: schedule, location, capacity and cover image apply to every language; title, description and meta fields apply to the language named (which is added if missing — title is then required). Only the fields you send change. Does not publish or unpublish. Capacity cannot go below the seats already booked.",
  access: "write",
  capability: "editContent",
  input: {
    id: z.string().min(1).max(64),
    locale: localeInput,
    title: eventFields.title.optional(),
    description: eventFields.description.optional(),
    location: eventFields.location.optional(),
    startsAt: eventFields.startsAt.optional(),
    endsAt: eventFields.endsAt.optional(),
    coverImageUrl: eventFields.coverImageUrl.optional(),
    capacity: eventFields.capacity.optional(),
    metaTitle: eventFields.metaTitle.optional(),
    metaDescription: eventFields.metaDescription.optional(),
    slug: slugInput.optional(),
  },
  handler: async ({ id, locale, ...changes }) => {
    const event = await prisma.event.findUnique({
      where: { id },
      select: {
        slug: true, location: true, startsAt: true, endsAt: true, coverImageUrl: true, ogImageUrl: true, capacity: true, isPublished: true,
        translations: { where: { locale }, select: { title: true, description: true, metaTitle: true, metaDescription: true, noIndex: true } },
      },
    });
    if (!event) throw new Error("NOT_FOUND");
    const version = event.translations[0];
    const title = changes.title ?? version?.title;
    if (!title) throw new Error(`VALIDATION_FAILED:the ${locale} version does not exist yet — send a title`);
    const state = await updateEvent(
      ADMIN_LOCALE,
      id,
      { ok: false },
      toForm({
        locale,
        slug: changes.slug ?? event.slug,
        title,
        description: changes.description ?? version?.description ?? "",
        location: changes.location ?? event.location ?? "",
        startsAt: changes.startsAt ?? event.startsAt.toISOString(),
        endsAt: changes.endsAt ?? (event.endsAt ? event.endsAt.toISOString() : ""),
        coverImageUrl: changes.coverImageUrl ?? event.coverImageUrl ?? "",
        ogImageUrl: event.ogImageUrl ?? "",
        capacity: changes.capacity ?? (event.capacity === null ? "" : event.capacity),
        metaTitle: changes.metaTitle ?? version?.metaTitle ?? "",
        metaDescription: changes.metaDescription ?? version?.metaDescription ?? "",
        noIndex: version?.noIndex ?? false,
        isPublished: event.isPublished,
      }),
    );
    if (!state.ok) throw new Error(describeFailure(state));
    return { status: "saved", id, locale, created: !version, published: event.isPublished };
  },
});

/* ── FAQs ──────────────────────────────────────────────────────────────── */

defineTool({
  name: "faq_list",
  title: "List FAQs",
  description: "Every frequently asked question: id, category, order, whether it is shown on the site, and the question and answer in each language, with the languages that are missing.",
  access: "read",
  capability: "viewContent",
  input: {},
  handler: async () => {
    const rows = await prisma.faq.findMany({
      orderBy: { sortOrder: "asc" },
      select: { id: true, category: true, sortOrder: true, isPublished: true, translations: { select: { locale: true, question: true, answer: true } } },
    });
    return {
      faqs: rows.map(({ translations, ...row }) => ({
        ...row,
        missingLanguages: locales.filter((code) => !translations.some((t) => t.locale === code)),
        versions: Object.fromEntries(translations.map(({ locale, ...version }) => [locale, version])),
      })),
    };
  },
});

defineTool({
  name: "faq_create",
  title: "Add an FAQ (hidden)",
  description: "Adds a frequently asked question in one language, hidden from the site until a person shows it. Add other languages with faq_update. Returns the new id.",
  access: "write",
  capability: "editContent",
  input: {
    locale: localeInput,
    question: z.string().trim().min(5).max(300),
    answer: z.string().trim().min(5).max(8000),
    category: z.string().trim().max(80).optional(),
    sortOrder: z.number().int().min(-9999).max(9999).optional(),
  },
  handler: async ({ locale, question, answer, category, sortOrder }) => {
    const state = await createFaq({ ok: false }, toForm({ locale, question, answer, category: category ?? "", sortOrder: sortOrder ?? 0, isPublished: false }));
    if (!state.ok) throw new Error(describeFailure(state));
    // The action does not return the row it made.
    const created = await prisma.faq.findFirst({ where: { translations: { some: { locale, question } } }, orderBy: { createdAt: "desc" }, select: { id: true } });
    return { status: "created", id: created?.id, shownOnSite: false };
  },
});

defineTool({
  name: "faq_update",
  title: "Edit an FAQ in one language",
  description: "Edits the question and answer of one language version of an FAQ (added if missing — both are then required), and optionally its category and order. Does not change whether it is shown. If it is shown, the change is live at once.",
  access: "write",
  capability: "editContent",
  input: {
    id: z.string().min(1).max(64),
    locale: localeInput,
    question: z.string().trim().min(5).max(300).optional(),
    answer: z.string().trim().min(5).max(8000).optional(),
    category: z.string().trim().max(80).optional(),
    sortOrder: z.number().int().min(-9999).max(9999).optional(),
  },
  handler: async ({ id, locale, ...changes }) => {
    const faq = await prisma.faq.findUnique({
      where: { id },
      select: { category: true, sortOrder: true, isPublished: true, translations: { where: { locale }, select: { question: true, answer: true } } },
    });
    if (!faq) throw new Error("NOT_FOUND");
    const version = faq.translations[0];
    const question = changes.question ?? version?.question;
    const answer = changes.answer ?? version?.answer ?? undefined;
    if (!question || !answer) throw new Error(`VALIDATION_FAILED:the ${locale} version does not exist yet — send both question and answer`);
    const state = await updateFaq(
      id,
      { ok: false },
      toForm({ locale, question, answer, category: changes.category ?? faq.category ?? "", sortOrder: changes.sortOrder ?? faq.sortOrder, isPublished: faq.isPublished }),
    );
    if (!state.ok) throw new Error(describeFailure(state));
    return { status: "saved", id, locale, created: !version, shownOnSite: faq.isPublished };
  },
});

const FAQ_DELETION = "faq";

registerDeletion(FAQ_DELETION, {
  tier: "chat",
  run: async (ids) => {
    let deleted = 0;
    for (const id of ids) {
      // The back office's own action: the row, its translations, the pages that show it.
      await deleteFaq(id);
      deleted++;
    }
    return deleted;
  },
});

defineTool({
  name: "faq_delete",
  title: "Ask to delete FAQs",
  description:
    "Asks to permanently delete FAQs in every language. NOTHING is deleted by this call: it returns a deletion request with a summary and a confirmationCode. Show the summary to the user, and only after they explicitly agree call confirm_deletion.",
  access: "write",
  capability: "editContent",
  destructive: true,
  input: { ids: z.array(z.string().min(1).max(64)).min(1).max(50) },
  handler: async ({ ids }) => {
    const rows = await prisma.faq.findMany({ where: { id: { in: ids } }, select: { id: true, isPublished: true, translations: { select: { question: true }, take: 1 } } });
    if (rows.length !== new Set(ids).size) throw new Error("NOT_FOUND:one or more ids do not exist");
    return requestDeletion({
      kind: FAQ_DELETION,
      ids: rows.map((row) => row.id),
      summary: `Permanently delete ${rows.length} FAQ(s), in every language:\n${rows.map((row) => `• ${row.translations[0]?.question ?? row.id}${row.isPublished ? " (shown on the site)" : ""}`).join("\n")}`,
    });
  },
});

/* ── Site copy: the wording of the public pages ────────────────────────── */

/** Legal texts. Readable; edited by a person, after a lawyer. */
const LEGAL_NAMESPACES = ["privacyPolicy", "terms"];

defineTool({
  name: "site_copy_get",
  title: "Read the website's wording",
  description:
    "The editable wording of the public website for one language — headings, button labels, paragraphs — as key → text, with `edited: true` where the team has changed the built-in text. Pass a namespace (the part of a key before the first dot, e.g. \"home\", \"about\", \"contact\") to narrow it; without one, the list of namespaces is returned.",
  access: "read",
  capability: "viewContent",
  input: { locale: localeInput, namespace: z.string().trim().max(60).optional() },
  handler: async ({ locale, namespace }) => {
    const defaults = await allCopyDefaults(locale);
    if (!namespace) {
      const counts = new Map<string, number>();
      for (const key of Object.keys(defaults)) counts.set(key.split(".")[0], (counts.get(key.split(".")[0]) ?? 0) + 1);
      return { locale, namespaces: [...counts].map(([name, keys]) => ({ namespace: name, keys, editableHere: !LEGAL_NAMESPACES.includes(name) })) };
    }
    const overrides = await prisma.siteCopy.findMany({ where: { locale, key: { startsWith: `${namespace}.` } }, select: { key: true, value: true } });
    const edited = new Map(overrides.map((row) => [row.key, row.value]));
    const entries = Object.entries(defaults).filter(([key]) => key.startsWith(`${namespace}.`));
    if (entries.length === 0) throw new Error("NOT_FOUND:no such namespace");
    return { locale, namespace, entries: entries.map(([key, builtIn]) => ({ key, text: edited.get(key) ?? builtIn, edited: edited.has(key) })) };
  },
});

defineTool({
  name: "site_copy_update",
  title: "Edit the website's wording",
  description:
    "Changes wording on the public website in one language: send key → new text for up to 30 keys from site_copy_get. LIVE ON THE WEBSITE IMMEDIATELY. Placeholders such as {count} and tags such as <b>…</b> in the original must be kept exactly. The privacy policy and terms cannot be edited here.",
  access: "write",
  capability: "editContent",
  input: { locale: localeInput, entries: z.record(z.string().max(200), z.string().max(20_000)) },
  handler: async ({ locale, entries }) => {
    const keys = Object.keys(entries);
    if (keys.length === 0 || keys.length > 30) throw new Error("VALIDATION_FAILED:send between 1 and 30 keys");
    const legal = keys.filter((key) => LEGAL_NAMESPACES.includes(key.split(".")[0]));
    if (legal.length) throw new Error(`FORBIDDEN:legal text is edited by a person — ${legal.join(", ")}`);
    const form = new FormData();
    for (const [key, value] of Object.entries(entries)) form.set(`copy:${locale}:${key}`, value);
    const state = await updateSiteCopy(ADMIN_LOCALE, { ok: false }, form);
    if (!state.ok) {
      if (state.fields) throw new Error(`VALIDATION_FAILED:${Object.entries(state.fields).map(([key, problem]) => `${key} — ${typeof problem === "string" ? problem : JSON.stringify(problem)}`).join("; ")}`);
      throw new Error("SAVE_FAILED");
    }
    return { status: "saved", locale, saved: state.saved ?? keys.length, liveOnSite: true };
  },
});
