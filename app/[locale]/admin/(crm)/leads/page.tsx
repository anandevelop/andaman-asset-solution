/**
 * app/[locale]/admin/leads/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The lead pipeline. Filter and sort live in the URL rather than component
 * state so a sales lead can bookmark "everything still NEW, oldest first"
 * and share that link with the team.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { getTranslations } from "next-intl/server";
import { LeadStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { safeQuery, isDatabaseOffline } from "@/lib/db";
import { requireAdmin } from "@/lib/admin/guard";
import { intlLocale } from "@/lib/format";
import LeadStatusSelect from "@/components/admin/LeadStatusSelect";
import LeadFilters from "@/components/admin/LeadFilters";
import LeadExportButton from "@/components/admin/LeadExportButton";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string; sort?: string }>;
};

const PAGE_SIZE = 100;

function parseStatus(value: string | undefined): LeadStatus | null {
  if (!value || value === "ALL") return null;
  return (Object.values(LeadStatus) as string[]).includes(value)
    ? (value as LeadStatus)
    : null;
}

export default async function AdminLeadsPage(props: Props) {
  const searchParams = await props.searchParams;
  const params = await props.params;

  const {
    locale
  } = params;

  await requireAdmin(locale);

  const t = await getTranslations({ locale, namespace: "admin" });

  const status = parseStatus(searchParams.status);
  const direction: Prisma.SortOrder = searchParams.sort === "oldest" ? "asc" : "desc";

  const leads = await safeQuery(
    "admin:leads",
    () =>
      prisma.leadInquiry.findMany({
        where: status ? { status } : undefined,
        orderBy: { createdAt: direction },
        take: PAGE_SIZE,
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
          createdAt: true,
          project: { select: { slug: true, nameEn: true, nameTh: true } },
        },
      }),
    [],
  );

  const offline = isDatabaseOffline();

  const dateFormat = new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  // The <select> is a client component, so the option labels have to be
  // translated here and handed down as plain data.
  const statusLabels = Object.fromEntries(
    Object.values(LeadStatus).map((value) => [
      value,
      t(`leadStatus.${value}` as never),
    ]),
  ) as Record<LeadStatus, string>;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="admin-section-title">{t("brand")}</p>
          <h1 className="mt-2 text-2xl font-semibold text-primary sm:text-3xl">
            {t("leads.title")}
          </h1>
          <p className="mt-2 text-sm text-ink-muted">{t("leads.subtitle")}</p>
        </div>

        {/* Carries the current status filter, so the file matches the
            table rather than always exporting everything. */}
        <LeadExportButton status={searchParams.status ?? "ALL"} />
      </header>

      <LeadFilters
        locale={locale}
        activeStatus={searchParams.status ?? "ALL"}
        activeSort={direction === "asc" ? "oldest" : "newest"}
        statusLabels={statusLabels}
        labels={{
          status: t("leads.filterStatus"),
          sort: t("leads.sort"),
          all: t("common.all"),
          newest: t("leads.sortNewest"),
          oldest: t("leads.sortOldest"),
        }}
      />

      {offline && (
        <p className="rounded-sm border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t("common.offline")}
        </p>
      )}

      <p className="text-sm text-ink-muted">{t("leads.count", { count: leads.length })}</p>

      {leads.length === 0 ? (
        <div className="admin-card text-center text-sm text-ink-muted">
          {t("leads.empty")}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-sm border border-primary/10 bg-surface-raised shadow-card">
          <table className="w-full min-w-[880px] border-collapse">
            <thead className="border-b border-primary/10 bg-surface-muted">
              <tr>
                <th className="admin-th">{t("leads.name")}</th>
                <th className="admin-th">{t("leads.contact")}</th>
                <th className="admin-th">{t("leads.project")}</th>
                <th className="admin-th">{t("leads.source")}</th>
                <th className="admin-th">{t("leads.received")}</th>
                <th className="admin-th">{t("leads.status")}</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-primary/5">
              {leads.map((lead) => (
                <tr key={lead.id} className="transition-colors hover:bg-surface-muted/60">
                  <td className="admin-td">
                    <p className="font-medium text-primary">{lead.name}</p>
                    {lead.nationality && (
                      <p className="mt-0.5 text-xs text-ink-muted">{lead.nationality}</p>
                    )}
                    {lead.message && (
                      <p className="mt-1 max-w-xs text-xs leading-relaxed text-ink-muted line-clamp-2">
                        {lead.message}
                      </p>
                    )}
                    {!lead.consentGiven && (
                      <p className="mt-1 text-xs font-medium text-red-700">
                        {t("leads.consent")}: {t("common.no")}
                      </p>
                    )}
                  </td>

                  <td className="admin-td whitespace-nowrap">
                    <a
                      href={`mailto:${lead.email}`}
                      className="block text-accent-700 hover:underline"
                    >
                      {lead.email}
                    </a>
                    <a
                      href={`tel:${lead.phone}`}
                      className="mt-0.5 block text-xs text-ink-muted hover:underline"
                    >
                      {lead.phone}
                    </a>
                  </td>

                  <td className="admin-td">
                    {lead.project
                      ? locale === "th"
                        ? lead.project.nameTh
                        : lead.project.nameEn
                      : <span className="text-ink-muted">{t("leads.noProject")}</span>}
                  </td>

                  <td className="admin-td whitespace-nowrap text-ink-muted">
                    {t(`leadSource.${lead.source}` as never)}
                  </td>

                  <td className="admin-td whitespace-nowrap text-ink-muted">
                    <time dateTime={lead.createdAt.toISOString()}>
                      {dateFormat.format(lead.createdAt)}
                    </time>
                  </td>

                  <td className="admin-td">
                    <LeadStatusSelect
                      locale={locale}
                      leadId={lead.id}
                      value={lead.status}
                      labels={statusLabels}
                      errorLabel={t("common.error")}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
