/**
 * app/[locale]/login/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Sits outside the (site) route group, so it renders without the marketing
 * Navbar/Footer — a signed-out staff member should see a door, not a
 * showroom. middleware.ts bounces an already-authenticated visitor to
 * /admin before this ever renders.
 *
 * Layout (redesign, `Claude outputs/admin-login-redesign.md`): the wave
 * backdrop behind everything, a top bar with the logo and a language
 * menu, the card centred, three facts about the back office's security
 * under it, and the way back to the site with the build stamp at the foot.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft, Globe } from "lucide-react";
import { LOCALE_DISPLAY_ORDER } from "@/i18n";
import AuthProvider from "@/components/admin/AuthProvider";
import LoginForm from "@/components/admin/LoginForm";
import LoginBackdrop from "@/components/admin/login/LoginBackdrop";
import LoginThemeToggle from "@/components/admin/login/LoginThemeToggle";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ callbackUrl?: string }>;
};

export async function generateMetadata(props: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const params = await props.params;

  const { locale } = params;

  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "auth" });

  return {
    title: t("signInTitle"),
    // Never let a back-office door into the index.
    robots: { index: false, follow: false },
  };
}

/**
 * Which build is answering.
 *
 * Read here, at request time, and that is the whole trick. APP_VERSION is
 * declared in the Dockerfile's *runner* stage only — it does not exist
 * during `next build`, so anything that captured it while building would
 * bake in an empty string and stay empty on every deployed container,
 * which is exactly the bug /api/health had before it became a build
 * argument. This page awaits `searchParams`, a dynamic API, so it is
 * rendered per request and the read is a real one.
 *
 * The version, and only the version. The commit SHA used to be shown
 * beside it, but this page is reachable by anyone who finds /login and the
 * release number is all a person signing in needs to name a build. The
 * commit is still there for whoever is actually diagnosing one: it is in
 * /api/health and it is the Sentry release (lib/sentry.ts).
 *
 * "dev" rather than nothing when unset: an image built locally has no
 * stamp to show, and a blank space would look identical to a deploy whose
 * build argument went missing. The point of the stamp is to tell those
 * apart.
 */
function buildStamp(): string {
  // `||`, not `??`: the Dockerfile declares `ARG APP_VERSION=""`, so an
  // image built without the build argument arrives here with an empty
  // string rather than an undefined, and `??` would print nothing at all.
  return process.env.APP_VERSION || "dev";
}

export default async function LoginPage(props: Props) {
  const searchParams = await props.searchParams;
  const params = await props.params;

  const { locale } = params;

  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "auth" });

  // Only accept same-origin relative paths — an attacker-supplied absolute
  // URL here would turn the login form into an open redirect.
  const raw = searchParams.callbackUrl ?? "";
  const callbackUrl = raw.startsWith("/") && !raw.startsWith("//") ? raw : `/${locale}/admin`;

  const tAdmin = await getTranslations({ locale, namespace: "admin" });
  const notes = [t("note2fa"), t("noteSession"), t("noteAudit")];

  return (
    <main className="relative flex min-h-screen flex-col bg-[#041d2c] text-white">
      <LoginBackdrop />

      <header className="relative z-10 flex items-center justify-between px-4 py-4 sm:px-10 sm:py-6">
        <Link href={`/${locale}`} className="inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-white.png"
            alt="Andaman Asset Solution Co., Ltd."
            width={895}
            height={120}
            className="h-6 w-auto sm:h-7"
          />
        </Link>

        {/* A plain <details>: no script needed to open it, and each link
            carries callbackUrl so a language change does not lose where
            the sign-in was headed. */}
        <div className="flex items-center gap-2">
          <details className="group relative">
            <summary className="flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 text-[13px] font-medium uppercase text-white/85 transition-colors hover:bg-white/10 [&::-webkit-details-marker]:hidden">
              <Globe size={14} aria-hidden />
              {locale}
              <span className="sr-only">{t("language")}</span>
            </summary>
            <ul className="absolute right-0 top-full mt-2 min-w-28 overflow-hidden rounded-xl bg-surface-raised py-1 text-ink shadow-[0_20px_50px_-20px_rgba(0,0,0,.6)]">
              {LOCALE_DISPLAY_ORDER.map((code) => (
                <li key={code}>
                  <Link
                    href={`/${code}/login?callbackUrl=${encodeURIComponent(callbackUrl.replace(/^\/[a-z]{2}(?=\/)/, `/${code}`))}`}
                    aria-current={code === locale ? "true" : undefined}
                    hrefLang={code}
                    className={`block px-4 py-2 text-sm uppercase transition-colors hover:bg-primary/5 ${code === locale ? "font-semibold text-primary" : ""}`}
                  >
                    {code}
                  </Link>
                </li>
              ))}
            </ul>
          </details>
          <LoginThemeToggle labels={{ dark: tAdmin("topbar.themeDark"), light: tAdmin("topbar.themeLight") }} />
        </div>
      </header>

      <div className="relative z-10 flex flex-1 flex-col items-center justify-start px-4 pb-6 pt-10 sm:justify-center sm:pt-4">
        <div className="login-card w-full max-w-[432px] rounded-[18px] bg-surface-raised px-[18px] py-[22px] text-ink shadow-[0_30px_80px_-24px_rgba(0,0,0,.55),0_0_0_1px_rgba(255,255,255,.06)] sm:rounded-[20px] sm:p-8">
          <AuthProvider>
            <LoginForm callbackUrl={callbackUrl} />
          </AuthProvider>
        </div>

        <ul className="mt-[18px] flex flex-wrap justify-center gap-x-[18px] gap-y-2 text-xs text-[#9fbccd]">
          {notes.map((note) => (
            <li key={note} className="flex items-center gap-1.5">
              <span aria-hidden className="text-accent">
                ●
              </span>
              {note}
            </li>
          ))}
        </ul>
      </div>

      <footer className="relative z-10 pb-8 text-center">
        <Link
          href={`/${locale}`}
          className="inline-flex items-center gap-2 text-sm text-white/70 transition-colors hover:text-accent"
        >
          <ArrowLeft size={15} aria-hidden />
          {t("backToSite")}
        </Link>

        {/*
          white/70, deliberately. Anything fainter than /60 drops under 4.5:1
          against this navy — white/50 measures 4.35 — and the axe scan over
          this page would fail on it; the lighter waves behind it are why
          this sits a step above that floor. Not translated because there
          is nothing here to translate.
        */}
        <p className="mt-3 font-mono text-xs text-white/70">build · {buildStamp()}</p>
      </footer>
    </main>
  );
}
