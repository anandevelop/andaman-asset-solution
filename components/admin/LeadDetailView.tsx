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
import { intlLocale } from "@/lib/format";
import { nationalityLabel } from "@/lib/countries";
import type { Locale } from "@/i18n";
import { getLeadTimeline, type LeadTimelineEntry } from "@/lib/lead-timeline";
import { getReservableUnits } from "@/lib/projects";
import { phoneLocalTime } from "@/lib/phone-timezone";
import { retentionTargetDate } from "@/lib/pdpa";
import LeadStatusSelect from "@/components/admin/LeadStatusSelect";
import LeadAssignSelect from "@/components/admin/LeadAssignSelect";
import LeadFollowUpInput from "@/components/admin/LeadFollowUpInput";
import LeadHousePreferenceInput from "@/components/admin/LeadHousePreferenceInput";
import LeadActivityComposer from "@/components/admin/LeadActivityComposer";
import LeadActivityTimeline, { type TimelineItem } from "@/components/admin/LeadActivityTimeline";
import LeadQuickActions from "@/components/admin/LeadQuickActions";
import LeadUnitPicker from "@/components/admin/LeadUnitPicker";

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

  const [assignees, timeline, reservableUnits] = await Promise.all([
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

  const isDrawer = variant === "drawer";
  const Heading = isDrawer ? "h2" : "h1";

  return (
    <div className={isDrawer ? "space-y-4 px-5 py-4" : "space-y-6"}>
      {!isDrawer && (
        <div>
          <Link
            href={`/${locale}/admin/leads`}
            className="inline-flex items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-primary"
          >
            <ArrowLeft size={15} aria-hidden />
            {t("leadDetail.back")}
          </Link>
        </div>
      )}

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <Heading
              id={isDrawer ? "lead-drawer-title" : undefined}
              className={isDrawer ? "text-xl font-semibold text-ink" : "text-2xl font-semibold text-primary sm:text-3xl"}
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
              <span className="flex items-center gap-1 rounded-xs bg-surface-muted px-2 py-1 text-xs font-medium text-ink-muted">
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
          <p className="mt-2 text-sm text-ink-muted">
            {t("leadDetail.enteredAt", { date: dateFormat.format(lead.createdAt) })}
            {" · "}
            {t("leadDetail.inPipeline", { days: pipelineDays })}
            {" · "}
            {t("leadDetail.lastTouched", { ago: agoLabel(lastTouchedAt) })}
          </p>
        </div>

        <LeadQuickActions
          labels={{ logCall: t("leadDetail.logCall"), scheduleViewing: t("leadDetail.scheduleViewing") }}
        />
      </header>

      {isDatabaseOffline() && (
        <p className="rounded-xs border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t("common.offline")}
        </p>
      )}

      <div className={isDrawer ? "space-y-4" : "grid gap-6 lg:grid-cols-3"}>
        <div className={isDrawer ? "space-y-4" : "space-y-6 lg:col-span-2"}>
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

          <section className="admin-card space-y-4">
            <h2 className="text-sm font-semibold text-primary">{t("leadDetail.timelineTitle")}</h2>
            <LeadActivityTimeline items={timelineItems} emptyLabel={t("leadDetail.timelineEmpty")} />
          </section>
        </div>

        <div className={isDrawer ? "space-y-4" : "space-y-6"}>
          <section className="admin-card space-y-3">
            <h2 className="text-sm font-semibold text-primary">{t("leadDetail.contactInfo")}</h2>
            <dl className="space-y-3">
              <div>
                <dt className="text-xs text-ink-muted">{t("leadDetail.email")}</dt>
                <dd>
                  <a href={`mailto:${lead.email}`} className="text-accent-700 hover:underline">
                    {lead.email}
                  </a>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-ink-muted">{t("leadDetail.phone")}</dt>
                <dd>
                  <a href={`tel:${lead.phone}`} className="text-primary hover:underline">
                    {lead.phone}
                  </a>
                </dd>
              </div>
              {nationality && (
                <div>
                  <dt className="text-xs text-ink-muted">{t("leadDetail.nationality")}</dt>
                  <dd className="flex items-center gap-1.5 text-primary">
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
                </div>
              )}
              {localTime && (
                <div>
                  <dt className="text-xs text-ink-muted">{t("leadDetail.localTime")}</dt>
                  <dd className="text-primary">
                    {localTime.offsetLabel} · {localTime.timeLabel}
                    <span className="ml-1.5 text-xs text-ink-muted">
                      ({t("leadDetail.localTimeEstimate")})
                    </span>
                  </dd>
                </div>
              )}
            </dl>
            {lead.message && (
              <div className="border-t border-primary/10 pt-3">
                <p className="text-xs text-ink-muted">{t("leadDetail.message")}</p>
                <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-primary">
                  {lead.message}
                </p>
              </div>
            )}
          </section>

          <section className="admin-card space-y-4">
            <h2 className="text-sm font-semibold text-primary">{t("leadDetail.ownershipTitle")}</h2>

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
              <dt className="admin-label">{t("leadDetail.project")}</dt>
              <dd className="text-sm text-primary">{projectLabel ?? t("leadDetail.noProject")}</dd>
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

          <section className="admin-card space-y-2">
            <h2 className="text-sm font-semibold text-primary">{t("leadDetail.consentTitle")}</h2>
            <p className="text-sm text-primary">
              {lead.consentGiven ? t("leadDetail.consentGiven") : t("leadDetail.consentNotGiven")}
            </p>
            {lead.consentVersion && (
              <p className="text-xs text-ink-muted">
                {t("leadDetail.consentVersion", { version: lead.consentVersion })}
              </p>
            )}
            {lead.consentedAt && (
              <p className="text-xs text-ink-muted">{dateFormat.format(lead.consentedAt)}</p>
            )}
            {retentionDate && (
              <p className="text-xs text-ink-muted">
                {t("leadDetail.retentionTarget", { date: dateFormat.format(retentionDate) })}
              </p>
            )}
            <Link
              href={`/${locale}/admin/settings/privacy`}
              className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-accent-700 hover:text-accent-800"
            >
              <ShieldAlert size={12} aria-hidden />
              {t("leadDetail.privacyLink")}
            </Link>
          </section>

          <section className="admin-card space-y-2">
            <h2 className="text-sm font-semibold text-primary">{t("leadDetail.sourceTitle")}</h2>
            <p className="text-sm text-primary">{t(`leadSource.${lead.source}` as never)}</p>

            {/* Not in the mockup's sidebar, kept because it's real,
                existing functionality (raw campaign attribution) that a
                marketer relies on — same call the dashboard made to keep
                its own "more reports" beyond the mockup's single frame. */}
            {(lead.utmSource || lead.utmMedium || lead.utmCampaign) && (
              <dl className="space-y-1 border-t border-primary/10 pt-2 text-xs text-ink-muted">
                {lead.utmSource && (
                  <div>
                    <span className="font-medium text-primary">utm_source:</span> {lead.utmSource}
                  </div>
                )}
                {lead.utmMedium && (
                  <div>
                    <span className="font-medium text-primary">utm_medium:</span> {lead.utmMedium}
                  </div>
                )}
                {lead.utmCampaign && (
                  <div>
                    <span className="font-medium text-primary">utm_campaign:</span> {lead.utmCampaign}
                  </div>
                )}
              </dl>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
