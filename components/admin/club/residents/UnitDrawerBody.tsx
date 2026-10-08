/**
 * components/admin/club/residents/UnitDrawerBody.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The unit drawer (?unit=<id>) on /admin/residents. What it shows depends
 * on the unit's status:
 *
 *   TRANSFERRED  resident (masked contacts, e-mail, household, previous
 *                owners) → card (QR, facts, stepper, files, reissue) →
 *                trusted devices → access log → per-house partner
 *                benefits (owned by the partners area) → resale (ADMIN+)
 *   SOLD         buyer + "record transfer"
 *   RESERVED     who holds it and until when
 *   AVAILABLE    unit facts only
 *
 * ?panel=resale swaps the body for the resale form (ADMIN+ only).
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CalendarClock, Check, Clock, FileText, KeyRound, Lock, ShieldCheck, Users } from "lucide-react";
import type { CardEventKind, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { maskEmail, maskPhone } from "@/lib/contact-mask";
import { formatDateShort, formatNumber, intlLocale } from "@/lib/format";
import { cardUrl } from "@/lib/club/constants";
import { projectName } from "@/lib/club/portal";
import { daysUntil, maskCardUrl, maskHouseCode, qrPreviewSvg, type UnitDetail } from "@/lib/club/admin-residents";
import {
  addMember,
  recordHandover,
  recordResale,
  recordTransfer,
  updateResidentEmail,
} from "@/app/[locale]/admin/(club)/residents/actions";
import Avatar from "@/components/admin/ui/Avatar";
import StatusPill, { type PillTone } from "@/components/admin/ui/StatusPill";
import UnitBenefits from "@/components/admin/club/partners/UnitBenefits";
import RevealPhone from "./RevealPhone";
import { EmailEditor, MembersEditor } from "./ResidentEditors";
import { CardActions, CardStepper, DeviceList } from "./CardControls";
import { ResaleForm, TransferForm } from "./UnitForms";

export const STATUS_TONE: Record<UnitDetail["status"], PillTone> = {
  AVAILABLE: "success",
  RESERVED: "warning",
  SOLD: "info",
  TRANSFERRED: "accent",
};

/** Access-log line colour, as in the mockup's ALOG. */
const LOG_TONE: Partial<Record<CardEventKind, string>> = {
  OTP_OK: "border-adm-success",
  CARD_HANDED: "border-adm-success",
  OTP_FAIL: "border-adm-warning",
  OTP_LOCK: "border-adm-danger",
  SCAN_REVOKED: "border-adm-danger",
  REISSUE: "border-adm-status-info",
  SIGN_OUT_ALL: "border-adm-status-info",
  SIGN_OUT_DEVICE: "border-adm-status-info",
  RESALE: "border-adm-status-info",
  QR_DOWNLOAD: "border-adm-status-info",
  EMAIL_CHANGED: "border-adm-status-info",
  PHONE_REVEALED: "border-adm-status-info",
  MEMBER_ADDED: "border-adm-status-info",
  MEMBER_REMOVED: "border-adm-status-info",
  CARD_PRINTED: "border-adm-status-info",
};

function Section({ title, right, children }: { title: React.ReactNode; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="border-t border-adm-line pt-4 first:border-t-0 first:pt-0">
      <div className="mb-2.5 flex items-center gap-2">
        <h3 className="admin-section-title">{title}</h3>
        {right && <div className="ml-auto">{right}</div>}
      </div>
      {children}
    </section>
  );
}

