/**
 * บัญชีของฉัน — profile (masked contact details), theme, language, the
 * household (owner + up to two members), home-screen help, legal links and
 * sign-out (which also forgets this device).
 */
import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight, FileText, House, Languages, Mail, Monitor, Moon, Plus, ShieldCheck, Smartphone, Sun, UserRound, Users } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { maskEmail, maskPhone } from "@/lib/contact-mask";
import { MAX_HOUSEHOLD_MEMBERS, MEMBER_RELATIONS } from "@/lib/club/constants";
import { projectName } from "@/lib/club/portal";
import { readTheme, requireResident } from "@/lib/club/portal-actions-helpers";
import { setThemeAction, signOutAction } from "@/app/[locale]/club/actions";
import { AddMemberForm, RemoveMemberButton } from "@/components/club/Household";
import LanguageMenu from "@/components/club/LanguageMenu";
import { InstallRow, OfflineNotice, PageTop, PortalNav } from "@/components/club/PortalChrome";
import { btnSecondary, focusRing } from "@/components/club/ui";

const card = "rounded-[18px] border border-club-line bg-club-surface px-4";
const row = "flex min-h-12 items-center gap-3 border-b border-club-line py-2.5 text-[14px] text-club-text last:border-b-0";

function InfoRow({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className={row}>
      <span className="text-club-text-2">{icon}</span>
      <span className="shrink-0">{label}</span>
      <span className="ml-auto min-w-0 truncate text-right text-[13px] text-club-text-2">{value}</span>
    </div>
  );
}

