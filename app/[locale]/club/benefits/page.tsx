/**
 * สิทธิ์ของฉัน — the resident's partner benefits as coupons (latest mockup):
 * three stats, a "show your card" row, available / coming-soon tabs
 * (?tab=soon) and ticket cards with a perforated stub.
 */
import Link from "next/link";
import { ChevronRight, Clock, Lock } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getResidentPartners, type PortalPartner } from "@/lib/club/portal";
import { requireResident } from "@/lib/club/portal-actions-helpers";
import CategoryIcon, { categoryLabel } from "@/components/club/CategoryIcon";
import { OfflineNotice, PageTop, PortalNav } from "@/components/club/PortalChrome";
import { formatDate } from "@/components/club/format";
import { focusRing } from "@/components/club/ui";


type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ tab?: string }> };
type T = Awaited<ReturnType<typeof getTranslations>>;

function Ticket({ p, base, locale, t }: { p: PortalPartner; base: string; locale: string; t: T }) {
  const available = Boolean(p.pct);
  const notch = "absolute right-[118px] size-4 rounded-full bg-club-bg";
  return (
    <li className={`relative flex overflow-hidden rounded-[18px] border border-club-line bg-club-surface ${available ? "" : "opacity-80"}`}>
      <div className="min-w-0 flex-1 p-3.5 pr-3">
        <Link href={`${base}/partners/${p.id}`} className={`-m-1 inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-lg p-1 text-[13px] text-club-text ${focusRing}`}>
          <span className="grid size-[22px] shrink-0 place-items-center rounded-full bg-[#1d1d1f] text-champagne-300">
            <CategoryIcon category={p.category} size={11} />
          </span>
          <span className="truncate">{p.name}</span>
          <ChevronRight size={12} className="shrink-0 text-club-text-3" aria-hidden />
        </Link>
        <div className="mt-2.5 flex gap-3">
          <span
            className="grid size-[62px] shrink-0 place-items-center rounded-xl bg-[#111] bg-cover bg-center text-champagne-300"
            style={p.coverImage ? { backgroundImage: `url(${JSON.stringify(p.coverImage)})` } : undefined}
            aria-hidden
          >
            {p.coverImage ? null : <CategoryIcon category={p.category} size={22} />}
          </span>
          <span className="min-w-0">
            <b className={`block text-[14px] leading-snug ${available ? "font-semibold text-club-text" : "font-normal text-club-text-2"}`}>
              {p.label ?? t("benefits.pending")}
            </b>
            <small className="mt-0.5 block truncate text-[11.5px] text-club-text-2">
              {categoryLabel(t, p.category)}
              {p.area ? ` · ${p.area}` : ""}
            </small>
            <em className="mt-0.5 block text-[11px] not-italic text-club-text-3">
              {available ? (p.validTo ? t("benefits.validUntil", { d: formatDate(p.validTo, locale) }) : t("benefits.noExpiry")) : t("benefits.notify")}
            </em>
          </span>
        </div>
      </div>
      {/* perforation: a dashed rule with a half-circle notch top and bottom */}
      <span className="absolute bottom-3 right-[125px] top-3 border-l border-dashed border-club-line" aria-hidden />
      <span className={`${notch} -top-2`} aria-hidden />
      <span className={`${notch} -bottom-2`} aria-hidden />
      <div className="flex w-[126px] shrink-0 flex-col items-center justify-center gap-1 bg-club-stub px-2 py-3 text-center">
        {available ? (
          <>
            <small className="text-[10.5px] text-club-text-3">{t("benefits.discount")}</small>
            <b className="text-[28px] font-medium leading-none tracking-[-0.02em] text-club-accent">{p.pct}%</b>
            <span className="line-clamp-1 text-[11px] text-club-text-2">{p.note || t("benefits.allItems")}</span>
            <Link
              href={`${base}/card`}
              className={`mt-1.5 inline-flex min-h-9 items-center rounded-full bg-champagne-metal px-4 text-[12px] font-semibold text-ink-black [.club-light_&]:bg-none [.club-light_&]:bg-[#1d1d1f] [.club-light_&]:text-white ${focusRing}`}
            >
              {t("benefits.use")}
            </Link>
          </>
        ) : (
          <>
            <Clock size={18} className="text-club-text-3" aria-hidden />
            <span className="text-[11.5px] text-club-text-3">{t("benefits.soon")}</span>
          </>
        )}
      </div>
    </li>
  );
}

