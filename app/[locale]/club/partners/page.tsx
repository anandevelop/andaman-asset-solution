/**
 * ร้านค้าพาร์ทเนอร์ — every partner this house can see (getResidentPartners:
 * active, enabled for the project, in date, not hidden for this unit),
 * grouped by category in horizontal rows. ?cat= narrows to one category.
 */
import Link from "next/link";
import { Globe, Mail, Phone } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PARTNER_CATEGORIES } from "@/lib/club/constants";
import { getResidentPartners, type PortalPartner } from "@/lib/club/portal";
import { requireResident } from "@/lib/club/portal-actions-helpers";
import { categoryLabel } from "@/components/club/CategoryIcon";
import PartnerCover from "@/components/club/PartnerCover";
import { OfflineNotice, PageTop, PortalNav } from "@/components/club/PortalChrome";
import { focusRing } from "@/components/club/ui";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ cat?: string }> };

const iconLink = `grid size-11 place-items-center rounded-full text-club-text-2 hover:bg-club-surface-2 ${focusRing}`;

function telHref(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

function PartnerCard({ p, base, pending }: { p: PortalPartner; base: string; pending: string }) {
  return (
    <li className="w-[46%] shrink-0 snap-start overflow-hidden rounded-[18px] border border-club-line bg-club-surface">
      <Link href={`${base}/partners/${p.id}`} className={`block ${focusRing}`}>
        <PartnerCover image={p.coverImage} category={p.category} className="h-[92px] w-full">
          <span
            className={`absolute left-2 top-2 max-w-[calc(100%-16px)] truncate rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold ${
              p.label ? "bg-champagne-metal text-ink-black" : "bg-black/60 text-titanium-200"
            }`}
          >
            {p.label ?? pending}
          </span>
        </PartnerCover>
        <span className="block px-3 pb-1 pt-2.5">
          <b className="block truncate text-[13.5px] font-semibold text-club-text">{p.name}</b>
          <small className="block truncate text-[11.5px] text-club-text-3">{p.area ?? " "}</small>
        </span>
      </Link>
      <div className="flex px-1 pb-1">
        {p.phones[0] ? (
          <a href={telHref(p.phones[0])} aria-label={`${p.name} · ${p.phones[0]}`} className={iconLink}>
            <Phone size={15} aria-hidden />
          </a>
        ) : null}
        {p.emails[0] ? (
          <a href={`mailto:${p.emails[0]}`} aria-label={`${p.name} · ${p.emails[0]}`} className={iconLink}>
            <Mail size={15} aria-hidden />
          </a>
        ) : null}
        {p.website && /^https?:\/\//i.test(p.website) ? (
          <a href={p.website} target="_blank" rel="noopener noreferrer" aria-label={`${p.name} · ${p.website}`} className={iconLink}>
            <Globe size={15} aria-hidden />
          </a>
        ) : null}
      </div>
    </li>
  );
}

export default async function PartnersPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { base, ctx } = await requireResident(locale);
  const [t, partners, sp] = await Promise.all([
    getTranslations({ locale, namespace: "club" }),
    getResidentPartners(ctx.unit.id, ctx.project.id, locale),
    searchParams,
  ]);
  const present = PARTNER_CATEGORIES.filter((c) => partners.some((p) => p.category === c.key));
  const cat = present.some((c) => c.key === sp.cat) ? sp.cat : "all";
  const shown = present.filter((c) => cat === "all" || c.key === cat);
  const chips = [{ key: "all", label: t("partners.all"), href: `${base}/partners` }, ...present.map((c) => ({ key: c.key, label: categoryLabel(t, c.key), href: `${base}/partners?cat=${c.key}` }))];

  return (
    <>
      <main className="pb-36">
        <div className="px-4">
          <OfflineNotice locale={locale} variant="page" />
          <PageTop title={t("partners.title")} sub={t("partners.subtitle")} />
        </div>
        <nav aria-label={t("partners.title")} className="flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          {chips.map((c) => (
            <Link
              key={c.key}
              href={c.href}
              aria-current={cat === c.key ? "page" : undefined}
              className={`inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-[13px] ${focusRing} ${
                cat === c.key ? "border-club-text bg-club-text text-club-bg" : "border-club-line text-club-text-2"
              }`}
            >
              {c.label}
            </Link>
          ))}
        </nav>

        {shown.length === 0 ? <p className="mt-10 px-4 text-center text-[13px] text-club-text-3">{t("partners.empty")}</p> : null}
        {shown.map((c) => {
          const list = partners.filter((p) => p.category === c.key);
          return (
            <section key={c.key} aria-labelledby={`club-cat-${c.key}`} className="mt-5">
              <h2 id={`club-cat-${c.key}`} className="mb-2 px-[18px] text-[12px] tracking-[0.12em] text-club-text-2">
                {categoryLabel(t, c.key)} <span className="text-club-text-3">{list.length}</span>
              </h2>
              <ul className="flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-1 [scrollbar-width:none]">
                {list.map((p) => (
                  <PartnerCard key={p.id} p={p} base={base} pending={t("partners.pending")} />
                ))}
              </ul>
            </section>
          );
        })}
      </main>
      <PortalNav locale={locale} base={base} />
    </>
  );
}