export default async function AccountPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { base, ctx, session, viewer } = await requireResident(locale);
  const [t, theme] = await Promise.all([getTranslations({ locale, namespace: "club" }), readTheme()]);
  const { resident, unit, project } = ctx;
  const isOwner = session.memberId === null;
  const relationLabel = (r: string) => ((MEMBER_RELATIONS as readonly string[]).includes(r) ? t(`relation.${r}`) : r);
  const themes = [
    { key: "light", icon: <Sun size={14} aria-hidden />, label: t("theme.light") },
    { key: "dark", icon: <Moon size={14} aria-hidden />, label: t("theme.dark") },
    { key: "auto", icon: <Monitor size={14} aria-hidden />, label: t("theme.auto") },
  ] as const;
  const linkRow = `${row} ${focusRing}`;

  return (
    <>
      <main className="px-4 pb-36">
        <OfflineNotice locale={locale} variant="page" />
        <PageTop title={t("account.title")} />

        <section className={card}>
          <InfoRow icon={<UserRound size={18} aria-hidden />} label={t("account.profile")} value={viewer.name} />
          <InfoRow icon={<House size={18} aria-hidden />} label={t("account.home")} value={`${projectName(project, locale)} · ${unit.unitNumber}`} />
          <InfoRow icon={<Smartphone size={18} aria-hidden />} label={t("account.phone")} value={maskPhone(resident.phone)} />
          <InfoRow icon={<Mail size={18} aria-hidden />} label={t("account.email")} value={viewer.email ? maskEmail(viewer.email) : "—"} />

          <div className="border-b border-club-line py-3">
            <div className="flex items-center gap-3 text-[14px] text-club-text">
              <span className="text-club-text-2">{theme === "light" ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />}</span>
              <span id="club-theme-label">{t("theme.label")}</span>
            </div>
            <form action={setThemeAction} role="group" aria-labelledby="club-theme-label" className="mt-2.5 grid grid-cols-3 gap-1 rounded-full bg-club-surface-2 p-1">
              {themes.map((x) => (
                <button
                  key={x.key}
                  type="submit"
                  name="theme"
                  value={x.key}
                  aria-pressed={theme === x.key}
                  className={`flex min-h-10 items-center justify-center gap-1.5 rounded-full text-[12.5px] ${focusRing} ${
                    theme === x.key ? "bg-club-surface font-semibold text-club-text shadow-sm" : "text-club-text-2"
                  }`}
                >
                  {x.icon}
                  {x.label}
                </button>
              ))}
            </form>
          </div>

          <div className="py-3">
            <div className="mb-2.5 flex items-center gap-3 text-[14px] text-club-text">
              <span className="text-club-text-2">
                <Languages size={18} aria-hidden />
              </span>
              {t("common.language")}
            </div>
            <LanguageMenu locale={locale} base={base} label={t("common.language")} variant="row" />
          </div>
        </section>

        <h2 className="mb-2 mt-6 px-1 text-[13px] font-semibold text-club-text-2">{t("account.household")}</h2>
        <section className={card}>
          <div className={row}>
            <UserRound size={18} className="text-club-text-2" aria-hidden />
            <span className="min-w-0 flex-1">
              <b className="block truncate font-medium">{resident.ownerName}</b>
              <small className="block truncate text-[12px] text-club-text-3">
                {t("relation.owner")}
                {resident.email ? ` · ${maskEmail(resident.email)}` : ""}
              </small>
            </span>
          </div>
          {resident.members.map((m) => (
            <div key={m.id} className={row}>
              <Users size={18} className="text-club-text-2" aria-hidden />
              <span className="min-w-0 flex-1">
                <b className="block truncate font-medium">{m.name}</b>
                <small className="block truncate text-[12px] text-club-text-3">
                  {relationLabel(m.relation)} · {maskEmail(m.email)}
                </small>
              </span>
              {isOwner ? (
                <RemoveMemberButton memberId={m.id} label={t("account.remove")} confirmText={t("account.removeConfirm", { name: m.name })} />
              ) : null}
            </div>
          ))}
          {isOwner ? (
            <AddMemberForm
              locale={locale}
              remaining={MAX_HOUSEHOLD_MEMBERS - resident.members.length}
              labels={{
                add: t("account.add"),
                more: t.raw("account.more") as string,
                name: t("account.name"),
                relation: t("account.relation"),
                email: t("account.emailLabel"),
                save: t("account.save"),
                cancel: t("account.cancel"),
                added: t("account.added"),
                relations: Object.fromEntries(MEMBER_RELATIONS.map((r) => [r, t(`relation.${r}`)])),
                errors: {
                  invalid: t("account.invalid"),
                  duplicate: t("account.duplicate"),
                  full: t("account.full"),
                  ownerOnly: t("account.ownerOnly"),
                },
              }}
            />
          ) : (
            <p className="py-3 text-[12px] text-club-text-3">{t("account.ownerOnly")}</p>
          )}
        </section>
        <p className="mt-2 px-1 text-[11.5px] leading-snug text-club-text-3">{t("account.householdNote")}</p>

        <section className={`${card} mt-5`}>
          <InstallRow locale={locale} className={`${linkRow} w-full text-left`}>
            <Plus size={18} className="text-club-text-2" aria-hidden />
            <span className="flex-1">{t("account.addToHome")}</span>
            <ChevronRight size={16} className="text-club-text-3" aria-hidden />
          </InstallRow>
          <Link href={`${base}/privacy`} className={linkRow}>
            <ShieldCheck size={18} className="text-club-text-2" aria-hidden />
            <span className="flex-1">{t("common.privacy")}</span>
            <ChevronRight size={16} className="text-club-text-3" aria-hidden />
          </Link>
          <Link href={`${base}/terms`} className={linkRow}>
            <FileText size={18} className="text-club-text-2" aria-hidden />
            <span className="flex-1">{t("common.terms")}</span>
            <ChevronRight size={16} className="text-club-text-3" aria-hidden />
          </Link>
        </section>

        <form action={signOutAction} className="mt-5">
          <input type="hidden" name="locale" value={locale} />
          <button type="submit" className={btnSecondary}>
            {t("account.signOut")}
          </button>
        </form>
      </main>
      <PortalNav locale={locale} base={base} />
    </>
  );
}
