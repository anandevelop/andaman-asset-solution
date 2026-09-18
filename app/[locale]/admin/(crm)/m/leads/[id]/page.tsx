/**
 * app/[locale]/admin/m/leads/[id]/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * "Lead in hand" — Mobile.dc.html screen 2. Reuses the exact desktop
 * components (LeadStatusSelect, LeadFollowUpInput, LeadNoteForm) rather
 * than re-implementing the same server actions with a mobile-only copy —
 * they are already bare flex/select elements with no fixed widths, so
 * they drop into a single mobile column unchanged.
 *
 * The mockup also shows a reserved-unit card ("ยูนิต V-07 · จองชั่วคราว")
 * tied to this lead. There is no such relation in the schema — ProjectUnit
 * has no leadId — so that card is left out rather than faked; see
 * MobileUnitList's own note on the same gap from the unit side.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CalendarPlus, Mail, Phone } from "lucide-react";
import { LeadStatus, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DatabaseUnavailableError, isDatabaseOffline, safeQuery } from "@/lib/db";
import { requireCapability } from "@/lib/admin/guard";
import { intlLocale } from "@/lib/format";
import MobileShell from "@/components/admin/mobile/MobileShell";
import LeadStatusSelect from "@/components/admin/LeadStatusSelect";
import LeadFollowUpInput from "@/components/admin/LeadFollowUpInput";
import LeadNoteForm from "@/components/admin/LeadNoteForm";

type Props = { params: Promise<{ locale: string; id: string }> };

function toDateInputValue(date: Date | null): string | null {
  if (!date) return null;
  return date.toISOString().slice(0, 10);
}

export default async function MobileLeadDetailPage(props: Props) {
  const { locale, id } = await props.params;
  const session = await requireCapability(locale, "viewAllLeads");
  const t = await getTranslations({ locale, namespace: "admin.mobile" });
  const tRoot = await getTranslations({ locale, namespace: "admin" });

  const lead = await safeQuery(
    "mobile:leadDetail",
    () =>
      prisma.leadInquiry.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          message: true,
          status: true,
          followUpAt: true,
          assignedToId: true,
          project: { select: { nameEn: true, nameTh: true } },
          notes: {
            orderBy: { createdAt: "desc" },
            select: { id: true, body: true, createdAt: true, author: { select: { name: true } } },
          },
        },
      }),
    undefined,
  );

  if (!lead) {
    if (isDatabaseOffline()) throw new DatabaseUnavailableError(`admin/m/leads/${id}`);
    notFound();
  }

  // Same not-found-not-forbidden rule as the desktop detail page — see
  // that page's file header for why.
  if (session.role === Role.SALES && lead.assignedToId && lead.assignedToId !== session.id) {
    notFound();
  }

  const statusLabels = Object.fromEntries(
    Object.values(LeadStatus).map((value) => [value, tRoot(`leadStatus.${value}` as never)]),
  ) as Record<LeadStatus, string>;

  const dateFormat = new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const projectName = lead.project ? (locale === "th" ? lead.project.nameTh : lead.project.nameEn) : null;

  return (
    <MobileShell
      locale={locale}
      active="leads"
      backHref={`/${locale}/admin/m/leads`}
      title={lead.name}
      subtitle={projectName ?? undefined}
      headerRight={
        <LeadStatusSelect
          locale={locale}
          leadId={lead.id}
          value={lead.status}
          labels={statusLabels}
          errorLabel={tRoot("common.error")}
        />
      }
    >
      {/* An empty list during an outage reads as "you have no leads",
          which is the wrong and more alarming of the two meanings. */}
      {isDatabaseOffline() && (
        <p className="rounded-xs border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900">
          {tRoot("common.offline")}
        </p>
      )}

      <div className="flex gap-2 px-1">
        <a
          href={`tel:${lead.phone}`}
          className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xs bg-primary text-sm font-medium text-white"
        >
          <Phone size={14} aria-hidden />
          {t("detail.call")}
        </a>
        <a
          href={`mailto:${lead.email}`}
          className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xs border border-primary/20 text-sm font-medium text-primary"
        >
          <Mail size={14} aria-hidden />
          {t("detail.email")}
        </a>
        <a
          href={`/${locale}/admin/appointments`}
          className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xs border border-primary/20 text-sm font-medium text-primary"
        >
          <CalendarPlus size={14} aria-hidden />
          {t("detail.schedule")}
        </a>
      </div>

      <div className="space-y-3 rounded-xs border border-primary/10 bg-white p-3.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("detail.note")}</p>
        <LeadNoteForm
          locale={locale}
          leadId={lead.id}
          placeholder={tRoot("leadDetail.notePlaceholder")}
          submitLabel={tRoot("common.save")}
          errorLabel={tRoot("common.error")}
        />
      </div>

      <div className="flex items-center justify-between gap-3 rounded-xs border border-primary/10 bg-white p-3.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          {tRoot("leadDetail.followUpTitle")}
        </span>
        <LeadFollowUpInput
          locale={locale}
          leadId={lead.id}
          value={toDateInputValue(lead.followUpAt)}
          overdueLabel={tRoot("leads.followUpOverdue")}
          errorLabel={tRoot("common.error")}
        />
      </div>

      {lead.message && (
        <div className="space-y-1 rounded-xs border border-primary/10 bg-white p-3.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{tRoot("leadDetail.message")}</p>
          <p className="text-sm text-primary">{lead.message}</p>
        </div>
      )}

      <div className="space-y-3 rounded-xs border border-primary/10 bg-white p-3.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{tRoot("leadDetail.notesTitle")}</p>
        {lead.notes.length === 0 && <p className="text-xs text-ink-muted">{tRoot("leadDetail.noNotes")}</p>}
        <div className="space-y-3">
          {lead.notes.map((note) => (
            <div key={note.id} className="border-l-2 border-primary/15 pl-3">
              <p className="text-sm text-primary">{note.body}</p>
              <p className="mt-1 text-[11px] text-ink-muted">
                {dateFormat.format(note.createdAt)} · {note.author?.name ?? "—"}
              </p>
            </div>
          ))}
        </div>
      </div>
    </MobileShell>
  );
}
