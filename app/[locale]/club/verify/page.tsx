/**
 * OTP verification — reached from a card scan ("I'm a resident") or a house
 * code, both of which leave a signed `club_pending` cookie. Without it
 * there is nothing to verify, so the page explains and links back.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { maskEmail } from "@/lib/contact-mask";
import { householdEmails } from "@/lib/club/otp";
import { clubBase } from "@/lib/club/paths";
import { getSession } from "@/lib/club/session";
import { homeHref, readPendingSignIn } from "@/lib/club/portal-actions-helpers";
import VerifyForm from "@/components/club/VerifyForm";
import { OfflineNotice, PageTop } from "@/components/club/PortalChrome";
import { btnGhost } from "@/components/club/ui";

const RELATIONS = new Set(["owner", "spouse", "child", "family", "manager"]);

export default async function VerifyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const base = await clubBase(locale);
  const t = await getTranslations({ locale, namespace: "club" });
  const pending = await readPendingSignIn();

  if (!pending) {
    if (await getSession()) redirect(homeHref(base));
    return (
      <main className="px-6 pb-10">
        <PageTop backHref={homeHref(base)} backLabel={t("common.back")} title={t("verify.title")} sub={t("verify.noPending")} />
        <Link href={homeHref(base)} className={btnGhost}>
          {t("common.startOver")}
        </Link>
      </main>
    );
  }

  const recipients = (await householdEmails(pending.residentId)).map((r, index) => ({
    index,
    masked: maskEmail(r.email),
    relation: RELATIONS.has(r.relation) ? t(`relation.${r.relation}`) : r.relation,
  }));

  return (
    <main className="px-6 pb-10">
      <PageTop backHref={homeHref(base)} backLabel={t("common.back")} title={t("verify.title")} />
      <OfflineNotice locale={locale} variant="auth" />
      <VerifyForm
        locale={locale}
        recipients={recipients}
        privacyHref={`${base}/privacy`}
        homeHref={homeHref(base)}
        labels={{
          sendTo: t("verify.sendTo"),
          send: t.raw("verify.send") as string,
          sent: t.raw("verify.sent") as string,
          spam: t("verify.spam"),
          noEmailTitle: t("verify.noEmailTitle"),
          noEmailBody: t("verify.noEmailBody"),
          otp: t("verify.otp"),
          privacyNote: t("verify.privacyNote"),
          privacy: t("common.privacy"),
          remember: t("verify.remember"),
          confirm: t("verify.confirm"),
          notReceived: t("verify.notReceived"),
          resend: t("verify.resend"),
          startOver: t("common.startOver"),
          errors: {
            wrong: t.raw("verify.wrong") as string,
            locked: t("verify.locked"),
            expired: t("verify.expired"),
            tooMany: t("verify.tooMany"),
            unknownEmail: t("verify.unknownEmail"),
            format: t("verify.format"),
            noPending: t("verify.noPending"),
            noEmail: t("verify.noEmailTitle"),
          },
        }}
      />
    </main>
  );
}
