/**
 * components/club/HomeScreen.tsx — the signed-in home (mockup "hx"):
 * the black card and three round actions (card, account, contact).
 */
import Link from "next/link";
import { CreditCard, MessageCircle, Moon, Sun, UserRound } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { siteConfig } from "@/config/site";
import { setThemeAction } from "@/app/[locale]/club/actions";
import type { ClubTheme } from "@/lib/club/portal-actions-helpers";
import BlackCard from "./BlackCard";
import ClubLogo from "./ClubLogo";
import { InstallPrompt, OfflineNotice, PortalNav } from "./PortalChrome";
import { bangkokHour, formatMonthYear, initials, lastSegment, stripHonorific } from "./format";
import { focusRing } from "./ui";

type Props = {
  locale: string;
  base: string;
  theme: ClubTheme;
  showInstall: boolean;
  viewerName: string;
  ownerName: string;
  houseCode: string;
  unitNumber: string;
  cardCode: string;
  projectLabel: string;
  projectShort: string;
  since: Date;
};

const round = `grid size-11 place-items-center rounded-full border border-champagne-300/30 bg-[linear-gradient(180deg,rgb(255_255_255/0.03),transparent)] text-champagne-100 transition-colors group-active:bg-white/10 [.club-light_&]:border-black/12 [.club-light_&]:bg-white [.club-light_&]:text-club-text`;

export default async function HomeScreen(p: Props) {
  const t = await getTranslations({ locale: p.locale, namespace: "club" });
  const hour = bangkokHour();
  const greeting = t(hour < 12 ? "home.morning" : hour < 17 ? "home.afternoon" : "home.evening");
  const dark = p.theme !== "light";

  const actions = [
    { href: `${p.base}/card`, icon: CreditCard, label: t("home.actCard") },
    { href: `${p.base}/account`, icon: UserRound, label: t("tabs.account") },
    { href: `tel:${siteConfig.contact.phone.replace(/[^\d+]/g, "")}`, icon: MessageCircle, label: t("home.actContact") },
  ];

  return (
    <>
      <main className="px-[22px] pb-36 pt-[calc(env(safe-area-inset-top)+8px)]">
        <OfflineNotice locale={p.locale} variant="page" />
        <div className="flex h-11 items-center justify-between">
          <ClubLogo className="w-[120px]" tone={dark ? "champagne" : "ink"} label="Andaman Asset Solution" />
          <div className="flex items-center gap-2">
            <form action={setThemeAction}>
              <input type="hidden" name="theme" value={dark ? "light" : "dark"} />
              <button
                type="submit"
                aria-label={t(dark ? "theme.toLight" : "theme.toDark")}
                className={`grid size-11 place-items-center rounded-full text-club-accent ${focusRing}`}
              >
                <span className="grid size-[30px] place-items-center rounded-full border border-club-line">
                  {dark ? <Sun size={15} aria-hidden /> : <Moon size={15} aria-hidden />}
                </span>
              </button>
            </form>
            <Link href={`${p.base}/account`} aria-label={t("tabs.account")} className={`grid size-11 place-items-center rounded-full ${focusRing}`}>
              <span className="grid size-[30px] place-items-center rounded-full border border-champagne-300/40 text-[10.5px] tracking-[0.04em] text-champagne-100 [.club-light_&]:border-black/15 [.club-light_&]:bg-white [.club-light_&]:text-club-text">
                {initials(p.viewerName)}
              </span>
            </Link>
          </div>
        </div>

        <div className="mb-4 mt-4">
          <p className="text-[12px] tracking-[0.02em] text-club-text-3">{greeting}</p>
          <h1 className="mt-0.5 text-[19px] font-medium tracking-[0.005em] text-club-text">{p.viewerName}</h1>
        </div>

        <Link href={`${p.base}/card`} aria-label={t("home.cardAria")} className={`block rounded-[4.5%/7%] transition-transform active:scale-[.985] ${focusRing}`}>
          <BlackCard
            label={p.projectLabel}
            number={`••••  ${lastSegment(p.houseCode)}`}
            name={stripHonorific(p.ownerName)}
            sub={`${p.cardCode} · ${p.unitNumber}`}
          />
        </Link>
        <div className="mx-0.5 mt-3 flex justify-between text-[11px] tracking-[0.06em] text-club-text-3">
          <span>{p.projectShort}</span>
          <span>{t("home.since", { d: formatMonthYear(p.since) })}</span>
        </div>

        <nav aria-label={t("common.mainMenu")} className="mb-6 mt-6 grid grid-cols-3 gap-1.5">
          {actions.map(({ href, icon: Icon, label }) => {
            const cls = `group flex flex-col items-center gap-2 rounded-2xl py-1 text-center text-[11px] leading-tight text-club-text-2 ${focusRing}`;
            const body = (
              <>
                <span className={round}>
                  <Icon size={17} strokeWidth={1.6} aria-hidden />
                </span>
                {label}
              </>
            );
            return href.startsWith("tel:") ? (
              <a key={label} href={href} className={cls}>
                {body}
              </a>
            ) : (
              <Link key={label} href={href} className={cls}>
                {body}
              </Link>
            );
          })}
        </nav>

        {p.showInstall ? <InstallPrompt locale={p.locale} /> : null}

      </main>
      <PortalNav locale={p.locale} base={p.base} />
    </>
  );
}
