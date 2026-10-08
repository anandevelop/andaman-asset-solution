/**
 * Card terms and conditions, CT v1.0 (lib/club/constants.ts TERMS_VERSION).
 * Public: linked from the login screen and the back of the card.
 */
import Link from "next/link";
import { FileText } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { clubBase } from "@/lib/club/paths";
import { getSession } from "@/lib/club/session";
import { homeHref } from "@/lib/club/portal-actions-helpers";
import { PageTop, PortalNav } from "@/components/club/PortalChrome";
import { formatDate } from "@/components/club/format";
import { linkText } from "@/components/club/ui";

/** The day CT v1.0 took effect. */
const EFFECTIVE = new Date("2026-11-01T00:00:00+07:00");
const CLAUSES = ["1", "2", "3", "4", "5", "6", "7"] as const;

export default async function TermsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [base, session, t] = await Promise.all([clubBase(locale), getSession(), getTranslations({ locale, namespace: "club" })]);
  const back = session ? `${base}/account` : homeHref(base);

  return (
    <>
      <main className={`px-6 ${session ? "pb-36" : "pb-12"}`}>
        <PageTop backHref={back} backLabel={t("common.back")} title={t("terms.title")} sub={`${t("common.program")} · ${t("terms.effective", { d: formatDate(EFFECTIVE, locale) })}`} />
        <ol className="space-y-0">
          {CLAUSES.map((n) => (
            <li key={n} className="flex gap-3 border-b border-club-line py-4">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-club-surface-2 text-[11.5px] text-club-text-2">{n}</span>
              <div>
                <h2 className="text-[15px] font-semibold text-club-text">{t(`terms.items.${n}.h`)}</h2>
                <p className="mt-1 text-[13.5px] leading-relaxed text-club-text-2">{t(`terms.items.${n}.b`)}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-5">
          <Link href={`${base}/privacy`} className={linkText}>
            {t("common.privacy")} ›
          </Link>
        </p>
        <p className="mt-6 flex items-center gap-2 text-[11.5px] text-club-text-3">
          <FileText size={14} aria-hidden />
          {t("terms.version")}
        </p>
      </main>
      {session ? <PortalNav locale={locale} base={base} /> : null}
    </>
  );
}
