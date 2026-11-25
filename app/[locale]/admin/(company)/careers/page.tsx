/**
 * app/[locale]/admin/(company)/careers/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Job applications: the list, and one application in a drawer.
 *
 * Everything is in the URL — ?status, ?q, ?position, ?open — so the link
 * in HR's email and LINE notice (?open=<id>) lands on the application, and
 * a filtered list survives a reload or being sent to a colleague.
 *
 * Opening an application marks it read, which is what clears it from the
 * menu's badge. Opening an attachment goes through
 * /api/admin/careers/files/[id], which records who opened it.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { BriefcaseBusiness, FileText, Mail, Paperclip, Phone, Printer, Search } from "lucide-react";
import { JobApplicationStatus } from "@prisma/client";
import { requireCapability } from "@/lib/admin/guard";
import { zoneEyebrow } from "@/lib/admin/nav";
import { safeQuery, isDatabaseOffline } from "@/lib/db";
import { formatNumber, intlLocale } from "@/lib/format";
import { countByStatus, getApplication, listApplications, markViewed } from "@/lib/careers/applications";
import { listPositions } from "@/lib/careers/positions";
import { APPLICATION_STATUSES, type ApplicationStatus } from "@/lib/careers/fields";
import AdminPageHeader from "@/components/admin/ui/AdminPageHeader";
import AdminDrawer from "@/components/admin/ui/AdminDrawer";
import StatusPill, { type PillTone } from "@/components/admin/ui/StatusPill";
import PageTabs from "@/components/admin/PageTabs";
import DeleteUserForm from "@/components/admin/DeleteUserForm";
import { addApplicationNoteAction, eraseApplicationAction, setApplicationStatusAction } from "./actions";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string; q?: string; position?: string; open?: string }>;
};

const TONE: Record<ApplicationStatus, PillTone> = {
  NEW: "info",
  REVIEWING: "warning",
  INTERVIEW: "accent",
  HIRED: "success",
  REJECTED: "neutral",
};

const EMPTY_COUNTS = Object.fromEntries(APPLICATION_STATUSES.map((status) => [status, 0])) as Record<
  JobApplicationStatus,
  number
>;

export default async function AdminCareersPage(props: Props) {
  const { locale } = await props.params;
  const searchParams = await props.searchParams;

  const session = await requireCapability(locale, "manageCareers");
  const t = await getTranslations({ locale, namespace: "admin" });
  const tForm = await getTranslations({ locale, namespace: "careers.form" });

  const status = (APPLICATION_STATUSES as readonly string[]).includes(searchParams.status ?? "")
    ? (searchParams.status as JobApplicationStatus)
    : undefined;
  const q = (searchParams.q ?? "").trim().slice(0, 80);
  const positionId = searchParams.position || undefined;

  const [rows, counts, positions] = await Promise.all([
    safeQuery("admin:careers:list", () => listApplications({ status, q, positionId }), []),
    safeQuery("admin:careers:counts", () => countByStatus(), EMPTY_COUNTS),
    safeQuery("admin:careers:positions", () => listPositions(), []),
  ]);

  const open = searchParams.open
    ? await safeQuery("admin:careers:open", () => getApplication(searchParams.open as string), null)
    : null;
  if (open && !open.viewedAt) await markViewed(open.id).catch(() => {});

  const base = `/${locale}/admin/careers`;
  /* The list's own address without ?open — what the drawer closes to and
     what every action returns to. */
  const listQuery = new URLSearchParams();
  if (status) listQuery.set("status", status);
  if (q) listQuery.set("q", q);
  if (positionId) listQuery.set("position", positionId);
  const withQuery = (extra: Record<string, string | undefined>) => {
    const query = new URLSearchParams(listQuery);
    for (const [key, value] of Object.entries(extra)) {
      if (value) query.set(key, value);
      else query.delete(key);
    }
    const qs = query.toString();
    return qs ? `${base}?${qs}` : base;
  };

  const dateTime = new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  });
  const dateOnly = new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium", timeZone: "Asia/Bangkok" });
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const positionTitle = (position: (typeof positions)[number]) =>
    position.translations[locale as keyof typeof position.translations]?.title ||
    position.translations.en?.title ||
    position.translations.th?.title ||
    t("careers.positions.noTitle");

  const chip = (active: boolean) =>
    `inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ${
      active
        ? "border-adm-text bg-adm-text/6 font-medium text-adm-text"
        : "border-adm-line-strong text-adm-muted hover:text-adm-text"
    }`;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow={zoneEyebrow((key) => t(key as never), "careers")}
        title={t("careers.title")}
        description={t("careers.subtitle")}
      />

      <PageTabs locale={locale} role={session.role} groupKey="careers" />

      {isDatabaseOffline() && (
        <p className="rounded-xs border border-adm-warning/30 bg-adm-warning-bg px-4 py-3 text-sm text-adm-warning">
          {t("common.offline")}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label={t("careers.filters.label")} className="flex flex-wrap gap-2">
          <Link href={withQuery({ status: undefined })} aria-current={!status ? "page" : undefined} className={chip(!status)}>
            {t("careers.filters.all")}
            <span className="admin-mono text-adm-muted">{total}</span>
          </Link>
          {APPLICATION_STATUSES.map((value) => (
            <Link
              key={value}
              href={withQuery({ status: value })}
              aria-current={status === value ? "page" : undefined}
              className={chip(status === value)}
            >
              {t(`careers.status.${value}`)}
              <span className="admin-mono text-adm-muted">{counts[value]}</span>
            </Link>
          ))}
        </nav>

        <form action={base} className="flex flex-wrap items-center gap-2">
          {status && <input type="hidden" name="status" value={status} />}
          <select
            name="position"
            defaultValue={positionId ?? ""}
            aria-label={t("careers.table.position")}
            className="admin-input w-auto!"
          >
            <option value="">{t("careers.filters.allPositions")}</option>
            {positions.map((position) => (
              <option key={position.id} value={position.id}>
                {positionTitle(position)}
              </option>
            ))}
          </select>
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder={t("careers.filters.search")}
            aria-label={t("careers.filters.search")}
            className="admin-input w-64!"
          />
          <button type="submit" className="admin-btn-ghost">
            <Search size={15} aria-hidden />
            {t("careers.filters.apply")}
          </button>
        </form>
      </div>

      <section className="admin-card overflow-x-auto p-0!">
        {rows.length === 0 ? (
          <p className="flex items-center gap-2 px-5 py-10 text-sm text-adm-muted">
            <BriefcaseBusiness size={16} aria-hidden />
            {status || q || positionId ? t("careers.table.emptyFiltered") : t("careers.table.empty")}
          </p>
        ) : (
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-adm-line text-left">
                <th className="admin-th">{t("careers.table.applicant")}</th>
                <th className="admin-th">{t("careers.table.position")}</th>
                <th className="admin-th">{t("careers.table.education")}</th>
                <th className="admin-th text-right">{t("careers.table.salary")}</th>
                <th className="admin-th">{t("careers.table.files")}</th>
                <th className="admin-th">{t("careers.table.received")}</th>
                <th className="admin-th">{t("careers.table.status")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const name = `${row.firstName} ${row.lastName}`;
                const unread = !row.viewedAt;
                return (
                  <tr key={row.id} className="border-b border-adm-line last:border-b-0 hover:bg-adm-text/3">
                    <td className="admin-td">
                      <Link
                        href={withQuery({ open: row.id })}
                        scroll={false}
                        aria-label={t("careers.table.open", { name })}
                        className={`flex items-center gap-2 text-adm-text hover:underline ${unread ? "font-semibold" : ""}`}
                      >
                        {unread && (
                          <span
                            title={t("careers.table.unread")}
                            className="h-2 w-2 shrink-0 rounded-full bg-adm-status-info"
                          >
                            <span className="sr-only">{t("careers.table.unread")}</span>
                          </span>
                        )}
                        {name}
                      </Link>
                      <span className="block text-xs text-adm-muted">{row.email}</span>
                    </td>
                    <td className="admin-td">{row.positionTitle}</td>
                    <td className="admin-td text-adm-muted">{tForm(`educationLevels.${row.education}` as never)}</td>
                    <td className="admin-td admin-mono text-right">{formatNumber(locale, row.expectedSalary)}</td>
                    <td className="admin-td text-adm-muted">
                      {row._count.files > 0 ? (
                        <span className="inline-flex items-center gap-1">
                          <Paperclip size={13} aria-hidden />
                          {row._count.files}
                        </span>
                      ) : (
                        t("common.none")
                      )}
                    </td>
                    <td className="admin-td whitespace-nowrap text-adm-muted">{dateOnly.format(row.createdAt)}</td>
                    <td className="admin-td">
                      <StatusPill tone={TONE[row.status]} label={t(`careers.status.${row.status}`)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {searchParams.open && (
        <AdminDrawer
          title={open ? `${open.firstName} ${open.lastName}` : t("careers.detail.title")}
          icon={<BriefcaseBusiness size={16} aria-hidden />}
          closeHref={withQuery({})}
          closeLabel={t("careers.detail.close")}
        >
          {!open ? (
            <p className="text-sm text-adm-muted">{t("careers.detail.notFound")}</p>
          ) : (
            <div className="space-y-7 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <StatusPill tone={TONE[open.status]} label={t(`careers.status.${open.status}`)} />
                <Link href={`${base}/${open.id}/print`} className="admin-btn-ghost admin-btn-sm">
                  <Printer size={14} aria-hidden />
                  {t("careers.detail.print")}
                </Link>
              </div>

              <section>
                <h3 className="admin-section-title">{t("careers.detail.contact")}</h3>
                <dl className="mt-3 grid grid-cols-[9rem_1fr] gap-x-4 gap-y-2.5">
                  <dt className="text-adm-muted">{t("careers.detail.position")}</dt>
                  <dd className="font-medium text-adm-text">{open.positionTitle}</dd>
                  <dt className="text-adm-muted">{t("careers.detail.email")}</dt>
                  <dd>
                    <a href={`mailto:${open.email}`} className="inline-flex items-center gap-1.5 text-adm-text hover:underline">
                      <Mail size={13} aria-hidden />
                      {open.email}
                    </a>
                  </dd>
                  <dt className="text-adm-muted">{t("careers.detail.phone")}</dt>
                  <dd>
                    <a href={`tel:${open.phone}`} className="inline-flex items-center gap-1.5 text-adm-text hover:underline">
                      <Phone size={13} aria-hidden />
                      {open.phone}
                    </a>
                  </dd>
                  <dt className="text-adm-muted">{t("careers.detail.education")}</dt>
                  <dd>{tForm(`educationLevels.${open.education}` as never)}</dd>
                  <dt className="text-adm-muted">{t("careers.detail.salary")}</dt>
                  <dd>{t("careers.detail.salaryValue", { amount: formatNumber(locale, open.expectedSalary) })}</dd>
                  <dt className="text-adm-muted">{t("careers.detail.received")}</dt>
                  <dd>{dateTime.format(open.createdAt)}</dd>
                  <dt className="text-adm-muted">{t("careers.detail.language")}</dt>
                  <dd className="uppercase">{open.locale}</dd>
                </dl>
              </section>

              <section>
                <h3 className="admin-section-title">{t("careers.detail.files")}</h3>
                {open.files.length === 0 ? (
                  <p className="mt-3 text-adm-muted">{t("careers.detail.noFiles")}</p>
                ) : (
                  <>
                    <ul className="mt-3 space-y-2">
                      {open.files.map((file) => (
                        <li key={file.id}>
                          <a
                            href={`/api/admin/careers/files/${file.id}`}
                            target="_blank"
                            rel="noopener"
                            className="flex items-center gap-2.5 rounded-xs border border-adm-line-strong px-3 py-2 text-adm-text hover:bg-adm-text/3"
                          >
                            <FileText size={15} aria-hidden className="shrink-0" />
                            <span className="min-w-0 flex-1 truncate">{file.name}</span>
                            <span className="admin-mono shrink-0 text-xs text-adm-muted">
                              {(file.size / 1024 / 1024).toFixed(1)} MB
                            </span>
                          </a>
                        </li>
                      ))}
                    </ul>
                    <p className="admin-hint">{t("careers.detail.fileNote")}</p>
                  </>
                )}
              </section>

              <section>
                <h3 className="admin-section-title">{t("careers.detail.status")}</h3>
                <form
                  action={setApplicationStatusAction.bind(null, locale, open.id)}
                  className="mt-3 flex flex-wrap items-center gap-2"
                >
                  <input type="hidden" name="return" value={listQuery.toString()} />
                  <select
                    name="status"
                    defaultValue={open.status}
                    aria-label={t("careers.detail.status")}
                    className="admin-input w-auto!"
                  >
                    {APPLICATION_STATUSES.map((value) => (
                      <option key={value} value={value}>
                        {t(`careers.status.${value}`)}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className="admin-btn-ghost">
                    {t("careers.detail.saveStatus")}
                  </button>
                </form>
              </section>

              <section>
                <h3 className="admin-section-title">{t("careers.detail.notes")}</h3>
                <p className="admin-hint">{t("careers.detail.notesHint")}</p>
                <form action={addApplicationNoteAction.bind(null, locale, open.id)} className="mt-3 space-y-2">
                  <input type="hidden" name="return" value={listQuery.toString()} />
                  <textarea
                    name="body"
                    required
                    maxLength={2000}
                    rows={3}
                    aria-label={t("careers.detail.notes")}
                    placeholder={t("careers.detail.notePlaceholder")}
                    className="admin-textarea"
                  />
                  <button type="submit" className="admin-btn-ghost admin-btn-sm">
                    {t("careers.detail.addNote")}
                  </button>
                </form>
                {open.notes.length === 0 ? (
                  <p className="mt-4 text-adm-muted">{t("careers.detail.noNotes")}</p>
                ) : (
                  <ul className="mt-4 space-y-3">
                    {open.notes.map((note) => (
                      <li key={note.id} className="border-l-2 border-adm-line-strong pl-3">
                        <p className="whitespace-pre-line text-adm-text">{note.body}</p>
                        <p className="mt-1 text-xs text-adm-muted">
                          {note.authorName} · {dateTime.format(note.createdAt)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <h3 className="admin-section-title">{t("careers.detail.privacy")}</h3>
                <ul className="mt-3 space-y-1.5 text-adm-muted">
                  <li>
                    {t("careers.detail.consentText", {
                      date: dateTime.format(open.consentAt),
                      version: open.consentVersion,
                    })}
                  </li>
                  <li>{t("careers.detail.retention", { date: dateOnly.format(open.purgeAfter) })}</li>
                  <li className={open.emailError ? "text-adm-danger" : undefined}>
                    {open.emailSentAt
                      ? t("careers.detail.emailSent", { date: dateTime.format(open.emailSentAt) })
                      : open.emailError
                        ? t("careers.detail.emailFailed", { error: open.emailError })
                        : t("careers.detail.emailPending")}
                  </li>
                </ul>

                <div className="mt-5 border-t border-adm-line pt-4">
                  <DeleteUserForm
                    action={eraseApplicationAction.bind(null, locale, open.id, listQuery.toString())}
                    label={t("careers.detail.erase")}
                    confirmLabel={t("careers.detail.eraseConfirm", { name: `${open.firstName} ${open.lastName}` })}
                  />
                  <p className="admin-hint">{t("careers.detail.eraseHint")}</p>
                </div>
              </section>
            </div>
          )}
        </AdminDrawer>
      )}
    </div>
  );
}
