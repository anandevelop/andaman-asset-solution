/**
 * app/[locale]/admin/(company)/careers/[id]/print/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * One application as a sheet of paper: black on white, A4, saved as a PDF
 * from the print dialog. This is the module's export — a single
 * application for an interviewer, rather than a spreadsheet of everybody.
 *
 * The admin shell hides itself in print ([data-admin-chrome]); the
 * controls here carry print:hidden. Attachments are listed by name only —
 * they are separate files and are opened from the application itself,
 * where each opening is recorded.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { requireCapability } from "@/lib/admin/guard";
import { formatNumber, intlLocale } from "@/lib/format";
import { siteConfig } from "@/config/site";
import { getApplication } from "@/lib/careers/applications";
import PrintButton from "@/components/admin/PrintButton";

type Props = { params: Promise<{ locale: string; id: string }> };

export default async function AdminCareersPrintPage(props: Props) {
  const { locale, id } = await props.params;

  const session = await requireCapability(locale, "manageCareers");
  const t = await getTranslations({ locale, namespace: "admin.careers" });
  const tForm = await getTranslations({ locale, namespace: "careers.form" });

  const application = await getApplication(id);
  if (!application) notFound();

  const dateTime = new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  });
  const name = `${application.firstName} ${application.lastName}`;

  const rows: [string, string][] = [
    [t("detail.position"), application.positionTitle],
    [t("detail.email"), application.email],
    [t("detail.phone"), application.phone],
    [t("detail.education"), tForm(`educationLevels.${application.education}` as never)],
    [t("detail.salary"), t("detail.salaryValue", { amount: formatNumber(locale, application.expectedSalary) })],
    [t("detail.received"), dateTime.format(application.createdAt)],
    [t("detail.status"), t(`status.${application.status}`)],
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/${locale}/admin/careers?open=${application.id}`} className="admin-btn-ghost">
          <ArrowLeft size={15} aria-hidden />
          {t("print.back")}
        </Link>
        <div className="flex items-center gap-3">
          <p className="text-xs text-adm-muted">{t("print.hint")}</p>
          <PrintButton label={t("print.printButton")} />
        </div>
      </div>

      <article
        className="mx-auto max-w-[210mm] bg-white px-[16mm] py-[14mm] text-[#111] shadow-sm print:max-w-none print:p-0 print:shadow-none"
        style={{ colorScheme: "light" }}
      >
        <header className="flex items-end justify-between gap-6 border-b border-[#111] pb-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-[#555]">{siteConfig.name}</p>
            <h1 className="mt-1 text-2xl font-semibold">{t("print.heading")}</h1>
          </div>
          <p className="text-right text-[10px] leading-relaxed text-[#555]">
            {t("print.printedBy", { name: session.name, date: dateTime.format(new Date()) })}
          </p>
        </header>

        <h2 className="mt-7 text-xl font-medium">{name}</h2>

        <dl className="mt-4 border-t border-[#ccc] text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="grid grid-cols-[11rem_1fr] gap-4 border-b border-[#ccc] py-2.5">
              <dt className="text-[#555]">{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>

        <section className="mt-7 break-inside-avoid">
          <h3 className="text-sm font-semibold">{t("print.attachments")}</h3>
          {application.files.length === 0 ? (
            <p className="mt-2 text-sm text-[#555]">{t("detail.noFiles")}</p>
          ) : (
            <ul className="mt-2 list-disc pl-5 text-sm">
              {application.files.map((file) => (
                <li key={file.id}>{file.name}</li>
              ))}
            </ul>
          )}
        </section>

        {application.notes.length > 0 && (
          <section className="mt-7">
            <h3 className="text-sm font-semibold">{t("print.notes")}</h3>
            <ul className="mt-2 space-y-3 text-sm">
              {application.notes.map((note) => (
                <li key={note.id} className="break-inside-avoid border-l-2 border-[#ccc] pl-3">
                  <p className="whitespace-pre-line">{note.body}</p>
                  <p className="mt-0.5 text-[11px] text-[#555]">
                    {note.authorName} · {dateTime.format(note.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className="mt-10 border-t border-[#ccc] pt-3 text-[10px] leading-relaxed text-[#555]">
          <p>
            {t("detail.consentText", {
              date: dateTime.format(application.consentAt),
              version: application.consentVersion,
            })}
          </p>
          <p>{t("print.confidential")}</p>
        </footer>
      </article>
    </div>
  );
}
