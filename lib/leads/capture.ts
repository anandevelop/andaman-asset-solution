/**
 * lib/leads/capture.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Turning a validated enquiry into a lead, and telling people about it —
 * moved out of app/api/leads/route.ts so a held enquiry
 * (lib/leads/suspect.ts) becomes a lead by exactly the same steps when an
 * admin lets it through, rather than by a second copy of them.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import type { z } from "zod";
import { LeadSource, type Prisma } from "@prisma/client";
import type { leadInquiryServerSchema } from "@/lib/validations";
import { siteConfig } from "@/config/site";
import { notifyNewLead } from "@/lib/line";
import { notifyNewLeadByEmail } from "@/lib/email";
import { assignCapturedLead } from "@/lib/lead-routing";
import { isEnabled, notifyAdmins } from "@/lib/notifications";

export type LeadSubmission = z.infer<typeof leadInquiryServerSchema>;

/** What the new-lead announcements need, kept with a held enquiry. */
export type LeadNotice = {
  name: string;
  email: string;
  phone: string;
  message: string | null;
  projectSlug: string | null;
  projectId: string | null;
  source: string;
  commsLanguage: string | null;
};

/** Trim to Postgres-friendly length; empty string → null. */
export function nullify(value: string | undefined | null, max = 500): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed.slice(0, max);
}

/** The LeadInquiry row a submission creates. */
export function leadCreateData(
  data: LeadSubmission,
  context: { projectId: string | null; ip: string; userAgent: string | null; now?: Date },
): Prisma.LeadInquiryUncheckedCreateInput {
  const { projectId, ip } = context;
  return {
    name: data.name,
    email: data.email.toLowerCase(),
    phone: data.phone,
    // Pairs with `phone`: the ISO2 CountrySelect.tsx resolved the dial
    // code from — see LeadInquiry.phoneCountry in schema.prisma.
    phoneCountry: data.phoneCountry?.toUpperCase() ?? null,
    // ISO2 now, not free text — see LeadInquiry.nationality.
    nationality: nullify(data.nationality?.toUpperCase(), 2),
    message: nullify(data.message, 2000),

    projectId,
    source: (data.source as LeadSource | undefined) ?? (projectId ? LeadSource.PROJECT_PAGE : LeadSource.OTHER),

    // PDPA consent trail. The version the visitor actually saw is sent by
    // the form; siteConfig is the fallback for older clients.
    consentGiven: data.consentGiven,
    consentedAt: context.now ?? new Date(),
    consentVersion: data.consentVersion ?? siteConfig.legal.consentVersion,

    utmSource: nullify(data.utmSource, 120),
    utmMedium: nullify(data.utmMedium, 120),
    utmCampaign: nullify(data.utmCampaign, 160),
    ipAddress: ip === "unknown" ? null : ip,
    userAgent: nullify(context.userAgent, 500),

    // Which language version of the site the form was on, and the page's
    // own path — see LeadInquiry.commsLanguage/sourcePath.
    commsLanguage: data.commsLanguage ?? null,
    sourcePath: nullify(data.sourcePath, 300),

    // Where the visit began, as opposed to where the form was — see
    // LeadInquiry.landingPath. Not backfillable.
    landingPath: nullify(data.landingPath, 500),
    landingReferrer: nullify(data.landingReferrer, 255),
  };
}

export function noticeOf(data: LeadSubmission, projectId: string | null): LeadNotice {
  return {
    name: data.name,
    email: data.email,
    phone: data.phone,
    message: data.message || null,
    projectSlug: data.projectSlug ?? null,
    projectId,
    source: data.source ?? (projectId ? "PROJECT_PAGE" : "OTHER"),
    commsLanguage: data.commsLanguage ?? null,
  };
}

/**
 * Route the lead to a rep and announce it. Everything here is
 * fire-and-forget: the lead is saved, and a LINE or mail outage must never
 * turn a successful capture into an error.
 */
export function announceLead(leadId: string, notice: LeadNotice): void {
  // Outside the create's transaction on purpose: a routing failure leaves
  // an unassigned lead on the board rather than a lost one.
  void assignCapturedLead(leadId, notice.commsLanguage, notice.projectId);

  void notifyNewLead({
    id: leadId,
    name: notice.name,
    email: notice.email,
    phone: notice.phone,
    message: notice.message,
    projectName: notice.projectSlug,
    source: notice.source,
  });

  // Both channels are switches on /admin/settings/notifications, read here
  // rather than inside the senders so the preference lives in one place.
  void isEnabled("newLead", "email").then((on) => {
    if (!on) return;
    return notifyNewLeadByEmail({
      name: notice.name,
      email: notice.email,
      phone: notice.phone,
      message: notice.message,
      projectName: notice.projectSlug,
      source: notice.source,
    });
  });

  void notifyAdmins({
    event: "newLead",
    title: notice.name,
    body: notice.projectSlug ?? notice.email,
    href: `/admin/leads/${leadId}`,
  });
}
