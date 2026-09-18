import "server-only";

/**
 * lib/lead-routing.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Automatic lead assignment (SalesTeam.dc.html's "การกระจายลีดอัตโนมัติ").
 *
 * WHICH RULES THIS CAN ACTUALLY ENFORCE, AND WHICH IT ONLY RECORDS.
 *
 * Everything here runs at one moment: a lead arriving through the public
 * form. That is enough for language routing and the per-person cap, both
 * of which are decidable from the lead and the current workload, and both
 * are applied below.
 *
 * The escalation ("nobody picked it up within 2 hours → give it to the
 * team lead") is not, and is deliberately not pretended otherwise. There
 * is no scheduler in this application — the same absence that makes
 * scheduledPublishAt a reminder rather than a timer, and ProjectUnit's
 * reservation expiry a target date rather than an automatic release. A
 * rule that silently never fires is worse than one the screen admits it
 * cannot run, so the threshold is stored, shown, and used to *flag*
 * unclaimed leads on the leads board — not to move them.
 *
 * Every automatic assignment writes a LeadNote(kind: SYSTEM) naming the
 * rule that made it, which is what makes the decision auditable after the
 * fact instead of leads appearing on someone's list for no stated reason.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { LeadStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { locales } from "@/i18n";

export const ROUTING_SETTING_KEY = "leadRouting";

export type LeadRoutingRules = {
  enabled: boolean;
  /** locale → User id who should get that language's leads first. */
  byLanguage: Record<string, string>;
  /** Nobody is given more than this many open leads by the router. */
  perPersonCap: number;
  /** Hours after which an unclaimed lead is flagged for the team lead.
   *  Flagged, not moved — see this file's header. */
  escalateAfterHours: number;
  /** Who that flag points at. */
  teamLeadUserId: string | null;
};

export const DEFAULT_ROUTING_RULES: LeadRoutingRules = {
  enabled: false,
  byLanguage: {},
  perPersonCap: 40,
  escalateAfterHours: 2,
  teamLeadUserId: null,
};

/** Why a lead ended up where it did — recorded on its timeline. */
export type RoutingReason = "language" | "roundRobin" | "capReached" | "disabled" | "noCandidates";

export type RoutingDecision = {
  userId: string | null;
  reason: RoutingReason;
  /** The locale that triggered a language rule, for the timeline entry. */
  matchedLanguage?: string;
};

function parseRules(raw: string | null | undefined): LeadRoutingRules {
  if (!raw) return DEFAULT_ROUTING_RULES;

  try {
    const parsed = JSON.parse(raw) as Partial<LeadRoutingRules>;

    const byLanguage: Record<string, string> = {};
    for (const [locale, userId] of Object.entries(parsed.byLanguage ?? {})) {
      // Ignore anything naming a locale this site does not have, so a
      // stale rule cannot quietly capture leads.
      if ((locales as readonly string[]).includes(locale) && typeof userId === "string" && userId) {
        byLanguage[locale] = userId;
      }
    }

    return {
      enabled: parsed.enabled === true,
      byLanguage,
      perPersonCap:
        typeof parsed.perPersonCap === "number" && parsed.perPersonCap > 0
          ? Math.floor(parsed.perPersonCap)
          : DEFAULT_ROUTING_RULES.perPersonCap,
      escalateAfterHours:
        typeof parsed.escalateAfterHours === "number" && parsed.escalateAfterHours > 0
          ? parsed.escalateAfterHours
          : DEFAULT_ROUTING_RULES.escalateAfterHours,
      teamLeadUserId: typeof parsed.teamLeadUserId === "string" ? parsed.teamLeadUserId : null,
    };
  } catch {
    // A hand-edited or half-written value must not take the capture route
    // down; routing simply stays off until it is fixed.
    return DEFAULT_ROUTING_RULES;
  }
}

export async function getRoutingRules(): Promise<LeadRoutingRules> {
  try {
    const row = await prisma.siteSetting.findUnique({ where: { key: ROUTING_SETTING_KEY } });
    return parseRules(row?.value);
  } catch {
    return DEFAULT_ROUTING_RULES;
  }
}

