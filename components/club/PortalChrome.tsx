/**
 * components/club/PortalChrome.tsx — server wrappers that load the `club`
 * strings for the client pieces every signed-in page uses: the tab bar,
 * the offline notices and the home-screen help. Pages stay free of label
 * plumbing.
 */
import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import BottomNav from "./BottomNav";
import OfflineBanner from "./OfflineBanner";
import InstallBanner, { InstallHelpTrigger, type InstallLabels } from "./InstallHelp";
import { focusRing } from "./ui";

type Translator = Awaited<ReturnType<typeof getTranslations>>;

export async function PortalNav({ locale, base }: { locale: string; base: string }) {
  const t = await getTranslations({ locale, namespace: "club" });
  return (
    <BottomNav
      base={base}
      labels={{
        home: t("tabs.home"),
        card: t("tabs.card"),
        account: t("tabs.account"),
        menu: t("common.mainMenu"),
      }}
    />
  );
}

export async function OfflineNotice({ locale, variant }: { locale: string; variant: "auth" | "card" | "page" }) {
  const t = await getTranslations({ locale, namespace: "club" });
  return (
    <OfflineBanner
      variant={variant}
      locale={locale}
      labels={{
        title: t("offline.title"),
        sub: t.raw("offline.sub") as string,
        cardOk: t("offline.cardOk"),
        cardOkSub: t("offline.cardOkSub"),
        local: t("offline.local"),
        expired: t("offline.expired"),
        firstNeedsNet: t("common.offlineFirst"),
      }}
    />
  );
}

function installLabels(t: Translator): InstallLabels {
  return {
    title: t("a2hs.title"),
    lead: t("a2hs.lead"),
    how: t("a2hs.how"),
    later: t("a2hs.later"),
    ios: [t("a2hs.ios1"), t("a2hs.ios2"), t("a2hs.ios3")],
    android: [t("a2hs.and1"), t("a2hs.and2"), t("a2hs.and3")],
    lineTip: t("a2hs.lineTip"),
    done: t("a2hs.done"),
    iphone: t("a2hs.iphone"),
    android_: t("a2hs.android"),
    close: t("common.close"),
  };
}

export async function InstallPrompt({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: "club" });
  return <InstallBanner labels={installLabels(t)} />;
}

export async function InstallRow({ locale, className, children }: { locale: string; className?: string; children: ReactNode }) {
  const t = await getTranslations({ locale, namespace: "club" });
  return (
    <InstallHelpTrigger labels={installLabels(t)} className={className}>
      {children}
    </InstallHelpTrigger>
  );
}

/** "‹ กลับ" + page title, for the inner screens. */
export function PageTop({ backHref, backLabel, title, sub }: { backHref?: string; backLabel?: string; title: string; sub?: string }) {
  return (
    <header className="pb-4 pt-[calc(env(safe-area-inset-top)+14px)]">
      {backHref ? (
        <Link href={backHref} className={`-ml-2 mb-2 inline-flex min-h-11 items-center gap-1 rounded-full px-2 text-[13px] text-club-text-2 ${focusRing}`}>
          <ChevronLeft size={16} aria-hidden />
          {backLabel}
        </Link>
      ) : null}
      <h1 className="text-[24px] font-semibold leading-tight tracking-[-0.01em] text-club-text">{title}</h1>
      {sub ? <p className="mt-1 text-[12.5px] leading-snug text-club-text-2">{sub}</p> : null}
    </header>
  );
}
