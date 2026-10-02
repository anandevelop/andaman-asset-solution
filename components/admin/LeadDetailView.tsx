/**
 * components/admin/LeadDetailView.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Everything known about one lead, and every control for working it —
 * drawn two ways from the same query and the same components:
 *
 *   · variant="page"   /admin/leads/[id]: the full screen, activity on the
 *                      left and details in a side column. What a shared
 *                      link or a bookmark opens.
 *   · variant="drawer" beside the pipeline at /admin/leads?lead=[id], one
 *                      column. Clicking a row used to navigate away and
 *                      drop the board's filters and scroll position; the
 *                      drawer keeps both, and Esc returns to where you were.
 *
 * One component rather than two screens so the drawer cannot fall behind
 * the page: the same fields, the same PDPA block, the same access rule.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { LeadStatus, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { safeQuery, isDatabaseOffline, DatabaseUnavailableError } from "@/lib/db";
import { requireCapability } from "@/lib/admin/guard";
import { initialsFrom, intlLocale } from "@/lib/format";
import { nationalityLabel } from "@/lib/countries";
import type { Locale } from "@/i18n";
import { getLeadTimeline, type LeadTimelineEntry } from "@/lib/lead-timeline";
import { getReservableUnits } from "@/lib/projects";
import { phoneLocalTime } from "@/lib/phone-timezone";
import { retentionTargetDate } from "@/lib/pdpa";
import { can } from "@/lib/permissions";
import { maskEmail, maskPhone } from "@/lib/contact-mask";
import { nextStepFor } from "@/lib/admin/lead-next-step";
import LeadStatusSelect from "@/components/admin/LeadStatusSelect";
import LeadAssignSelect from "@/components/admin/LeadAssignSelect";
import LeadFollowUpInput from "@/components/admin/LeadFollowUpInput";
import LeadHousePreferenceInput from "@/components/admin/LeadHousePreferenceInput";
import LeadActivityComposer from "@/components/admin/LeadActivityComposer";
import LeadActivityTimeline, { type TimelineItem } from "@/components/admin/LeadActivityTimeline";
import LeadUnitPicker from "@/components/admin/LeadUnitPicker";
import RevealContact from "@/components/admin/RevealContact";
import LeadNextStepCard, { type NextStepAction } from "@/components/admin/LeadNextStepCard";

export type LeadDetailVariant = "page" | "drawer";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

function toDateInputValue(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

function isSameUtcDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

export default async function LeadDetailView({
  locale,
  id,
  variant,
}: {
  locale: string;
  id: string;
  variant: LeadDetailVariant;
}) {
  /* Capability, not rank: EDITOR outranks SALES, so the old
     requireAdmin(locale, Role.SALES) here let every content editor read
     every customer's name, phone and email. See lib/permissions.ts. */
  const session = await requireCapability(locale, "viewAllLeads");

  const t = await getTranslations({ locale, namespace: "admin" });

  const lead = await safeQuery(
    "admin:leads:detail",
    () =>
      prisma.leadInquiry.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          nationality: true,
          message: true,
          source: true,
          status: true,
          consentGiven: true,
          consentedAt: true,
          consentVersion: true,
          createdAt: true,
          assignedToId: true,
          followUpAt: true,
          commsLanguage: true,
          housePreference: true,
          project: { select: { id: true, slug: true, nameEn: true, nameTh: true } },
          reservedUnits: { select: { id: true, unitNumber: true, reservationExpiresAt: true } },
          utmSource: true,
          utmMedium: true,
          utmCampaign: true,
        },
      }),
    undefined,
  );

  // Another rep's lead reads as not-found to a SALES session, not as a
  // permission error (see the page's file header). In the drawer, though,
  // a hidden or missing lead must not 404 the whole pipeline behind it —
  // a stale ?lead= link gets a one-line message in the panel instead.
  const notHere = (
    <p className="px-5 py-10 text-center text-sm text-ink-muted">{t("leadDrawer.notFound")}</p>
  );

  if (!lead) {
    if (isDatabaseOffline()) throw new DatabaseUnavailableError(`admin/leads/${id}`);
    if (variant === "page") notFound();
    return notHere;
  }

  if (session.role === Role.SALES && lead.assignedToId && lead.assignedToId !== session.id) {
    if (variant === "page") notFound();
    return notHere;
  }

  const [assignees, timeline, reservableUnits, openAppointments] = await Promise.all([
    safeQuery(
      "admin:leads:assignees",
      () =>
        prisma.user.findMany({
          where: { isActive: true, role: { in: [Role.SALES, Role.EDITOR, Role.ADMIN, Role.SUPER_ADMIN] } },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        }),
      [],
    ),
    getLeadTimeline(id),
    lead.project ? getReservableUnits(lead.project.id) : Promise.resolve([]),
    /* Still-open appointments only: the card shows the one that needs
       something — past and unclosed, or the next one ahead. */
    safeQuery(
      "admin:leads:openAppointments",
      () =>
        prisma.appointment.findMany({
          where: { leadId: id, status: { in: ["REQUESTED", "CONFIRMED"] } },
          orderBy: { scheduledAt: "asc" },
          select: {
            id: true,
            scheduledAt: true,
            status: true,
            location: true,
            project: { select: { nameEn: true, nameTh: true } },
            assignedTo: { select: { name: true } },
          },
        }),
      [],
    ),
  ]);

  const statusLabels = Object.fromEntries(
    Object.values(LeadStatus).map((value) => [value, t(`leadStatus.${value}` as never)]),
  ) as Record<LeadStatus, string>;

  const now = new Date();
  const dateFormat = new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const timeFormat = new Intl.DateTimeFormat(intlLocale(locale), { hour: "2-digit", minute: "2-digit" });

  /** "วันนี้ 09:12" / "เมื่อวาน 16:40" / a full date — same relative-day
   *  logic the leads board already uses for appointment badges. */
  function dayTimeLabel(at: Date): string {
    if (isSameUtcDay(at, now)) return `${t("common.today")} ${timeFormat.format(at)}`;
    const yesterday = new Date(now.getTime() - DAY_MS);
    if (isSameUtcDay(at, yesterday)) return `${t("common.yesterday")} ${timeFormat.format(at)}`;
    return dateFormat.format(at);
  }

  /** "6 ชม. ที่แล้ว" / "4 วัน ที่แล้ว" — the header's "last touched". */
  function agoLabel(at: Date): string {
    const hours = Math.max(0, Math.round((now.getTime() - at.getTime()) / HOUR_MS));
    return hours < 24
      ? t("leadDetail.hoursAgo", { hours })
      : t("leadDetail.daysAgo", { days: Math.floor(hours / 24) });
  }

  const projectLabel = lead.project ? (locale === "th" ? lead.project.nameTh : lead.project.nameEn) : null;

  // ── Header meta ────────────────────────────────────────────────────────
  const pipelineDays = Math.floor((now.getTime() - lead.createdAt.getTime()) / DAY_MS);
  const lastTouchedAt = timeline[0]?.at ?? lead.createdAt;
  const commsLabel = lead.commsLanguage ? lead.commsLanguage.toUpperCase() : null;
  const nationality = nationalityLabel(lead.nationality, locale as Locale);
  const localTime = phoneLocalTime(lead.phone, intlLocale(locale), now);
  const retentionDate = retentionTargetDate(lead.consentedAt);
  const currentReservation = lead.reservedUnits[0]
    ? {
        unitId: lead.reservedUnits[0].id,
        unitNumber: lead.reservedUnits[0].unitNumber,
        expiresAt: toDateInputValue(lead.reservedUnits[0].reservationExpiresAt),
      }
    : null;

  // ── Timeline entries → display items ────────────────────────────────────
  function itemFor(entry: LeadTimelineEntry): TimelineItem {
    const timeLabel = dayTimeLabel(entry.at);

    switch (entry.kind) {
      case "NOTE":
        return {
          id: entry.id,
          icon: "note",
          title: t("leadDetail.timeline.noteBy", {
            name: entry.authorName ?? t("leadDetail.timeline.unknownAuthor"),
          }),
          body: entry.body,
          timeLabel,
        };
      case "CALL":
        return {
          id: entry.id,
          icon: "call",
          title: entry.durationSeconds
            ? t("leadDetail.timeline.callByWithDuration", {
                name: entry.authorName ?? t("leadDetail.timeline.unknownAuthor"),
                minutes: Math.floor(entry.durationSeconds / 60),
                seconds: entry.durationSeconds % 60,
              })
            : t("leadDetail.timeline.callBy", {
                name: entry.authorName ?? t("leadDetail.timeline.unknownAuthor"),
              }),
          body: entry.body,
          timeLabel,
        };
      case "EMAIL":
        return {
          id: entry.id,
          icon: "email",
          title: t("leadDetail.timeline.emailBy", {
            name: entry.authorName ?? t("leadDetail.timeline.unknownAuthor"),
          }),
          body: entry.body,
          timeLabel,
        };
      case "SYSTEM":
        // The body already says what changed and to what (written at the
        // moment of the change by leads/actions.ts, which is the only
        // place that knows the new value — see lib/lead-timeline.ts's
        // header). Only the "by {name}" suffix is composed here, the same
        // way the mockup puts it at the end of the sentence rather than on
        // the meta line below.
        return {
          id: entry.id,
          icon: "system",
          title: entry.authorName
            ? `${entry.body} ${t("leadDetail.byActor", { name: entry.authorName })}`
            : entry.body,
          timeLabel,
        };
      case "APPOINTMENT_CREATED": {
        const apptProject = entry.project
          ? locale === "th"
            ? entry.project.nameTh
            : entry.project.nameEn
          : t("leadDetail.noProject");
        return {
          id: entry.id,
          icon: "appointment",
          title: t("leadDetail.timeline.appointmentCreated", {
            project: apptProject,
            when: dateFormat.format(entry.scheduledAt),
          }),
          meta: entry.assigneeName ?? undefined,
          timeLabel,
        };
      }
      case "ENTERED_SYSTEM":
        return {
          id: entry.id,
          icon: "entered",
          title: entry.sourcePath
            ? t("leadDetail.timeline.enteredSystemFrom", { path: entry.sourcePath })
            : t("leadDetail.timeline.enteredSystem"),
          meta: t(`leadSource.${entry.source}` as never),
          timeLabel,
        };
    }
  }

  const timelineItems = timeline.map(itemFor);

  // ── Next step ──────────────────────────────────────────────────────────
  const overdueAppointment =
    openAppointments.find((a) => a.status === "REQUESTED" && a.scheduledAt.getTime() < now.getTime()) ?? null;
  const upcomingAppointment = openAppointments.find((a) => a.scheduledAt.getTime() >= now.getTime()) ?? null;
  const shownAppointment = overdueAppointment ?? upcomingAppointment;

  const step = nextStepFor(
    {
      status: lead.status,
      assignedToId: lead.assignedToId,
      followUpAt: lead.followUpAt,
      overdueAppointment,
      upcomingAppointment,
    },
    now,
  );

  const stepCopy: { headline: string; detail: string | null; action: NextStepAction } | null = (() => {
    switch (step?.kind) {
      case "claim":
        return {
          headline: t("leadDetail.nextStep.claim"),
          detail: t("leadDetail.nextStep.claimDetail"),
          action: { kind: "claim", userId: session.id },
        };
      case "closeAppointment":
        return {
          headline: t("leadDetail.nextStep.closeAppointment"),
          detail: t("leadDetail.nextStep.closeAppointmentDetail", { when: dateFormat.format(step.scheduledAt) }),
          action: { kind: "closeAppointment", appointmentId: step.appointmentId },
        };
      case "followUpDue":
        return {
          headline: t("leadDetail.nextStep.followUpDue"),
          detail: t("leadDetail.nextStep.followUpDueDetail", { date: dateFormat.format(step.since) }),
          action: null,
        };
      case "firstContact":
        return {
          headline: t("leadDetail.nextStep.firstContact"),
          detail: t("leadDetail.nextStep.firstContactDetail"),
          action: null,
        };
      case "prepareViewing":
        return {
          headline: t("leadDetail.nextStep.prepareViewing", { when: dateFormat.format(step.scheduledAt) }),
          detail: t("leadDetail.nextStep.prepareViewingDetail"),
          action: null,
        };
      case "keepNegotiating":
        return {
          headline: t("leadDetail.nextStep.keepNegotiating"),
          detail: t("leadDetail.nextStep.keepNegotiatingDetail"),
          action: null,
        };
      default:
        return null;
    }
  })();

  const isDrawer = variant === "drawer";
  const Heading = isDrawer ? "h2" : "h1";
  const canContact = can(session.role, "viewCustomerContact");
  const revealLabels = { show: t("leadDetail.reveal"), failed: t("leadDetail.revealFailed") };

  // ── Blocks, arranged per variant below ─────────────────────────────────
  const header = (
    <header className="flex items-start gap-3">
      <span
        aria-hidden
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-adm-fill text-base font-semibold text-adm-on-fill"
      >
        {initialsFrom(lead.name) || "·"}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2.5">
          <Heading
            id={isDrawer ? "lead-drawer-title" : undefined}
            className={isDrawer ? "text-xl font-semibold text-ink" : "text-2xl font-semibold leading-tight tracking-[-0.01em] text-adm-text"}
          >
            {lead.name}
          </Heading>
          <LeadStatusSelect
            locale={locale}
            leadId={lead.id}
            value={lead.status}
            labels={statusLabels}
            errorLabel={t("common.error")}
          />
          {(nationality || commsLabel) && (
            <span className="flex items-center gap-1 rounded-full bg-adm-neutral-bg px-2 py-0.5 text-xs font-medium text-adm-neutral">
              {nationality?.flagSrc && (
                // eslint-disable-next-line @next/next/no-img-element -- tiny flag sprite, see CountrySelect.tsx
                <img
                  src={nationality.flagSrc}
                  alt=""
                  aria-hidden
                  className="h-3 w-4 shrink-0 rounded-[1px] object-cover"
                />
              )}
              {[nationality?.label, commsLabel ? t("leadDetail.commsLanguage", { code: commsLabel }) : null]
                .filter(Boolean)
                .join(" · ")}
            </span>
          )}
        </div>
        {/* id · source · date, as in the mockup, then how long it has been
            in the pipeline and since anyone touched it. */}
        <p className="mt-1.5 text-xs text-ink-muted">
          <span className="admin-mono">#{lead.id.slice(-6)}</span>
          {" · "}
          {t(`leadSource.${lead.source}` as never)}
          {" · "}
          {dateFormat.format(lead.createdAt)}
        </p>
        <p className="mt-0.5 text-xs text-ink-muted">
          {t("leadDetail.inPipeline", { days: pipelineDays })}
          {" · "}
          {t("leadDetail.lastTouched", { ago: agoLabel(lastTouchedAt) })}
        </p>
      </div>
    </header>
  );

  const nextStepCard = (
    <LeadNextStepCard
      locale={locale}
      leadId={lead.id}
      headline={stepCopy?.headline ?? null}
      detail={stepCopy?.detail ?? null}
      action={stepCopy?.action ?? null}
      canContact={canContact}
      labels={{
        title: t("leadDetail.nextStep.title"),
        call: t("leadDetail.nextStep.call"),
        whatsapp: t("leadDetail.nextStep.whatsapp"),
        scheduleViewing: t("leadDetail.scheduleViewing"),
        claim: t("leadDetail.nextStep.claimButton"),
        visited: t("leadDetail.nextStep.visited"),
        noShow: t("leadDetail.nextStep.noShow"),
        claimed: t("leadDetail.nextStep.claimed"),
        closedVisited: t("leadDetail.nextStep.closedVisited"),
        closedNoShow: t("leadDetail.nextStep.closedNoShow"),
        failed: t("leadDetail.nextStep.failed"),
        revealFailed: t("leadDetail.revealFailed"),
      }}
    />
  );

  /* Key/value, masked. The full value is one audited click away — see
     RevealContact and lib/contact-mask.ts. */
  const contact = (
    <section className="admin-card space-y-3">
      <h2 className="text-sm font-semibold text-ink">{t("leadDetail.contactInfo")}</h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-sm">
        <dt className="text-xs leading-6 text-ink-muted">{t("leadDetail.email")}</dt>
        <dd>
          {/* A hand-entered lead may have no email (lib/admin/lead-create.ts);
              there is nothing to mask or reveal then. */}
          {!lead.email ? (
            <span className="text-adm-muted">—</span>
          ) : canContact ? (
            <RevealContact leadId={lead.id} field="email" masked={maskEmail(lead.email)} labels={revealLabels} />
          ) : (
            <span className="admin-mono">{maskEmail(lead.email)}</span>
          )}
        </dd>
        <dt className="text-xs leading-6 text-ink-muted">{t("leadDetail.phone")}</dt>
        <dd>
          {canContact ? (
            <RevealContact leadId={lead.id} field="phone" masked={maskPhone(lead.phone)} labels={revealLabels} />
          ) : (
            <span className="admin-mono">{maskPhone(lead.phone)}</span>
          )}
        </dd>
        {nationality && (
          <>
            <dt className="text-xs leading-6 text-ink-muted">{t("leadDetail.nationality")}</dt>
            <dd className="flex items-center gap-1.5 text-ink">
              {nationality.flagSrc && (
                // eslint-disable-next-line @next/next/no-img-element -- tiny flag sprite, see CountrySelect.tsx
                <img
                  src={nationality.flagSrc}
                  alt=""
                  aria-hidden
                  className="h-3.5 w-5 shrink-0 rounded-[1px] object-cover"
                />
              )}
              {nationality.label}
            </dd>
          </>
        )}
        {localTime && (
          <>
            <dt className="text-xs leading-6 text-ink-muted">{t("leadDetail.localTime")}</dt>
            <dd className="text-ink">
              {localTime.offsetLabel} · {localTime.timeLabel}
              <span className="ml-1.5 text-xs text-ink-muted">({t("leadDetail.localTimeEstimate")})</span>
            </dd>
          </>
        )}
        <dt className="text-xs leading-6 text-ink-muted">{t("leadDetail.project")}</dt>
        <dd className="text-ink">{projectLabel ?? t("leadDetail.noProject")}</dd>
      </dl>
      {lead.message && (
        <div className="border-t border-adm-line pt-3">
          <p className="text-xs text-ink-muted">{t("leadDetail.message")}</p>
          <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-ink">{lead.message}</p>
        </div>
      )}
    </section>
  );

  const appointmentCard = shownAppointment && (
    <section
      className={[
        "admin-card space-y-1",
        shownAppointment === overdueAppointment ? "border-adm-warning/40!" : "",
      ].join(" ")}
    >
      <h2 className="text-sm font-semibold text-ink">
        {shownAppointment === overdueAppointment
          ? t("leadDetail.appointmentOverdue")
          : t("leadDetail.appointmentNext")}
      </h2>
      <p className="text-sm text-ink">{dateFormat.format(shownAppointment.scheduledAt)}</p>
      <p className="text-xs text-ink-muted">
        {[
          shownAppointment.project
            ? locale === "th"
              ? shownAppointment.project.nameTh
              : shownAppointment.project.nameEn
            : null,
          shownAppointment.location,
          shownAppointment.assignedTo?.name,
          t(`appointmentStatus.${shownAppointment.status}` as never),
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
    </section>
  );

  const timelineCard = (
    <section className="admin-card space-y-4">
      <h2 className="text-sm font-semibold text-ink">{t("leadDetail.timelineTitle")}</h2>
      <LeadActivityTimeline items={timelineItems} emptyLabel={t("leadDetail.timelineEmpty")} />
    </section>
  );

  const composer = (
    <LeadActivityComposer
      locale={locale}
      leadId={lead.id}
      projectId={lead.project?.id ?? null}
      assignedToId={lead.assignedToId}
      labels={{
        tabNote: t("leadDetail.composer.tabNote"),
        tabCall: t("leadDetail.composer.tabCall"),
        tabEmail: t("leadDetail.composer.tabEmail"),
        tabAppointment: t("leadDetail.composer.tabAppointment"),
        placeholderNote: t("leadDetail.composer.placeholderNote"),
        placeholderCall: t("leadDetail.composer.placeholderCall"),
        placeholderEmail: t("leadDetail.composer.placeholderEmail"),
        durationLabel: t("leadDetail.composer.durationLabel"),
        minutes: t("leadDetail.composer.minutes"),
        seconds: t("leadDetail.composer.seconds"),
        submit: t("leadDetail.composer.submit"),
        error: t("common.error"),
        appointmentDate: t("leadDetail.composer.appointmentDate"),
        appointmentDuration: t("leadDetail.composer.appointmentDuration"),
        appointmentSubmit: t("leadDetail.composer.appointmentSubmit"),
        appointmentFullLink: t("leadDetail.composer.appointmentFullLink"),
      }}
    />
  );

  const ownership = (
    <section className="admin-card space-y-4">
      <h2 className="text-sm font-semibold text-ink">{t("leadDetail.ownershipTitle")}</h2>

      <div>
        <p className="admin-label">{t("leadDetail.assignTitle")}</p>
        <LeadAssignSelect
          locale={locale}
          leadId={lead.id}
          value={lead.assignedToId}
          assignees={assignees}
          unassignedLabel={t("leadDetail.unassigned")}
          errorLabel={t("common.error")}
        />
      </div>

      <div>
        <p className="admin-label">{t("leadDetail.followUpTitle")}</p>
        <LeadFollowUpInput
          locale={locale}
          leadId={lead.id}
          value={toDateInputValue(lead.followUpAt)}
          overdueLabel={t("leads.followUpOverdue")}
          errorLabel={t("common.error")}
        />
      </div>

      <div>
        <p className="admin-label">{t("leadDetail.housePreference")}</p>
        <LeadHousePreferenceInput
          locale={locale}
          leadId={lead.id}
          value={lead.housePreference}
          placeholder={t("leadDetail.housePreferencePlaceholder")}
          errorLabel={t("common.error")}
        />
      </div>

      {lead.project && (
        <LeadUnitPicker
          locale={locale}
          leadId={lead.id}
          reservableUnits={reservableUnits}
          current={currentReservation}
          labels={{
            label: t("leadDetail.unitInterest.label"),
            placeholder: t("leadDetail.unitInterest.placeholder"),
            expiresLabel: t("leadDetail.unitInterest.expiresLabel"),
            reserve: t("leadDetail.unitInterest.reserve"),
            release: t("leadDetail.unitInterest.release"),
            reservedTag: t("leadDetail.unitInterest.reservedTag"),
            error: t("common.error"),
            noUnits: t("leadDetail.unitInterest.noUnits"),
          }}
        />
      )}
    </section>
  );

  const consent = (
    <section className="admin-card space-y-2">
      <h2 className="text-sm font-semibold text-ink">{t("leadDetail.consentTitle")}</h2>
      <p className="text-sm text-ink">
        {lead.consentGiven ? t("leadDetail.consentGiven") : t("leadDetail.consentNotGiven")}
      </p>
      {lead.consentVersion && (
        <p className="text-xs text-ink-muted">{t("leadDetail.consentVersion", { version: lead.consentVersion })}</p>
      )}
      {lead.consentedAt && <p className="text-xs text-ink-muted">{dateFormat.format(lead.consentedAt)}</p>}
      {retentionDate && (
        <p className="text-xs text-ink-muted">
          {t("leadDetail.retentionTarget", { date: dateFormat.format(retentionDate) })}
        </p>
      )}
      <Link
        href={`/${locale}/admin/settings/privacy`}
        className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-adm-accent-ink hover:underline"
      >
        <ShieldAlert size={12} aria-hidden />
        {t("leadDetail.privacyLink")}
      </Link>
    </section>
  );

  const sourceCard = (
    <section className="admin-card space-y-2">
      <h2 className="text-sm font-semibold text-ink">{t("leadDetail.sourceTitle")}</h2>
      <p className="text-sm text-ink">{t(`leadSource.${lead.source}` as never)}</p>

      {/* Not in the mockup's sidebar, kept because it's real,
          existing functionality (raw campaign attribution) that a
          marketer relies on. */}
      {(lead.utmSource || lead.utmMedium || lead.utmCampaign) && (
        <dl className="space-y-1 border-t border-adm-line pt-2 text-xs text-ink-muted">
          {lead.utmSource && (
            <div>
              <span className="font-medium text-ink">utm_source:</span> {lead.utmSource}
            </div>
          )}
          {lead.utmMedium && (
            <div>
              <span className="font-medium text-ink">utm_medium:</span> {lead.utmMedium}
            </div>
          )}
          {lead.utmCampaign && (
            <div>
              <span className="font-medium text-ink">utm_campaign:</span> {lead.utmCampaign}
            </div>
          )}
        </dl>
      )}
    </section>
  );

  const offlineNotice = isDatabaseOffline() && (
    <p className="rounded-control border border-adm-warning/30 bg-adm-warning-bg px-4 py-3 text-sm text-adm-warning">
      {t("common.offline")}
    </p>
  );

  /* The drawer reads top to bottom in the order a rep works a lead (the v4
     mockup): who, what to do next, how to reach them, the booked viewing,
     what has happened, then the composer — with ownership, consent and
     source below. The page has the room for two columns. */
  if (isDrawer) {
    return (
      <div className="space-y-4 px-5 py-4">
        {header}
        {offlineNotice}
        {nextStepCard}
        {contact}
        {appointmentCard}
        {timelineCard}
        {composer}
        {ownership}
        {consent}
        {sourceCard}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/${locale}/admin/leads`}
          className="inline-flex items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-primary"
        >
          <ArrowLeft size={15} aria-hidden />
          {t("leadDetail.back")}
        </Link>
      </div>

      {header}
      {offlineNotice}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {nextStepCard}
          {composer}
          {timelineCard}
        </div>

        <div className="space-y-6">
          {contact}
          {appointmentCard}
          {ownership}
          {consent}
          {sourceCard}
        </div>
      </div>
    </div>
  );
}
