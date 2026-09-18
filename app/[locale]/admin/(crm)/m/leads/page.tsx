/**
 * app/[locale]/admin/m/leads/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * "Leads" tab — not in Mobile.dc.html directly (that mockup jumps straight
 * to one lead's detail screen), but the detail screen needs somewhere to
 * be reached *from* on mobile, and this is also where the Today queue's
 * "N unclaimed leads" banner sends a rep. Two sections: mine, and the
 * unassigned pool with a one-tap claim button.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LeadStatus, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isDatabaseOffline, safeQuery } from "@/lib/db";
import { requireCapability } from "@/lib/admin/guard";
import MobileShell from "@/components/admin/mobile/MobileShell";
import MobileClaimLeadButton from "@/components/admin/mobile/MobileClaimLeadButton";

type Props = { params: Promise<{ locale: string }> };

const OPEN_STATUSES: LeadStatus[] = [
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "VIEWING_SCHEDULED",
  "NEGOTIATING",
];

export default async function MobileLeadsPage(props: Props) {
  const { locale } = await props.params;
  const session = await requireCapability(locale, "viewAllLeads");
  const t = await getTranslations({ locale, namespace: "admin.mobile" });
  const tRoot = await getTranslations({ locale, namespace: "admin" });

  const leads = await safeQuery(
    "mobile:myLeads",
    () =>
      prisma.leadInquiry.findMany({
        where: {
          status: { in: OPEN_STATUSES },
          OR: [{ assignedToId: session.id }, { assignedToId: null }],
        },
        orderBy: [{ followUpAt: "asc" }, { createdAt: "desc" }],
        take: 60,
        select: { id: true, name: true, status: true, assignedToId: true },
      }),
    [],
  );

  const mine = leads.filter((lead) => lead.assignedToId === session.id);
  const unassigned = leads.filter((lead) => lead.assignedToId === null);

  return (
    <MobileShell locale={locale} active="leads" title={t("leads.title")}>
      {/* An empty list during an outage reads as "you have no leads",
          which is the wrong and more alarming of the two meanings. */}
      {isDatabaseOffline() && (
        <p className="rounded-xs border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900">
          {tRoot("common.offline")}
        </p>
      )}

      <section className="space-y-2">
        <p className="px-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("leads.mine")}</p>
        {mine.length === 0 && (
          <p className="rounded-xs border border-dashed border-primary/20 bg-white p-4 text-center text-sm text-ink-muted">
            {t("leads.empty")}
          </p>
        )}
        {mine.map((lead) => (
          <Link
            key={lead.id}
            href={`/${locale}/admin/m/leads/${lead.id}`}
            className="flex min-h-[56px] items-center gap-3 rounded-xs border border-primary/10 bg-white px-3.5 py-2.5"
          >
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-primary">{lead.name}</span>
            <span className="shrink-0 rounded-xs bg-primary/5 px-2 py-1 text-[11px] font-medium text-primary">
              {tRoot(`leadStatus.${lead.status}` as never)}
            </span>
          </Link>
        ))}
      </section>

      {unassigned.length > 0 && (
        <section className="space-y-2 pt-2">
          <p className="px-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("leads.unassigned")}</p>
          {unassigned.map((lead) => (
            <div
              key={lead.id}
              className="flex min-h-[56px] items-center gap-3 rounded-xs border border-primary/10 bg-white px-3.5 py-2.5"
            >
              <Link href={`/${locale}/admin/m/leads/${lead.id}`} className="min-w-0 flex-1 truncate text-sm font-medium text-primary">
                {lead.name}
              </Link>
              <MobileClaimLeadButton locale={locale} leadId={lead.id} userId={session.id} label={t("leads.claim")} />
            </div>
          ))}
        </section>
      )}
    </MobileShell>
  );
}