export default async function UnitDrawerBody({
  locale,
  unit,
  role,
  userName,
  isAdmin,
  panel,
  selfHref,
}: {
  locale: string;
  unit: UnitDetail;
  role: Role;
  userName: string;
  isAdmin: boolean;
  panel: string | null;
  /** This drawer's URL without ?panel — where the resale form returns to. */
  selfHref: string;
}) {
  const t = await getTranslations({ locale, namespace: "clubResidents" });
  const fd = (d: Date) => formatDateShort(locale, d);
  const hm = (d: Date) => new Intl.DateTimeFormat(intlLocale(locale), { hour: "2-digit", minute: "2-digit" }).format(d);
  const resident = unit.resident;
  const pName = projectName(unit.project, locale);

  // ── Resale panel ─────────────────────────────────────────────────────
  if (panel === "resale" && isAdmin && resident) {
    const current = resident.cards.find((c) => !c.revokedAt);
    const [overrides, pending] = await Promise.all([
      prisma.partnerUnitOverride.count({ where: { unitId: unit.id } }),
      prisma.partnerOverrideRequest.count({ where: { unitId: unit.id, status: "PENDING" } }),
    ]);
    return (
      <div className="space-y-4">
        <p className="text-sm text-adm-muted">{t("resale.subtitle", { project: pName, unit: unit.unitNumber, owner: resident.ownerName })}</p>
        <ResaleForm
          action={recordResale.bind(null, unit.id)}
          closeHref={selfHref}
          info={{
            currentVersion: current?.version ?? 0,
            nextVersion: (resident.cards[0]?.version ?? 0) + 1,
            devices: resident.devices.length,
            overrides,
            pending,
          }}
        />
      </div>
    );
  }

  const facts: [string, React.ReactNode][] = [
    [t("unit.price"), unit.priceTHB ? `฿${formatNumber(locale, Number(unit.priceTHB))}` : "—"],
    [t("unit.land"), unit.landAreaSqm ? t("unit.sqm", { value: formatNumber(locale, Number(unit.landAreaSqm)) }) : "—"],
    [t("unit.facing"), [unit.facing, unit.viewLabel].filter(Boolean).join(" · ") || "—"],
    [t("unit.type"), unit.unitType?.name ?? "—"],
  ];

  let body: React.ReactNode = null;

  if (unit.status === "TRANSFERRED" && resident) {
    const card = resident.cards.find((c) => !c.revokedAt) ?? null;
    const revoked = resident.cards.filter((c) => c.revokedAt).length;
    const code = unit.project.cardCode;
    const url = card && code ? cardUrl(code, card.token) : null;
    const qrSvg = url ? await qrPreviewSvg(url) : null;
    const memberNames = new Map(resident.members.map((m) => [m.id, m.name]));

    body = (
      <>
        <Section title={t("resident.title")}>
          <div className="flex items-start gap-3">
            <Avatar id={resident.id} name={resident.ownerName} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold text-adm-text">{resident.ownerName}</p>
              <p className="text-xs text-adm-muted">
                {resident.nationality} · <RevealPhone residentId={resident.id} masked={maskPhone(resident.phone)} />
                {resident.purpose && ` · ${t.has(`purpose.${resident.purpose}`) ? t(`purpose.${resident.purpose}`) : resident.purpose}`}
              </p>
              <EmailEditor maskedEmail={resident.email ? maskEmail(resident.email) : null} action={updateResidentEmail.bind(null, resident.id)} />
            </div>
          </div>
          <MembersEditor
            addAction={addMember.bind(null, resident.id)}
            members={resident.members.map((m) => ({
              id: m.id,
              name: m.name,
              relation: m.relation,
              maskedEmail: maskEmail(m.email),
              addedBy: m.addedBy,
              createdAt: m.createdAt,
            }))}
          />
          {resident.pastOwners.length > 0 && (
            <p className="mt-3 flex items-start gap-1.5 text-[11.5px] text-adm-muted">
              <Clock size={12} className="mt-0.5 shrink-0" aria-hidden />
              <span>
                {t("resident.previousOwners")}: {resident.pastOwners.map((p) => `${p.ownerName} (${fd(p.fromDate)} – ${fd(p.toDate)})`).join(" · ")}
              </span>
            </p>
          )}
        </Section>

        <Section title={t("card.title")}>
          {card && url && code ? (
            <>
              <div className="flex items-center gap-3.5 rounded-xl border border-adm-line p-2.5">
                <div
                  className="w-[104px] shrink-0 overflow-hidden rounded-lg border border-adm-line bg-white leading-none [&_svg]:h-auto [&_svg]:w-full"
                  dangerouslySetInnerHTML={{ __html: qrSvg ?? "" }}
                />
                <div className="min-w-0 flex-1 space-y-1 text-xs text-adm-text/80">
                  <p className="admin-mono truncate rounded-md bg-adm-text/5 px-2 py-1 text-[12px] text-adm-text">{maskCardUrl(url)}</p>
                  <p className="flex items-start gap-1.5">
                    <ShieldCheck size={13} className="mt-px shrink-0 text-adm-muted" aria-hidden />
                    {t("card.factRandom")}
                  </p>
                  <p className="flex items-start gap-1.5">
                    <Lock size={13} className="mt-px shrink-0 text-adm-muted" aria-hidden />
                    {resident.email ? (
                      <span>
                        {t("card.factOtp", { email: maskEmail(resident.email) })}
                        {resident.members.length > 0 && ` ${t("card.factOtpMore", { count: resident.members.length })}`}
                      </span>
                    ) : (
                      <b className="text-adm-warning">{t("card.factNoEmail")}</b>
                    )}
                  </p>
                  <p className="flex items-start gap-1.5">
                    <Check size={13} className="mt-px shrink-0 text-adm-muted" aria-hidden />
                    {t("card.factNoExpiry")}
                  </p>
                  <p className="flex items-start gap-1.5">
                    <FileText size={13} className="mt-px shrink-0 text-adm-muted" aria-hidden />
                    {t("card.factVersion", { version: card.version, date: fd(card.issuedAt) })}
                    {revoked > 0 && ` · ${t("card.factRevoked", { count: revoked })}`}
                  </p>
                  <p className="flex items-start gap-1.5">
                    <KeyRound size={13} className="mt-px shrink-0 text-adm-muted" aria-hidden />
                    {t("card.factHouseCode")} <b className="admin-mono">{maskHouseCode(resident.houseCode)}</b>
                  </p>
                </div>
              </div>
              <CardStepper
                ownerName={resident.ownerName}
                handoverAction={recordHandover.bind(null, card.id)}
                card={{
                  id: card.id,
                  status: card.status,
                  printedAt: card.printedAt,
                  handedAt: card.handedAt,
                  handedTo: card.handedTo,
                  handoverMethod: card.handoverMethod,
                  handedBy: card.handedBy,
                }}
              />
              <CardActions
                cardId={card.id}
                residentId={resident.id}
                version={card.version}
                projectName={pName}
                qrSvg={qrSvg ?? ""}
                maskedUrl={maskCardUrl(url)}
                canReissue={isAdmin}
              />
            </>
          ) : (
            <p className="text-sm text-adm-muted">{t("card.none")}</p>
          )}

          <DeviceList
            residentId={resident.id}
            canManage={isAdmin}
            devices={resident.devices.map((d) => ({
              id: d.id,
              label: d.label,
              firstSeen: d.firstSeen,
              lastSeen: d.lastSeen,
              expiresAt: d.expiresAt,
              member: d.memberId ? (memberNames.get(d.memberId) ?? null) : null,
            }))}
          />

          <div className="mt-5">
            <p className="mb-1.5 text-xs font-medium text-adm-text">{t("log.title")}</p>
            {resident.events.length === 0 ? (
              <p className="text-xs text-adm-muted">{t("log.empty")}</p>
            ) : (
              <ul className="text-xs">
                {resident.events.map((event) => (
                  <li
                    key={event.id}
                    className={`grid grid-cols-[118px_1fr] gap-x-2 border-l-2 py-1.5 pl-2.5 ${LOG_TONE[event.kind] ?? "border-adm-line"}`}
                  >
                    <span className="admin-mono text-adm-muted">
                      {fd(event.createdAt)} {hm(event.createdAt)}
                    </span>
                    <b className={`font-medium ${event.kind === "OTP_LOCK" || event.kind === "SCAN_REVOKED" ? "text-adm-danger" : "text-adm-text"}`}>
                      {t(`log.kinds.${event.kind}`)}
                    </b>
                    {(event.device || event.actor) && (
                      <small className="col-start-2 text-adm-muted">{[event.actor, event.device].filter(Boolean).join(" · ")}</small>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Section>

        <UnitBenefits unitId={unit.id} locale={locale} role={role} userName={userName} />

        <div className="flex flex-wrap items-center gap-2 border-t border-adm-line pt-4">
          {isAdmin ? (
            <Link href={`${selfHref}&panel=resale`} scroll={false} className="admin-btn-ghost ml-auto">
              <Users size={15} aria-hidden />
              {t("resale.open")}
            </Link>
          ) : (
            <span className="ml-auto text-[11.5px] text-adm-muted">{t("resale.adminOnly")}</span>
          )}
        </div>
      </>
    );
  } else if (unit.status === "SOLD") {
    const lead = unit.reservedByLead;
    body = (
      <>
        <Section title={t("buyer.title")}>
          {lead ? (
            <div className="flex items-center gap-3">
              <Avatar id={unit.id} name={lead.name} size="lg" />
              <div>
                <p className="text-[15px] font-semibold text-adm-text">{lead.name}</p>
                <p className="admin-mono text-xs text-adm-muted">
                  {[lead.nationality, maskPhone(lead.phone)].filter(Boolean).join(" · ")}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-adm-muted">{t("buyer.unknown")}</p>
          )}
        </Section>
        <div className="flex items-start gap-2 rounded-[10px] bg-adm-status-info/10 px-3 py-2.5 text-[13px] text-adm-text/85">
          <KeyRound size={15} className="mt-0.5 shrink-0 text-adm-status-info" aria-hidden />
          {unit.project.cardCode ? t("transfer.explain") : t("errors.noCardCode")}
        </div>
        {unit.project.cardCode && (
          <TransferForm
            action={recordTransfer.bind(null, unit.id)}
            defaults={{ ownerName: lead?.name ?? "", nationality: (lead?.nationality ?? "TH").slice(0, 2).toUpperCase() }}
          />
        )}
      </>
    );
  } else if (unit.status === "RESERVED") {
    const exp = unit.reservationExpiresAt;
    const days = exp ? daysUntil(exp) : null;
    body = (
      <>
        <Section title={t("reserved.title")}>
          <p className="text-[15px] font-semibold text-adm-text">{unit.reservedByLead?.name ?? t("buyer.unknown")}</p>
        </Section>
        {exp && days !== null && (
          <div className="flex items-start gap-2 rounded-[10px] bg-adm-warning/12 px-3 py-2.5 text-[13px] text-adm-text/85">
            <CalendarClock size={15} className="mt-0.5 shrink-0 text-adm-warning" aria-hidden />
            {days < 0 ? t("reserved.overdue", { date: fd(exp), days: -days }) : t("reserved.expires", { date: fd(exp), days })}
          </div>
        )}
      </>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill tone={STATUS_TONE[unit.status]} label={t(`status.${unit.status}`)} />
        {unit.unitType && (
          <span className="text-xs text-adm-muted">
            {[
              unit.unitType.name,
              unit.unitType.livingAreaSqm ? t("unit.sqm", { value: formatNumber(locale, Number(unit.unitType.livingAreaSqm)) }) : null,
              unit.unitType.bedrooms ? t("unit.bedrooms", { count: unit.unitType.bedrooms }) : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        )}
      </div>
      <Section title={t("unit.title")}>
        <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 text-[13px]">
          {facts.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-adm-muted">{k}</dt>
              <dd className="text-adm-text">{v}</dd>
            </div>
          ))}
        </dl>
      </Section>
      {body}
    </div>
  );
}