export async function saveRoutingRules(rules: LeadRoutingRules, updatedBy: string): Promise<void> {
  const value = JSON.stringify(rules);
  await prisma.siteSetting.upsert({
    where: { key: ROUTING_SETTING_KEY },
    update: { value, updatedBy },
    create: { key: ROUTING_SETTING_KEY, value, updatedBy },
  });
}

/**
 * Who should get this lead.
 *
 * Language first, then the lightest current workload among the reps who
 * are under the cap. Returning `userId: null` leaves the lead unassigned
 * for someone to claim from the board, which is what happens today and is
 * the correct fallback: an over-cap team should have its leads visible in
 * one queue, not forced onto whoever is least overloaded.
 */
export async function decideAssignee(lead: {
  commsLanguage: string | null;
}): Promise<RoutingDecision> {
  const rules = await getRoutingRules();
  if (!rules.enabled) return { userId: null, reason: "disabled" };

  // Everyone who could receive a lead: an active back-office account tied
  // to a sales profile that is itself active.
  const candidates = await prisma.user.findMany({
    where: {
      isActive: true,
      salesPersonId: { not: null },
      salesPerson: { isActive: true },
    },
    select: {
      id: true,
      _count: {
        select: {
          assignedLeads: { where: { status: { notIn: [LeadStatus.WON, LeadStatus.LOST] } } },
        },
      },
    },
  });

  if (candidates.length === 0) return { userId: null, reason: "noCandidates" };

  const openCount = new Map(candidates.map((user) => [user.id, user._count.assignedLeads]));
  const underCap = candidates.filter((user) => (openCount.get(user.id) ?? 0) < rules.perPersonCap);

  const preferred = lead.commsLanguage ? rules.byLanguage[lead.commsLanguage] : undefined;
  if (preferred && underCap.some((user) => user.id === preferred)) {
    return { userId: preferred, reason: "language", matchedLanguage: lead.commsLanguage ?? undefined };
  }

  if (underCap.length === 0) return { userId: null, reason: "capReached" };

  // Fewest open leads wins; ties break on id so the same input always
  // produces the same answer.
  const lightest = [...underCap].sort((a, b) => {
    const diff = (openCount.get(a.id) ?? 0) - (openCount.get(b.id) ?? 0);
    return diff !== 0 ? diff : a.id.localeCompare(b.id);
  })[0];

  return { userId: lightest.id, reason: "roundRobin" };
}

/**
 * Assign a freshly captured lead and record why on its timeline.
 *
 * Errors are swallowed: this runs after the lead is already saved and the
 * visitor already answered, so a routing problem must leave the lead
 * unassigned on the board — visible, claimable — rather than fail the
 * capture that already succeeded.
 *
 * The timeline entry is the point of the whole exercise. "Assigned to
 * Paweena because the enquiry came in on the Russian site" is reviewable;
 * a lead silently appearing on someone's list is not.
 */
export async function assignCapturedLead(
  leadId: string,
  commsLanguage: string | null,
): Promise<void> {
  try {
    const decision = await decideAssignee({ commsLanguage });
    if (!decision.userId) return;

    await prisma.leadInquiry.update({
      where: { id: leadId },
      data: { assignedToId: decision.userId },
    });

    const assignee = await prisma.user.findUnique({
      where: { id: decision.userId },
      select: { name: true },
    });

    /*
      Written in English rather than through next-intl. This runs inside a
      public API request that has no admin locale to translate into, and
      the note is permanent text on a timeline the app never re-renders —
      the same reason leads/actions.ts bakes its system notes in at write
      time. The Lead Detail page shows it verbatim.
    */
    const because =
      decision.reason === "language"
        ? `the enquiry came from the ${decision.matchedLanguage?.toUpperCase()} site`
        : "they had the fewest open leads";

    await prisma.leadNote.create({
      data: {
        leadId,
        authorId: null,
        kind: "SYSTEM",
        body: `Assigned automatically to ${assignee?.name ?? decision.userId} — ${because}.`,
      },
    });
  } catch (error) {
    console.error("[lead-routing] could not assign lead", leadId, error);
  }
}
