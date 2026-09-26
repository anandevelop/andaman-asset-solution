"use server";

/**
 * app/[locale]/admin/(growth)/seo/audit/actions.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Waiving a rule for one URL, and taking the waiver back.
 *
 * A waiver is a judgement somebody made — "this page is short because it
 * should be" — and six months later the only questions that matter are who
 * decided and why. So a reason is required and refused if empty, and both
 * directions are written to the activity log.
 *
 * Every action calls the guard itself. The (growth) layout already requires
 * ADMIN, but a layout is a routing concern: a server action can be invoked
 * directly, by id, with no layout ever having rendered. AGENTS.md is
 * explicit about this and it is the difference between "the button is not
 * on screen" and "you cannot do it".
 *
 * The score is NOT recomputed here. Waiving removes the rule from the
 * denominator on the next run (see lib/seo/score.ts), and until then the
 * table shows the waiver alongside the old number rather than a figure
 * invented at the moment of clicking — which would disagree with the run
 * history the graph plots.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdminAction } from "@/lib/admin/guard";
import { findRule } from "@/lib/seo/rules";
import { reportError } from "@/lib/sentry";

export type WaiverResult = { ok: true } | { ok: false; error: "REASON_REQUIRED" | "UNKNOWN_RULE" | "FAILED" };

/** Long enough for a sentence, short enough that nobody pastes an essay
 *  into an audit table. */
const REASON_MAX = 500;

export async function waiveRule(
  locale: string,
  url: string,
  ruleKey: string,
  reason: string,
): Promise<WaiverResult> {
  const actor = await requireAdminAction(Role.ADMIN);

  const trimmed = reason.trim();
  // The reason is the point of the feature. A waiver with no reason is an
  // unexplained silence in six months' time.
  if (trimmed.length === 0) return { ok: false, error: "REASON_REQUIRED" };
  if (!findRule(ruleKey)) return { ok: false, error: "UNKNOWN_RULE" };

  try {
    await prisma.seoRuleWaiver.upsert({
      where: { url_ruleKey: { url, ruleKey } },
      create: { url, ruleKey, reason: trimmed.slice(0, REASON_MAX), createdById: actor.id },
      // Re-waiving is editing the reason, which is a thing somebody does
      // when the first one turns out not to explain it.
      update: { reason: trimmed.slice(0, REASON_MAX), createdById: actor.id },
    });

    await log(actor, "seo_rule_waived", url, ruleKey, trimmed);
    revalidatePath(`/${locale}/admin/seo/audit`);

    return { ok: true };
  } catch (error) {
    console.error("[seo] failed to waive", error);
    return { ok: false, error: "FAILED" };
  }
}

export async function removeWaiver(
  locale: string,
  url: string,
  ruleKey: string,
): Promise<WaiverResult> {
  const actor = await requireAdminAction(Role.ADMIN);

  try {
    await prisma.seoRuleWaiver.deleteMany({ where: { url, ruleKey } });

    await log(actor, "seo_rule_unwaived", url, ruleKey, "");
    revalidatePath(`/${locale}/admin/seo/audit`);

    return { ok: true };
  } catch (error) {
    console.error("[seo] failed to remove a waiver", error);
    return { ok: false, error: "FAILED" };
  }
}

/**
 * Never throws — the same rule lib/audit/events.ts follows. Failing to log
 * a waiver must not turn a legitimate action into a failed one; a lost
 * entry goes to Sentry instead.
 */
async function log(
  actor: { id: string; email: string; role: Role },
  action: string,
  url: string,
  ruleKey: string,
  reason: string,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: actor.id,
        actorEmail: actor.email.slice(0, 200),
        actorRole: actor.role,
        action,
        model: "SeoRuleWaiver",
        recordId: `${url}#${ruleKey}`.slice(0, 200),
        recordLabel: url.slice(0, 200),
        changedFields: ["ruleKey"],
        changes: { waiver: { url, ruleKey, reason } },
      },
    });
  } catch (error) {
    console.error("[audit] failed to record a waiver change", error);
    reportError(error, { tags: { area: "audit" }, extra: { action, url, ruleKey } });
  }
}
