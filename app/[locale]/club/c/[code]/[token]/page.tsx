/**
 * Card scan landing (mockup "vx") — what a partner shop, or the resident,
 * sees after pointing a camera at the card's QR.
 *
 *  • unknown token, wrong project code, legacy /r/ link → "revoked" (an
 *    unknown card and a dead one must look the same from outside);
 *  • revoked card → red VOID, logged as SCAN_REVOKED;
 *  • active card on a phone already trusted for this house → TRUSTED_LOGIN
 *    and straight into the portal;
 *  • otherwise → logged SCAN, green ACTIVE for the shop, and "I'm a
 *    resident" for the owner, which moves the sign-in into a cookie and
 *    drops the token from the URL (claimScanAction).
 * No personal data is shown on this page.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, Check, ChevronLeft, Mail, ShieldCheck, X } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { findCardByToken, logCardEvent } from "@/lib/club/cards";
import { clubBase, requestIp, requestUserAgent } from "@/lib/club/paths";
import { deviceLabel, getSession } from "@/lib/club/session";
import { homeHref } from "@/lib/club/portal-actions-helpers";
import { claimScanAction } from "@/app/[locale]/club/actions";
import BlackCard from "@/components/club/BlackCard";
import ClubLogo from "@/components/club/ClubLogo";
import LiveClock from "@/components/club/LiveClock";
import { btnGhost, btnPrimary, eyebrow, focusRing } from "@/components/club/ui";

type Params = { locale: string; code: string; token: string };

export default async function CardStatusPage({ params }: { params: Promise<Params> }) {
  const { locale, code, token } = await params;
  setRequestLocale(locale);
  const base = await clubBase(locale);
  const card = code === "r" ? null : await findCardByToken(code, token);
  const extra = { device: deviceLabel(await requestUserAgent()), ip: await requestIp() };

  if (card && !card.revokedAt) {
    const session = await getSession();
    if (session?.residentId === card.residentId) {
      await logCardEvent(card.residentId, "TRUSTED_LOGIN", "resident", extra);
      redirect(homeHref(base));
    }
    await logCardEvent(card.residentId, "SCAN", "scan", extra);
  } else if (card) {
    await logCardEvent(card.residentId, "SCAN_REVOKED", "scan", extra);
  }

  const ok = Boolean(card && !card.revokedAt);
  const t = await getTranslations({ locale, namespace: "club" });
  const tone = ok ? "text-verify-ok border-verify-ok/40 bg-verify-ok/10" : "text-verify-bad border-verify-bad/45 bg-verify-bad/10";

  return (
    <main className="bg-club-glow flex min-h-dvh flex-col px-6 pb-[calc(env(safe-area-inset-bottom)+26px)] pt-[calc(env(safe-area-inset-top)+6px)] text-center">
      <div className="flex h-12 items-center justify-between">
        <Link href={homeHref(base)} aria-label={t("common.back")} className={`grid size-11 place-items-center rounded-full ${focusRing}`}>
          <span className="grid size-7 place-items-center rounded-full border border-champagne-300/35 text-champagne-300 [.club-light_&]:border-club-line [.club-light_&]:text-club-text">
            <ChevronLeft size={15} aria-hidden />
          </span>
        </Link>
        <ClubLogo className="w-[118px]" tone="champagne" />
        <span className="w-11" aria-hidden />
      </div>

      <div className="relative mx-auto mb-9 mt-8 w-[70%]">
        <BlackCard label={card ? card.resident.unit.project.nameEn.toUpperCase() : undefined} className={ok ? "" : "brightness-75 grayscale"}>
          {ok ? null : (
            <span className="absolute inset-0 grid -rotate-12 place-items-center text-[8cqw] font-light tracking-[0.6em] text-verify-bad/75">VOID</span>
          )}
        </BlackCard>
        <span className="absolute -bottom-[18px] -right-4 grid size-[62px] place-items-center" aria-hidden>
          <i className={`animate-club-ring absolute inset-0 rounded-full border ${ok ? "border-champagne-300/60" : "border-verify-bad/60"} motion-reduce:hidden`} />
          <span
            className={`relative grid size-[46px] place-items-center rounded-full shadow-[0_8px_20px_-6px_rgb(0_0_0/0.8),0_0_0_3px_var(--club-bg)] ${
              ok ? "bg-[linear-gradient(135deg,#f4e9d4,#d9c4a1_50%,#a88d64)] text-ink-black" : "bg-[linear-gradient(135deg,#ffb3aa,#e2574b)] text-white"
            }`}
          >
            {ok ? <Check size={22} /> : <X size={22} />}
          </span>
        </span>
      </div>

      <p className={eyebrow}>{t("status.eyebrow")}</p>
      <h1 className="mb-3.5 mt-2.5 text-[22px] font-normal leading-snug tracking-[0.01em] text-club-text">{t(ok ? "status.titleOk" : "status.titleBad")}</h1>
      <p className={`mx-auto inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[11.5px] font-medium tracking-[0.14em] ${tone}`} role="status">
        <i className={`size-1.5 rounded-full ${ok ? "animate-club-pulse bg-verify-ok" : "bg-verify-bad"}`} aria-hidden />
        {ok ? "ACTIVE" : "REVOKED"} · {t(ok ? "status.active" : "status.revoked")}
      </p>

      <dl className="mt-6 border-t border-champagne-300/20 text-[12.5px] [.club-light_&]:border-club-line">
        {ok && card ? (
          <div className="flex justify-between border-b border-club-line px-0.5 py-3">
            <dt className="text-club-text-3">{t("status.cardNo")}</dt>
            <dd className="font-mono tabular-nums text-club-text">{String(card.version).padStart(2, "0")}</dd>
          </div>
        ) : null}
        <div className="flex justify-between border-b border-club-line px-0.5 py-3">
          <dt className="text-club-text-3">{t("status.checkedAt")}</dt>
          <dd className="text-club-text">
            <LiveClock locale={locale} pulse={false} />
          </dd>
        </div>
      </dl>

      <p
        className={`mt-4 flex items-start gap-2 rounded-xl border px-3 py-2.5 text-left text-[11.5px] leading-relaxed text-club-text-2 ${
          ok ? "border-champagne-300/25 bg-champagne-300/5" : "border-verify-bad/25 bg-verify-bad/5"
        }`}
      >
        {ok ? <ShieldCheck size={14} className="mt-0.5 shrink-0 text-club-accent" aria-hidden /> : <AlertTriangle size={14} className="mt-0.5 shrink-0 text-verify-bad" aria-hidden />}
        {t(ok ? "status.noteOk" : "status.noteBad")}
      </p>

      <div className="mt-auto pt-7">
        {ok ? (
          <form action={claimScanAction}>
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="code" value={code} />
            <input type="hidden" name="token" value={token} />
            <p className="mb-2 flex items-center gap-2.5 text-[12.5px] text-champagne-100 before:h-px before:flex-1 before:bg-champagne-300/25 after:h-px after:flex-1 after:bg-champagne-300/25 [.club-light_&]:text-club-text">
              {t("status.residentQ")}
            </p>
            <p className="mx-1.5 mb-4 text-[12px] leading-relaxed text-club-text-3">{t("status.residentLead")}</p>
            <button type="submit" className={btnPrimary}>
              <Mail size={16} aria-hidden />
              {t("status.residentCta")}
            </button>
          </form>
        ) : (
          <>
            <p className="mx-1.5 mb-4 text-[12px] leading-relaxed text-club-text-3">{t("status.revokedLead")}</p>
            <Link href={homeHref(base)} className={btnGhost}>
              {t("common.back")}
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
