/**
 * One partner: cover, the resident's benefit (with the per-house override
 * already applied by getResidentPartners) and how to reach the venue. A
 * partner this house cannot see is a 404, not a hint that it exists.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight, Globe, Mail, MapPin, Phone, UserRound, type LucideIcon } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getResidentPartners } from "@/lib/club/portal";
import { requireResident } from "@/lib/club/portal-actions-helpers";
import { categoryLabel } from "@/components/club/CategoryIcon";
import PartnerCover from "@/components/club/PartnerCover";
import { OfflineNotice, PortalNav } from "@/components/club/PortalChrome";
import { formatDate } from "@/components/club/format";
import { btnPrimary, focusRing } from "@/components/club/ui";

type Props = { params: Promise<{ locale: string; id: string }> };

function Row({ icon: Icon, label, value, href, external }: { icon: LucideIcon; label: string; value: string; href?: string; external?: boolean }) {
  const body = (
    <>
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-club-surface-2 text-club-text-2">
        <Icon size={16} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <small className="block text-[11px] text-club-text-3">{label}</small>
        <b className="block truncate text-[14px] font-medium text-club-text">{value}</b>
      </span>
      {href ? <ChevronRight size={16} className="text-club-text-3" aria-hidden /> : null}
    </>
  );
  const cls = "flex min-h-14 items-center gap-3 border-b border-club-line px-4 py-2.5 last:border-b-0";
  return href ? (
    <a href={href} className={`${cls} ${focusRing}`} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
      {body}
    </a>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export default async function PartnerPage({ params }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const { base, ctx } = await requireResident(locale);
  const [t, partners] = await Promise.all([
    getTranslations({ locale, namespace: "club" }),
    getResidentPartners(ctx.unit.id, ctx.project.id, locale),
  ]);
  const p = partners.find((x) => x.id === id);
  if (!p) notFound();

  const site = p.website && /^https?:\/\//i.test(p.website) ? p.website : null;
  const web = site?.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  const person = p.contactName && !/^Sales/i.test(p.contactName) ? p.contactName : null;
  const hasContact = p.phones.length || p.emails.length || site || person;

  return (
    <>
      <main className="px-4 pb-36 pt-[calc(env(safe-area-inset-top)+8px)]">
        <OfflineNotice locale={locale} variant="page" />
        <div className="mb-3 flex items-center gap-1">
          <Link href={`${base}/partners`} aria-label={t("common.back")} className={`-ml-2 grid size-11 place-items-center rounded-full text-club-text ${focusRing}`}>
            <ChevronLeft size={20} aria-hidden />
          </Link>
          <p className="text-[16px] font-semibold text-club-text">{t("partners.title")}</p>
        </div>

        <PartnerCover image={p.coverImage} category={p.category} iconSize={30} className="min-h-[200px] w-full rounded-[20px]">
          <span className="absolute inset-x-0 bottom-0 block p-4 text-left text-white">
            <small className="block text-[10.5px] tracking-[0.3em] text-champagne-300">{categoryLabel(t, p.category)}</small>
            <h1 className="mt-1 text-[22px] font-semibold leading-tight">{p.name}</h1>
            {p.area ? (
              <span className="mt-1 flex items-center gap-1 text-[12.5px] text-titanium-200">
                <MapPin size={13} aria-hidden />
                {p.area}
              </span>
            ) : null}
          </span>
        </PartnerCover>

        <section className={`mt-3 rounded-[18px] border px-4 py-3.5 ${p.label ? "border-champagne-300/35 bg-club-stub" : "border-club-line bg-club-surface"}`}>
          <small className="block text-[11.5px] text-club-text-3">{t("partners.residentBenefit")}</small>
          <b className={`mt-0.5 block text-[20px] font-semibold ${p.label ? "text-club-accent" : "text-club-text-2"}`}>{p.label ?? t("partners.pending")}</b>
          {p.label ? <span className="mt-1 block text-[12.5px] text-club-text-2">{t("partners.showToRedeem")}</span> : null}
          {p.label && p.validTo ? <span className="mt-0.5 block text-[12px] text-club-text-3">{t("partners.validUntil", { d: formatDate(p.validTo, locale) })}</span> : null}
        </section>
        {p.label ? (
          <Link href={`${base}/card`} className={`${btnPrimary} mt-3`}>
            {t("partners.showCard")}
          </Link>
        ) : null}

        <h2 className="mb-2 mt-6 px-1 text-[15px] font-semibold text-club-text">{t("partners.contact")}</h2>
        <div className="overflow-hidden rounded-[18px] border border-club-line bg-club-surface">
          {p.phones.map((n) => (
            <Row key={n} icon={Phone} label={t("partners.tel")} value={n} href={`tel:${n.replace(/[^\d+]/g, "")}`} />
          ))}
          {person ? <Row icon={UserRound} label={t("partners.person")} value={person} /> : null}
          {p.emails.map((m) => (
            <Row key={m} icon={Mail} label={t("partners.email")} value={m} href={`mailto:${m}`} />
          ))}
          {site && web ? <Row icon={Globe} label={t("partners.website")} value={web} href={site} external /> : null}
          {hasContact ? null : <p className="px-4 py-4 text-center text-[12.5px] text-club-text-3">{t("partners.noContact")}</p>}
        </div>
      </main>
      <PortalNav locale={locale} base={base} />
    </>
  );
}
