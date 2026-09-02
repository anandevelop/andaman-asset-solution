/**
 * app/[locale]/login/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Sits outside the (site) route group, so it renders without the marketing
 * Navbar/Footer — a signed-out staff member should see a door, not a
 * showroom. middleware.ts bounces an already-authenticated visitor to
 * /admin before this ever renders.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { siteConfig } from "@/config/site";
import AuthProvider from "@/components/admin/AuthProvider";
import LoginForm from "@/components/admin/LoginForm";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ callbackUrl?: string }>;
};

export async function generateMetadata(
  props: {
    params: Promise<{ locale: string }>;
  }
): Promise<Metadata> {
  const params = await props.params;

  const {
    locale
  } = params;

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
 * Read here, at request time, and that is the whole trick. APP_VERSION and
 * GIT_COMMIT_SHA are declared in the Dockerfile's *runner* stage only —
 * they do not exist during `next build`, so anything that captured them
 * while building would bake in an empty string and stay empty on every
 * deployed container, which is exactly the bug /api/health had before
 * those two became build arguments. This page awaits `searchParams`, a
 * dynamic API, so it is rendered per request and the read is a real one.
 *
 * "dev" rather than nothing when unset: an image built locally has no
 * stamp to show, and a blank space would look identical to a deploy whose
 * build arguments went missing. The point of the stamp is to tell those
 * apart.
 */
function buildStamp(): string {
  const version = process.env.APP_VERSION;
  const commit = process.env.GIT_COMMIT_SHA;

  const parts = [
    version ? `v${version}` : null,
    // Enough to find the commit, short enough to read off a screen.
    commit ? commit.slice(0, 7) : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" · ") : "dev";
}

export default async function LoginPage(props: Props) {
  const searchParams = await props.searchParams;
  const params = await props.params;

  const {
    locale
  } = params;

  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "auth" });

  // Only accept same-origin relative paths — an attacker-supplied absolute
  // URL here would turn the login form into an open redirect.
  const raw = searchParams.callbackUrl ?? "";
  const callbackUrl =
    raw.startsWith("/") && !raw.startsWith("//") ? raw : `/${locale}/admin`;

  return (
    <main className="flex min-h-screen items-center justify-center bg-primary px-5 py-16">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link href={`/${locale}`} className="inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="Andaman Asset Solution Co., Ltd."
              width={220}
              height={44}
              className="h-10 w-auto brightness-0 invert"
            />
          </Link>
        </div>

        <div className="rounded-sm bg-surface-raised p-8 shadow-card sm:p-10">
          <p className="eyebrow">{siteConfig.shortName}</p>
          <h1 className="mt-2 text-2xl font-semibold text-primary">
            {t("signInTitle")}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            {t("signInSubtitle")}
          </p>

          <div className="mt-8">
            <AuthProvider>
              <LoginForm callbackUrl={callbackUrl} />
            </AuthProvider>
          </div>
        </div>

        <div className="mt-8 text-center">
          <Link
            href={`/${locale}`}
            className="inline-flex items-center gap-2 text-sm text-white/60 transition-colors hover:text-accent"
          >
            <ArrowLeft size={15} aria-hidden />
            {t("backToSite")}
          </Link>

          {/*
            Same white/60 as the link above, deliberately. Anything fainter
            drops under 4.5:1 against this navy — white/50 measures 4.35 —
            and the axe scan over this page would fail on it. Not
            translated because there is nothing here to translate.
          */}
          <p className="mt-6 font-mono text-xs text-white/60">{buildStamp()}</p>
        </div>
      </div>
    </main>
  );
}
