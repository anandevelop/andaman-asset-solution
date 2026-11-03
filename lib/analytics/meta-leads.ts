/**
 * lib/analytics/meta-leads.ts — leads that came from Facebook / Instagram
 * (ads or posts), for the "Meta Pixel · โฆษณา" tab of /admin/analytics.
 *
 * From the lead rows themselves — utm_source or the landing referrer —
 * not from Meta: there is no Ads API connection, so this is "what Meta
 * brought that turned into an enquiry", which is the number that matters.
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { safeQuery } from "@/lib/db";

const META_SOURCE = /^(facebook|fb|instagram|ig|meta|messenger|audience_network)$/i;
const META_REFERRER = /(^|\.)(facebook|fb|instagram|messenger)\.com|l\.facebook|lm\.facebook|m\.facebook|fb\.me/i;

export function isMetaOrigin(lead: { utmSource: string | null; landingReferrer: string | null }): boolean {
  if (lead.utmSource && META_SOURCE.test(lead.utmSource.trim())) return true;
  return Boolean(lead.landingReferrer && META_REFERRER.test(lead.landingReferrer));
}

export type MetaLeads = {
  total: number;
  fromMeta: number;
  paid: number;
  campaigns: { name: string; count: number }[];
};

export async function getMetaLeads(days: number): Promise<MetaLeads> {
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await safeQuery(
    "analytics:metaLeads",
    () =>
      prisma.leadInquiry.findMany({
        where: { createdAt: { gte: since } },
        select: { utmSource: true, utmMedium: true, utmCampaign: true, landingReferrer: true },
      }),
    [] as { utmSource: string | null; utmMedium: string | null; utmCampaign: string | null; landingReferrer: string | null }[],
  );

  const meta = rows.filter(isMetaOrigin);
  const campaigns = new Map<string, number>();
  for (const lead of meta) {
    const name = lead.utmCampaign?.trim() || "(no campaign)";
    campaigns.set(name, (campaigns.get(name) ?? 0) + 1);
  }
  return {
    total: rows.length,
    fromMeta: meta.length,
    paid: meta.filter((lead) => /^(cpc|paid|ads?|paid_social|cpm)$/i.test(lead.utmMedium?.trim() ?? "")).length,
    campaigns: [...campaigns.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 10),
  };
}
