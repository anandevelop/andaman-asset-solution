/**
 * components/admin/club/partners/UnitBenefits.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The unit drawer's "สิทธิพิเศษพาร์ทเนอร์ของหลังนี้" section (the mockup's
 * benSec). A server component the residents page renders inside its unit
 * drawer; it loads everything itself and hands a serialisable list to
 * UnitBenefitsList, which does the editing.
 *
 * Role rule (lib/club/admin-partners.ts): SUPER_ADMIN edits apply at once;
 * ADMIN and SALES edits wait as one pending request per partner.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { getServerSession } from "next-auth";
import { getTranslations } from "next-intl/server";
import type { Role } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { partnerValidity } from "@/lib/club/benefits";
import { PARTNER_CATEGORIES } from "@/lib/club/constants";
import { canApprove, unitBenefitsData } from "@/lib/club/admin-partners";
import UnitBenefitsList, { type UnitBenefitItem } from "./UnitBenefitsList";
import { fmtDate } from "./ui";

export default async function UnitBenefits({
  unitId,
  locale,
  role,
  userName,
}: {
  unitId: string;
  locale: string;
  role: Role;
  userName: string;
}) {
  const [t, data, session] = await Promise.all([
    getTranslations({ locale, namespace: "clubPartners" }),
    unitBenefitsData(unitId),
    getServerSession(authOptions),
  ]);
  if (!data) return <p className="text-sm text-adm-muted">{t("unit.notFound")}</p>;

  const userId = session?.user?.id ?? null;
  const isOwn = (request: { requestedById: string; requestedByName: string }) =>
    userId ? request.requestedById === userId : request.requestedByName === userName;

  const order = new Map<string, number>(PARTNER_CATEGORIES.map((cat, index) => [cat.key, index]));
  const now = new Date();
  const items: UnitBenefitItem[] = [...data.partners]
    .sort((a, b) => (order.get(a.category) ?? 99) - (order.get(b.category) ?? 99))
    .map((partner) => {
      const override = data.overrides.find((row) => row.partnerId === partner.id);
      const request = data.pending.find((row) => row.partnerId === partner.id);
      const v = partnerValidity(partner.validFrom, partner.validTo, now);
      return {
        partnerId: partner.id,
        name: partner.name,
        category: partner.category,
        area: partner.area,
        coverImage: partner.coverImage,
        defaultPct: partner.discountPct,
        note: partner.discountNote,
        live: { hidden: override?.hidden ?? false, pct: override?.discountPct ?? null },
        validity: {
          state: v.state,
          date: v.state === "upcoming" ? v.from.toISOString() : v.state === "open" ? null : v.to ? v.to.toISOString() : null,
          days: v.state === "soon" ? v.daysLeft : null,
        },
        request: request
          ? {
              id: request.id,
              to: { hidden: request.toHidden, pct: request.toPct },
              by: request.requestedByName,
              at: request.updatedAt.toISOString(),
              own: isOwn(request),
            }
          : null,
      };
    });

  const last = data.lastApplied;
  const lastApplied = last?.decidedAt
    ? last.decidedById === last.requestedById
      ? t("unit.lastAppliedSelf", { name: last.decidedByName ?? "", date: fmtDate(last.decidedAt, locale, "Asia/Bangkok") })
      : t("unit.lastAppliedApproved", {
          by: last.requestedByName,
          approver: last.decidedByName ?? "",
          date: fmtDate(last.decidedAt, locale, "Asia/Bangkok"),
        })
    : null;

  return (
    <UnitBenefitsList
      locale={locale}
      unitId={unitId}
      projectCode={(data.unit.project.cardCode ?? "").toUpperCase()}
      items={items}
      hiddenForProject={data.hiddenForProject}
      canApprove={canApprove(role)}
      lastApplied={lastApplied}
    />
  );
}
