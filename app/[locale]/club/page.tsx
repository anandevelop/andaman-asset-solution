/**
 * The portal's home: the sign-in screen for a visitor, the member home for
 * a signed-in resident (session cookie or a remembered device).
 */
import { setRequestLocale } from "next-intl/server";
import { getSession } from "@/lib/club/session";
import { getResidentContext, projectName } from "@/lib/club/portal";
import { clubBase } from "@/lib/club/paths";
import { readTheme, shouldShowInstallHint, viewerOf } from "@/lib/club/portal-actions-helpers";
import HomeScreen from "@/components/club/HomeScreen";
import LoginScreen from "@/components/club/LoginScreen";

export default async function ClubIndexPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const base = await clubBase(locale);

  const session = await getSession();
  const ctx = session ? await getResidentContext(session.residentId) : null;
  if (!session || !ctx) return <LoginScreen locale={locale} base={base} />;

  const [theme, showInstall] = await Promise.all([
    readTheme(),
    shouldShowInstallHint(),
  ]);

  return (
    <HomeScreen
      locale={locale}
      base={base}
      theme={theme}
      showInstall={showInstall}
      viewerName={viewerOf(session, ctx.resident).name}
      ownerName={ctx.resident.ownerName}
      houseCode={ctx.resident.houseCode}
      unitNumber={ctx.unit.unitNumber}
      cardCode={(ctx.project.cardCode ?? "").toUpperCase()}
      projectLabel={ctx.project.nameEn.toUpperCase()}
      projectShort={projectName(ctx.project, locale)}
      since={ctx.resident.transferDate}
    />
  );
}
