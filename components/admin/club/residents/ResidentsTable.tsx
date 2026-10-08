/**
 * components/admin/club/residents/ResidentsTable.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * "รายชื่อลูกบ้าน": one row per handed-over unit. Contact details are
 * masked (the phone reveals with a logged click), the house code shows its
 * prefix only unless ?codes=1, and the card column says where the plastic
 * is: not printed / printed, waiting / handed over (+ date).
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Eye, EyeOff, Users } from "lucide-react";
import type { CardStatus } from "@prisma/client";
import { formatDateShort } from "@/lib/format";
import Avatar from "@/components/admin/ui/Avatar";
import StatusPill, { type PillTone } from "@/components/admin/ui/StatusPill";
import RevealPhone from "./RevealPhone";

export type ResidentRow = {
  unitId: string;
  residentId: string;
  unitNumber: string;
  typeName: string;
  ownerName: string;
  nationality: string;
  maskedPhone: string;
  hasEmail: boolean;
  purpose: string | null;
  transferDate: Date;
  houseCode: string;
  cardStatus: CardStatus | null;
  handedAt: Date | null;
  members: number;
  partners: { total: number; usable: number };
  /** Days since the last portal sign-in; null = never. */
  lastLoginDays: number | null;
  href: string;
};

export const CARD_TONE: Record<CardStatus, PillTone> = { NONE: "warning", PRINTED: "info", HANDED: "success" };

export default async function ResidentsTable({
  locale,
  rows,
  showCodes,
  toggleCodesHref,
}: {
  locale: string;
  rows: ResidentRow[];
  showCodes: boolean;
  toggleCodesHref: string;
}) {
  const t = await getTranslations({ locale, namespace: "clubResidents" });
  const purpose = (p: string | null) => (p ? (t.has(`purpose.${p}`) ? t(`purpose.${p}`) : p) : "—");

  if (rows.length === 0) {
    return <div className="admin-card text-sm text-adm-muted">{t("table.empty")}</div>;
  }

  return (
    <div className="admin-card overflow-x-auto p-0!">
      <table className="w-full min-w-[980px] border-collapse">
        <thead>
          <tr>
            <th className="admin-th">{t("table.unit")}</th>
            <th className="admin-th">{t("table.resident")}</th>
            <th className="admin-th">{t("table.purpose")}</th>
            <th className="admin-th">{t("table.transferDate")}</th>
            <th className="admin-th">
              <span className="inline-flex items-center gap-1.5">
                {t("table.houseCode")}
                <Link href={toggleCodesHref} scroll={false} title={showCodes ? t("table.hideCodes") : t("table.showCodes")} className="text-adm-muted hover:text-adm-text">
                  {showCodes ? <EyeOff size={14} aria-hidden /> : <Eye size={14} aria-hidden />}
                  <span className="sr-only">{showCodes ? t("table.hideCodes") : t("table.showCodes")}</span>
                </Link>
              </span>
            </th>
            <th className="admin-th">{t("table.card")}</th>
            <th className="admin-th">{t("table.partners")}</th>
            <th className="admin-th">{t("table.portal")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const days = row.lastLoginDays;
            const masked = row.houseCode.slice(0, row.houseCode.lastIndexOf("-") + 1) + "••••";
            return (
              <tr key={row.unitId} className="hover:bg-adm-text/3">
                <td className="admin-td">
                  <Link href={row.href} scroll={false} className="admin-mono font-semibold text-adm-text hover:underline">
                    {row.unitNumber}
                  </Link>
                  <div className="text-[11.5px] text-adm-muted">{row.typeName}</div>
                </td>
                <td className="admin-td">
                  <div className="flex items-center gap-2.5">
                    <Avatar id={row.residentId} name={row.ownerName} />
                    <div className="min-w-0">
                      <Link href={row.href} scroll={false} className="block font-medium text-adm-text hover:underline">
                        {row.ownerName}
                      </Link>
                      <div className="text-[11.5px] text-adm-muted">
                        {row.nationality} · <RevealPhone residentId={row.residentId} masked={row.maskedPhone} />
                      </div>
                      {!row.hasEmail && <StatusPill tone="warning" dot={false} label={t("table.noEmail")} className="mt-0.5 h-[18px]! text-[10.5px]!" />}
                    </div>
                  </div>
                </td>
                <td className="admin-td">{purpose(row.purpose)}</td>
                <td className="admin-td admin-mono">{formatDateShort(locale, row.transferDate)}</td>
                <td className="admin-td">
                  <span className="admin-mono rounded-md bg-adm-text/5 px-1.5 py-0.5 text-[12px]">{showCodes ? row.houseCode : masked}</span>
                </td>
                <td className="admin-td">
                  {row.cardStatus ? <StatusPill tone={CARD_TONE[row.cardStatus]} dot={false} label={t(`cardStatus.${row.cardStatus}`)} /> : "—"}
                  {row.cardStatus === "HANDED" && row.handedAt && (
                    <div className="text-[11px] text-adm-muted">{formatDateShort(locale, row.handedAt)}</div>
                  )}
                  {row.members > 0 && (
                    <div className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-adm-muted">
                      <Users size={11} aria-hidden />
                      {t("table.household", { count: row.members })}
                    </div>
                  )}
                </td>
                <td className="admin-td">
                  <StatusPill tone="success" dot={false} label={t("table.partnersUsable", { count: row.partners.usable })} />{" "}
                  <span className="text-[11.5px] text-adm-muted">{t("table.partnersTotal", { count: row.partners.total })}</span>
                </td>
                <td className="admin-td">
                  {days === null ? (
                    <StatusPill tone="warning" dot={false} label={t("table.neverLoggedIn")} />
                  ) : (
                    <span className="text-adm-text/80">{days === 0 ? t("table.today") : t("table.daysAgo", { count: days })}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
