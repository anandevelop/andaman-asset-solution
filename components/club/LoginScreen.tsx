/**
 * components/club/LoginScreen.tsx — the portal's front door (mockup "lx").
 *
 * There is no in-app scanner: the card's QR is a plain link, so the phone's
 * own camera opens it. "สแกนบัตรของคุณ" therefore explains that instead of
 * asking for camera access. The house code is the fallback.
 */
import Link from "next/link";
import { Camera, Lock, QrCode, ScanLine } from "lucide-react";
import { getTranslations } from "next-intl/server";
import BlackCard from "./BlackCard";
import ClubLogo from "./ClubLogo";
import LanguageMenu from "./LanguageMenu";
import { btnGhost, btnPrimary, eyebrow, focusRing } from "./ui";

const corner = "absolute size-[18px] border-champagne-300 opacity-90 [.club-light_&]:border-club-text";

export default async function LoginScreen({ locale, base }: { locale: string; base: string }) {
  const t = await getTranslations({ locale, namespace: "club" });
  return (
    <main className="bg-club-glow flex min-h-dvh flex-col px-6 pb-[calc(env(safe-area-inset-bottom)+22px)] pt-[calc(env(safe-area-inset-top)+12px)] text-center">
      <div className="flex items-center justify-between text-left">
        <div>
          <ClubLogo className="w-[150px]" label="Andaman Asset Solution" />
          <span className="mt-1.5 block text-[8px] tracking-[0.5em] text-titanium-400">{t("common.program")}</span>
        </div>
        <LanguageMenu locale={locale} base={base} label={t("common.language")} />
      </div>

      <div className="relative mx-auto mb-7 mt-10 aspect-[1.586/1] w-[78%]" aria-hidden>
        <div className="absolute -inset-x-[20%] -inset-y-[30%] bg-[radial-gradient(50%_50%_at_50%_55%,rgb(217_196_161/0.22),transparent_70%)] blur-md [.club-light_&]:bg-[radial-gradient(50%_50%_at_50%_60%,rgb(0_0_0/0.12),transparent_70%)]" />
        <BlackCard label={t("common.program")} className="absolute inset-0">
          <QrCode size={22} className="absolute bottom-[12%] right-[7%] text-champagne-100/75" strokeWidth={1.4} />
        </BlackCard>
        <i className={`${corner} -left-3 -top-3 rounded-tl-md border-l-[1.5px] border-t-[1.5px]`} />
        <i className={`${corner} -right-3 -top-3 rounded-tr-md border-r-[1.5px] border-t-[1.5px]`} />
        <i className={`${corner} -bottom-3 -left-3 rounded-bl-md border-b-[1.5px] border-l-[1.5px]`} />
        <i className={`${corner} -bottom-3 -right-3 rounded-br-md border-b-[1.5px] border-r-[1.5px]`} />
        <span className="animate-club-scan absolute -inset-x-[6%] top-0 h-px bg-[linear-gradient(90deg,transparent,#efe2c8,transparent)] shadow-[0_0_12px_rgb(239_226_200/0.8)] motion-reduce:hidden" />
      </div>

      <p className={eyebrow}>{t("login.eyebrow")}</p>
      <h1 className="mt-2.5 text-[26px] font-normal leading-[1.3] tracking-[0.01em] text-club-text">
        {t("login.title1")}
        <br />
        {t("login.title2")}
      </h1>
      <p className="mx-2 mb-6 mt-2.5 text-[13px] leading-relaxed text-club-text-2">{t("login.lead")}</p>

      <details className="group text-left">
        <summary className={`${btnPrimary} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
          <ScanLine size={16} aria-hidden />
          {t("login.scan")}
        </summary>
        <p className="mt-3 flex items-start gap-2.5 rounded-2xl border border-club-line bg-club-surface px-4 py-3 text-[12.5px] leading-relaxed text-club-text-2">
          <Camera size={16} className="mt-0.5 shrink-0 text-club-accent" aria-hidden />
          {t("login.scanHow")}
        </p>
      </details>
      <Link href={`${base}/code`} className={`${btnGhost} mt-2.5`}>
        {t("login.useCode")}
      </Link>

      <p className="mx-1.5 mt-5 flex items-start justify-center gap-1.5 text-left text-[11px] leading-relaxed text-club-text-3">
        <Lock size={11} className="mt-1 shrink-0" aria-hidden />
        {t("login.note")}
      </p>

      <footer className="mt-auto flex flex-wrap items-center justify-center gap-x-2 pt-6 text-[11px] text-club-text-3">
        <Link href={`${base}/privacy`} className={`inline-flex min-h-11 items-center underline underline-offset-2 ${focusRing}`}>
          {t("common.privacy")}
        </Link>
        <span aria-hidden>·</span>
        <Link href={`${base}/terms`} className={`inline-flex min-h-11 items-center underline underline-offset-2 ${focusRing}`}>
          {t("common.terms")}
        </Link>
        <span aria-hidden>·</span>
        <span>{t("common.copyright")}</span>
      </footer>
    </main>
  );
}
