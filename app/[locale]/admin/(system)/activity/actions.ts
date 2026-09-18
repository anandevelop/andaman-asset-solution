"use server";

/**
 * app/[locale]/admin/activity/actions.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Undoing one recorded change.
 *
 * WHAT A REVERT DOES, AND WHAT IT REFUSES TO DO.
 *
 * It writes the `before` values from one audit entry back onto the row —
 * only the fields that entry recorded, so a later edit to a *different*
 * field is not silently undone along with it.
 *
 * It refuses in four cases, each of which would otherwise write something
 * wrong rather than fail:
 *
 *  · Entries with no captured values. Creates, deletes, bulk writes and
 *    every entry on a customer-data model store field names only (see
 *    AuditLog.changes). There is nothing to put back.
 *  · Truncated values. A long paragraph is clipped before storage; writing
 *    the clipped copy back would silently shorten the live text.
 *  · A row that no longer exists.
 *  · Anything on a customer-data model, checked again here rather than
 *    relying on `changes` being null — a guard that matters is worth
 *    stating twice.
 *
 * On a model with the draft→review→publish workflow the row is also put
 * back into DRAFT: a revert proposes the old copy for review rather than
 * pushing it live, which is what the workflow exists to guarantee.
 *
 * The revert is itself an ordinary Prisma write by a signed-in
 * administrator, so lib/audit/extension.ts records it like any other —
 * undoing a change is part of the history, not a way around it.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { revalidatePath } from "next/cache";
import { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdminAction } from "@/lib/admin/guard";
import { TRUNCATION_MARKER } from "@/lib/audit/extension";
import { locales } from "@/i18n";

export type RevertResult = { ok: true; fields: string[] } | { ok: false; error: string };

/** Mirrors UNLABELLED_MODELS in lib/audit/extension.ts. */
const CUSTOMER_MODELS = new Set(["LeadInquiry", "EventRegistration", "LeadNote"]);

/** Models carrying the content workflow, which a revert re-enters. */
const WORKFLOW_MODELS = new Set(["Project", "NewsArticle", "Event", "EBrochure"]);

/**
 * What a revert may write to, named one model at a time.
 *
 * An explicit map rather than indexing the client by the string in the
 * entry. Two reasons, and the second is the important one: `prisma` cannot
 * be indexed by a runtime key without casting the type-checking away — the
 * repo lints against exactly that — and a dynamic lookup would happily
 * revert a model nobody considered, including one added next year whose
 * fields have side effects. Adding a model here is a decision; forgetting
 * to is a refusal, which is the safe direction.
 */
const REVERTABLE: Record<string, { update: (args: never) => Promise<unknown> }> = {
  Project: prisma.project,
  ProjectUnit: prisma.projectUnit,
  ProjectUnitType: prisma.projectUnitType,
  ProjectFacility: prisma.projectFacility,
  NewsArticle: prisma.newsArticle,
  Event: prisma.event,
  EBrochure: prisma.eBrochure,
  SalesPerson: prisma.salesPerson,
  Award: prisma.award,
  Milestone: prisma.milestone,
  Faq: prisma.faq,
};

export async function revertAuditEntry(
  locale: string,
  entryId: string,
): Promise<RevertResult> {
  await requireAdminAction(Role.SUPER_ADMIN);

  const entry = await prisma.auditLog.findUnique({
    where: { id: entryId },
    select: { model: true, recordId: true, action: true, changes: true },
  });

  if (!entry) return { ok: false, error: "NOT_FOUND" };
  if (entry.action !== "update") return { ok: false, error: "NOT_REVERTABLE" };
  if (!entry.recordId) return { ok: false, error: "NOT_REVERTABLE" };
  if (CUSTOMER_MODELS.has(entry.model)) return { ok: false, error: "CUSTOMER_DATA" };

  const changes = entry.changes as Record<string, { before: unknown; after: unknown }> | null;
  if (!changes || Object.keys(changes).length === 0) {
    return { ok: false, error: "NO_VALUES" };
  }

  const data: Record<string, unknown> = {};
  for (const [field, change] of Object.entries(changes)) {
    if (typeof change.before === "string" && change.before.endsWith(TRUNCATION_MARKER)) {
      return { ok: false, error: "TRUNCATED" };
    }
    data[field] = change.before;
  }

  if (WORKFLOW_MODELS.has(entry.model)) data.contentStatus = "DRAFT";

  const delegate = REVERTABLE[entry.model];
  if (!delegate) return { ok: false, error: "NOT_REVERTABLE" };

  try {
    await delegate.update({ where: { id: entry.recordId }, data } as never);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return { ok: false, error: "RECORD_GONE" };
    }
    console.error("[revertAuditEntry]", error);
    return { ok: false, error: "REVERT_FAILED" };
  }

  revalidatePath(`/${locale}/admin/activity`);
  revalidatePath(`/${locale}/admin/publishing`);
  for (const target of locales) revalidatePath(`/${target}`);

  return { ok: true, fields: Object.keys(changes) };
}
