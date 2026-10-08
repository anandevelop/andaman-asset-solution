/**
 * บัตรลูกบ้าน — the card a resident shows at a partner shop. Front: the QR
 * (generated here as SVG, so it works from the offline cache with no JS);
 * back: name, house, card number. The live clock under it is the
 * anti-screenshot tell. Offline, public/club-sw.js serves this page from
 * the device for up to 7 days.
 */
import Link from "next/link";
import QRCode from "qrcode";
import { ChevronRight, Star, Tag } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { cardUrl } from "@/lib/club/constants";
import { cardHost } from "@/lib/club/paths";
import { getResidentPartners, projectName } from "@/lib/club/portal";
import { requireResident } from "@/lib/club/portal-actions-helpers";
import BlackCard, { CardChevrons } from "@/components/club/BlackCard";
import ClubLogo from "@/components/club/ClubLogo";
import FlipCard from "@/components/club/FlipCard";
import LiveClock from "@/components/club/LiveClock";
import { OfflineNotice, PortalNav } from "@/components/club/PortalChrome";
import { formatDayMonthYear, initials, spacedCode, stripHonorific } from "@/components/club/format";
import { focusRing } from "@/components/club/ui";

export default async function CardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { base, ctx, viewer } = await requireResident(locale);
  const [t, partners] = await Promise.all([
    getTranslations({ locale, namespace: "club" }),
    getResidentPartners(ctx.unit.id, ctx.project.id, locale),
  ]);
  const { resident, unit, project, card } = ctx;
  const code = project.cardCode;
  const qr =
    card && code
      ? await QRCode.toString(cardUrl(code, card.token, await cardHost()), { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#111111", light: "#ececec" } })
      : null;
  const best = partners.reduce((max, p) => Math.max(max, p.pct ?? 0), 0);

  const front = (
    <BlackCard chip={false} className="h-full w-full">
      {qr ? (
        <span
          role="img"
          aria-label={t("card.qrAlt")}
          className="absolute right-[5%] top-[7%] block aspect-square w-[34%] overflow-hidden rounded-[2cqw] bg-[#ececec] p-[1cqw] [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
          dangerouslySetInnerHTML={{ __html: qr }}
        />
      ) : null}
    </BlackCard>
  );

  const back = (
    <span className="bg-black-card absolute inset-0 block overflow-hidden rounded-[4.5cqw] text-left shadow-[inset_0_0_0_0.5px_rgb(217_196_161/0.38)] [container-type:inline-size]">
      <CardChevrons />
      <span className="absolute left-[6%] top-[9%] w-[34%]">
        <ClubLogo className="w-full" />
      </span>
      <span className="absolute left-[6%] top-[36%] text-[3.2cqw] tracking-[0.38em] text-champagne-300">{project.nameEn.toUpperCase()}</span>
      <span className="absolute left-[6%] top-[47%] font-mono text-[6.4cqw] tracking-[0.16em] text-titanium-200">{spacedCode(resident.houseCode)}</span>
      <span className="absolute inset-x-[6%] bottom-[9%] flex items-end justify-between gap-3 text-[3cqw] text-titanium-400">
        <span className="min-w-0">
          {t("card.member")}
          <b className="block truncate text-[3.8cqw] font-medium uppercase tracking-[0.08em] text-champagne-100">{stripHonorific(resident.ownerName)}</b>
        </span>
        <span className="shrink-0 text-right">
          {t("card.house")} {unit.unitNumber}
          <b className="block text-[3.8cqw] font-medium text-champagne-100">{t("card.since", { d: formatDayMonthYear(resident.transferDate) })}</b>
        </span>
      </span>
    </span>
  );

  return (
    <>
      <main className="px-4 pb-36 pt-[calc(env(safe-area-inset-top)+12px)]">
        <OfflineNotice locale={locale} variant="card" />
        <div className="mb-4 flex items-center gap-3 px-1">
          <span className="grid size-11 shrink-0 place-items-center rounded-full border border-club-line bg-club-surface text-[13px] text-club-text">
            {initials(viewer.name)}
          </span>
          <span className="min-w-0">
            <h1 className="truncate text-[16px] font-semibold text-club-text">{viewer.name}</h1>
            <small className="block truncate text-[12px] text-club-text-2">
              {projectName(project, locale)} · {unit.unitNumber}
            </small>
          </span>
        </div>

        {qr ? (
          <FlipCard
            front={front}
            back={back}
            termsHref={`${base}/terms`}
            labels={{ tapFront: t("card.tapFront"), tapBack: t("card.tapBack"), terms: t("card.terms") }}
          />
        ) : (
          <>
            <BlackCard label={project.nameEn.toUpperCase()} className="opacity-60" />
            <p role="status" className="mt-3 rounded-2xl border border-club-line bg-club-surface px-4 py-3 text-[13px] text-club-text-2">
              {t("card.noCard")}
            </p>
          </>
        )}
        <p className="mt-3 flex justify-center text-[12px] text-club-text-2">
          <LiveClock locale={locale} label={t("card.live")} />
        </p>

        <h2 className="mb-3 mt-8 flex items-center gap-2 px-1 text-[18px] font-semibold text-club-text">
          <Star size={18} className="text-club-accent" aria-hidden />
          {t("card.privileges")}
        </h2>
        <section className="overflow-hidden rounded-[18px] border border-club-line bg-club-surface" aria-labelledby="club-band">
          <div className="border-l-4 border-champagne-300 bg-club-surface-2 px-4 py-3">
            <b id="club-band" className="block text-[15px] text-club-text">{t("card.band")}</b>
            <small className="text-[10.5px] tracking-[0.18em] text-club-accent">{t("card.bandEn")}</small>
          </div>
          <dl className="text-[13px]">
            {best > 0 ? (
              <div className="flex items-center justify-between gap-3 border-b border-club-line px-4 py-3">
                <dt className="text-club-text">{t("card.partnerDiscount")}</dt>
                <dd className="font-semibold text-club-accent">{t("card.upTo", { n: best })}</dd>
              </div>
            ) : null}
          </dl>
          <Link href={`${base}/partners`} className={`flex min-h-14 items-center gap-3 px-4 py-3 ${focusRing}`}>
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-club-surface-2 text-club-accent">
              <Tag size={17} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <b className="block text-[14px] font-medium text-club-text">{t("card.partnerLink")}</b>
              <small className="block text-[11.5px] text-club-text-2">{t("card.partnerLinkSub", { n: partners.length })}</small>
            </span>
            <ChevronRight size={16} className="text-club-text-3" aria-hidden />
          </Link>
        </section>
      </main>
      <PortalNav locale={locale} base={base} />
    </>
  );
}