export default async function BenefitsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { base, ctx } = await requireResident(locale);
  const [t, partners, sp] = await Promise.all([
    getTranslations({ locale, namespace: "club" }),
    getResidentPartners(ctx.unit.id, ctx.project.id, locale),
    searchParams,
  ]);
  const tab = sp.tab === "soon" ? "soon" : "available";
  const available = partners.filter((p) => p.pct);
  const soon = partners.filter((p) => !p.pct);
  const list = tab === "soon" ? soon : available;

  const stats = [
    { n: available.length, label: t("benefits.available"), href: `${base}/benefits` },
    { n: soon.length, label: t("benefits.soon"), href: `${base}/benefits?tab=soon` },
    { n: partners.length, label: t("benefits.partners"), href: `${base}/partners` },
  ];

  return (
    <>
      <main className="px-4 pb-36">
        <OfflineNotice locale={locale} variant="page" />
        <PageTop title={t("benefits.title")} sub={t("benefits.subtitle")} />

        <div className="grid grid-cols-3 divide-x divide-club-line rounded-[18px] border border-club-line bg-club-surface py-3">
          {stats.map((s) => (
            <Link key={s.label} href={s.href} className={`flex flex-col items-center gap-0.5 px-1 text-center ${focusRing}`}>
              <b className="text-[22px] font-medium tabular-nums text-club-accent">{s.n}</b>
              <span className="text-[11px] leading-tight text-club-text-2">{s.label}</span>
            </Link>
          ))}
        </div>

        <Link href={`${base}/card`} className={`mt-3 flex min-h-16 items-center gap-3 rounded-[18px] border border-club-line bg-club-surface px-3.5 py-3 ${focusRing}`}>
          <span className="bg-black-card relative h-[34px] w-[54px] shrink-0 rounded-md shadow-[inset_0_0_0_0.5px_rgb(217_196_161/0.45)]" aria-hidden>
            <i className="absolute left-[12%] top-[34%] h-[28%] w-[22%] rounded-[2px] bg-[linear-gradient(135deg,#f4e9d4,#c7ab7f_48%,#b89a6c)]" />
          </span>
          <span className="min-w-0 flex-1">
            <b className="block text-[14px] font-semibold text-club-text">{t("benefits.showCard")}</b>
            <small className="block text-[11.5px] text-club-text-2">{t("benefits.showCardSub")}</small>
          </span>
          <ChevronRight size={15} className="text-club-text-3" aria-hidden />
        </Link>

        <nav aria-label={t("benefits.title")} className="mt-5 flex gap-6 border-b border-club-line px-1">
          {(["available", "soon"] as const).map((key) => (
            <Link
              key={key}
              href={key === "soon" ? `${base}/benefits?tab=soon` : `${base}/benefits`}
              aria-current={tab === key ? "page" : undefined}
              className={`-mb-px inline-flex min-h-11 items-center gap-1.5 border-b-2 text-[15px] ${focusRing} ${
                tab === key ? "border-club-text font-semibold text-club-text" : "border-transparent text-club-text-3"
              }`}
            >
              {t(key === "soon" ? "benefits.soon" : "benefits.available")}
              <span className="text-[12px] font-normal text-club-text-3">{key === "soon" ? soon.length : available.length}</span>
            </Link>
          ))}
        </nav>

        {list.length ? (
          <ul className="mt-4 space-y-3">
            {list.map((p) => (
              <Ticket key={p.id} p={p} base={base} locale={locale} t={t} />
            ))}
          </ul>
        ) : (
          <p className="mt-8 text-center text-[13px] text-club-text-3">{t("benefits.empty")}</p>
        )}
        <p className="mt-5 flex items-center justify-center gap-1.5 text-[11.5px] text-club-text-3">
          <Lock size={11} aria-hidden />
          {t("benefits.foot")}
        </p>
      </main>
      <PortalNav locale={locale} base={base} />
    </>
  );
}
