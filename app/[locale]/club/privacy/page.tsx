/**
 * Resident privacy notice, RES-PN v1.0 (RESIDENT_NOTICE_VERSION). Public:
 * linked from the login, OTP and account screens.
 */
import { ShieldCheck } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PRIVACY_EMAIL } from "@/lib/club/constants";
import { clubBase } from "@/lib/club/paths";
import { getSession } from "@/lib/club/session";
import { homeHref } from "@/lib/club/portal-actions-helpers";
import { PageTop, PortalNav } from "@/components/club/PortalChrome";
import { linkText } from "@/components/club/ui";

const SECTIONS = ["data", "dont", "retention", "rights"] as const;

/** Turns the privacy address inside a translated paragraph into a mailto link. */
function withMailLink(text: string) {
  const at = text.indexOf(PRIVACY_EMAIL);
  if (at < 0) return text;
  return (
    <>
      {text.slice(0, at)}
      <a href={`mailto:${PRIVACY_EMAIL}`} className={linkText}>
        {PRIVACY_EMAIL}
      </a>
      {text.slice(at + PRIVACY_EMAIL.length)}
    </>
  );
}

export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [base, session, t] = await Promise.all([clubBase(locale), getSession(), getTranslations({ locale, namespace: "club" })]);
  const back = session ? `${base}/account` : homeHref(base);

  return (
    <>
      <main className={`px-6 ${session ? "pb-36" : "pb-12"}`}>
        <PageTop backHref={back} backLabel={t("common.back")} title={t("privacy.title")} sub={t("common.program")} />
        {SECTIONS.map((key) => (
          <section key={key} className="border-b border-club-line py-4">
            <h2 className="text-[15px] font-semibold text-club-text">{t(`privacy.${key}.h`)}</h2>
            <p className="mt-1 text-[13.5px] leading-relaxed text-club-text-2">{withMailLink(t(`privacy.${key}.b`))}</p>
          </section>
        ))}
        <p className="mt-6 flex items-center gap-2 text-[11.5px] text-club-text-3">
          <ShieldCheck size={14} aria-hidden />
          {t("privacy.version")}
        </p>
      </main>
      {session ? <PortalNav locale={locale} base={base} /> : null}
    </>
  );
}
