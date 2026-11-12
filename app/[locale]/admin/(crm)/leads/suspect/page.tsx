/**
 * /admin/leads/suspect — enquiries held as a likely test or spam.
 * ─────────────────────────────────────────────────────────────────────────
 * Each arrived through the enquiry form and matched a rule in
 * lib/leads/spam-signals.ts ("test" in the name, 0812345678…). None of
 * them has been routed, announced or counted. An admin lets a real one
 * through, marks spam (deleted, sender blocked), or deletes a test.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { getTranslations } from "next-intl/server";
import { Role } from "@prisma/client";
import { ShieldAlert } from "lucide-react";
import { requireAdmin } from "@/lib/admin/guard";
import { isDatabaseOffline, safeQuery } from "@/lib/db";
import { intlLocale } from "@/lib/format";
import { listSuspects, SUSPECT_RETENTION_DAYS, type SuspectRow } from "@/lib/leads/suspect";
import { STRONG_SIGNALS } from "@/lib/leads/spam-signals";
import AdminPageHeader from "@/components/admin/ui/AdminPageHeader";
import PageTabs from "@/components/admin/PageTabs";
import SuspectLeadActions from "@/components/admin/SuspectLeadActions";
import { zoneEyebrow } from "@/lib/admin/nav";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ locale: string }> };

export default async function SuspectLeadsPage(props: Props) {
  const { locale } = await props.params;
  const session = await requireAdmin(locale, Role.ADMIN);

  const [t, tAdmin, rows] = await Promise.all([
    getTranslations({ locale, namespace: "admin.suspectLeads" }),
    getTranslations({ locale, namespace: "admin" }),
    safeQuery("suspectLeads:list", () => listSuspects(), [] as SuspectRow[]),
  ]);

  const when = new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
  });
  const reason = (code: string) => (t.has(`reasons.${code}`) ? t(`reasons.${code}`) : code);
  const labels = {
    release: t("release"),
    spam: t("spam"),
    confirmSpam: t("confirmSpam"),
    remove: t("remove"),
    failed: t("failed"),
    cancel: t("cancel"),
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow={zoneEyebrow((key) => tAdmin(key as never), "leads")}
        title={t("title")}
        description={t("subtitle", { days: SUSPECT_RETENTION_DAYS })}
      />
      <PageTabs locale={locale} role={session.role} groupKey="leads" counts={{ suspect: rows.length }} />

      {isDatabaseOffline() && (
        <p className="rounded-xs border border-adm-warning/30 bg-adm-warning-bg px-4 py-3 text-sm text-adm-warning">
          {tAdmin("common.offline")}
        </p>
      )}

      {rows.length === 0 && !isDatabaseOffline() ? (
        <p className="admin-card text-sm text-adm-muted">{t("empty")}</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.id} className="admin-card space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-0.5">
                  <p className="font-semibold text-adm-text">{row.name}</p>
                  <p className="break-all text-sm text-adm-muted">
                    {row.email} · {row.phone}
                  </p>
                  <p className="text-xs text-adm-muted">
                    {when.format(row.createdAt)}
                    {row.projectName ? ` · ${row.projectName}` : ""}
                  </p>
                </div>
                <SuspectLeadActions locale={locale} id={row.id} labels={labels} />
              </div>

              {row.message && (
                <p className="rounded-xs bg-adm-fill px-3 py-2 text-sm text-adm-text whitespace-pre-line">{row.message}</p>
              )}

              <div className="flex flex-wrap items-center gap-1.5">
                <ShieldAlert size={14} className="text-adm-muted" aria-hidden />
                {row.reasons.map((code) => (
                  <span
                    key={code}
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      (STRONG_SIGNALS as readonly string[]).includes(code)
                        ? "bg-adm-strong text-adm-on-strong"
                        : "bg-adm-fill text-adm-text"
                    }`}
                  >
                    {reason(code)}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs leading-relaxed text-adm-muted">{t("howItWorks")}</p>
    </div>
  );
}
