"use server";

/**
 * app/[locale]/admin/(growth)/seo/links/actions.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The four write paths behind /admin/seo/links: rescanning the link graph,
 * checking external link statuses, collapsing a redirect chain, and
 * applying a link-building opportunity. ADMIN and above, matching this
 * zone's default floor (see the layout's own header on why this screen
 * isn't in ROUTE_EXCEPTIONS) — and, for addLinkOpportunity specifically,
 * the phase's own binding decision that an automated content edit is
 * ADMIN-only, not EDITOR.
 *
 * Every action's last parameter is `locale` on purpose — the same
 * `.bind(null, …)` shape this codebase's other admin buttons already use
 * (see app/[locale]/admin/(system)/users/[id]/edit/page.tsx) to turn a
 * row-scoped server action into the zero-extra-arg `(locale) => Promise`
 * shape components/admin/RescanButton.tsx's `action` prop expects, so
 * this page needs no bespoke button component per action.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { requireAdminAction } from "@/lib/admin/guard";
import { prisma } from "@/lib/prisma";
import { scanAndPersistLinkGraph, checkExternalLinkStatuses } from "@/lib/admin/link-graph";
import { walkRedirectChain } from "@/lib/redirects";
import { applyLinkOpportunity, type LinkOpportunityTargetType } from "@/lib/admin/link-opportunities";
import type { ContentLinkScanResult, ExternalLinkCheckResult } from "@/lib/admin/link-graph";

export type ActionResult = { ok: true } | { ok: false; error: string };

function revalidateLinksPage(locale: string) {
  revalidatePath(`/${locale}/admin/seo/links`);
}

export async function rescanLinkGraph(
  locale: string,
): Promise<({ ok: true } & ContentLinkScanResult) | { ok: false; error: string }> {
  await requireAdminAction(Role.ADMIN);

  try {
    const result = await scanAndPersistLinkGraph();
    revalidateLinksPage(locale);
    return { ok: true, ...result };
  } catch (error) {
    console.error("[rescanLinkGraph]", error);
    return { ok: false, error: "SCAN_FAILED" };
  }
}

export async function checkExternalLinks(
  locale: string,
): Promise<({ ok: true } & ExternalLinkCheckResult) | { ok: false; error: string }> {
  await requireAdminAction(Role.ADMIN);

  try {
    const result = await checkExternalLinkStatuses();
    revalidateLinksPage(locale);
    return { ok: true, ...result };
  } catch (error) {
    console.error("[checkExternalLinks]", error);
    return { ok: false, error: "CHECK_FAILED" };
  }
}

/**
 * Re-derives the chain server-side from `rootFromPath` — never trusts a
 * client-sent chain — and rewrites only the first hop, to `chain.terminal`.
 * Intermediate hops are left active and untouched: one may still be
 * serving direct traffic (an old bookmark, a backlink this site doesn't
 * control) that a full collapse would turn into a fresh 404. See
 * lib/admin/link-health.ts's header on findRedirectChains() for how a
 * chain is identified in the first place.
 */
export async function collapseRedirectChain(rootFromPath: string, locale: string): Promise<ActionResult> {
  await requireAdminAction(Role.ADMIN);

  const rows = await prisma.redirect.findMany({
    where: { isActive: true },
    select: { fromPath: true, toPath: true },
  });
  const table = new Map(rows.map((row) => [row.fromPath, row.toPath]));

  if (!table.has(rootFromPath)) return { ok: false, error: "NOT_FOUND" };

  const walk = walkRedirectChain(table, rootFromPath);
  if (walk.loop) return { ok: false, error: "IS_LOOP" };
  if (walk.path.length < 3) return { ok: false, error: "NOT_A_CHAIN" };

  try {
    await prisma.redirect.update({
      where: { fromPath: rootFromPath },
      data: { toPath: walk.path[walk.path.length - 1] },
    });
  } catch (error) {
    console.error("[collapseRedirectChain]", error);
    return { ok: false, error: "SAVE_FAILED" };
  }

  revalidateLinksPage(locale);
  return { ok: true };
}

export type AddLinkOpportunityInput = {
  sourceId: string;
  sourceLocale: string;
  targetType: LinkOpportunityTargetType;
  targetId: string;
  targetPath: string;
};

export async function addLinkOpportunity(input: AddLinkOpportunityInput, locale: string): Promise<ActionResult> {
  const session = await requireAdminAction(Role.ADMIN);

  const result = await applyLinkOpportunity(input, session.id);
  if (!result.ok) return result;

  revalidateLinksPage(locale);
  revalidatePath(`/${locale}/admin/news/${input.sourceId}/edit`);
  return { ok: true };
}
