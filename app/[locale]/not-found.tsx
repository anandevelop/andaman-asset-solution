/**
 * app/[locale]/not-found.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * 404 for everything under /[locale].
 *
 * Like error.tsx, this deliberately avoids next-intl. notFound() can be
 * thrown from generateMetadata before the i18n request config has resolved,
 * and useTranslations() would then throw inside the boundary itself,
 * turning a 404 into a 500. Copy comes from lib/error-copy.ts, which
 * imports nothing at all for that reason.
 *
 * A dead end is a bad 404. The links out are the point — most people who
 * land here followed a stale URL to a project or article that moved.
 * ─────────────────────────────────────────────────────────────────────────
 */

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Building2, Compass, Home, Newspaper } from "lucide-react";
import { NOT_FOUND_COPY, localeFromPathname } from "@/lib/error-copy";

export default function LocaleNotFound() {
  /*
    The locale segment is not passed to a not-found boundary, so it is read
    off the path.

    A client component reading usePathname(), rather than a server one
    reading headers(). headers() is a dynamic API, and notFound() is thrown
    mostly from routes that are statically rendered — every project, article
    and event page carries `revalidate = 3600`. Rendering this boundary
    inside one of those threw "Page changed from static to dynamic at
    runtime, reason: headers" and served a 500: a stale link to a removed
    project answered with a crash instead of this page. usePathname needs no
    request, so the boundary renders in a static route as happily as a
    dynamic one.

    localeFromPathname never returns a locale NOT_FOUND_COPY lacks — the
    bug that used to live here was matching the URL against all four
    routing locales while this table had two, turning a 404 under /zh into
    `undefined.code`, a crash inside the crash handler. The table now has
    all four, and tests/error-copy.test.ts keeps it that way.
  */
  const pathname = usePathname();
  const locale = localeFromPathname(pathname);
  const router = useRouter();
  const t = NOT_FOUND_COPY[locale];

  /*
    Redirect-or-log, resolved once per pathname. See app/api/not-found's
    header for why this is a client-side fetch rather than a server-side
    lookup inside this boundary: reading the request here previously broke
    static rendering ("Page changed from static to dynamic at runtime,
    reason: headers"), a failure mode this sidesteps entirely.

    `checked` gates the 404 content so a path that IS covered by a
    Redirect never paints "page not found" at all — only a path with no
    redirect falls through to the content below, and only after the
    lookup has actually returned.
  */
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/not-found", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: pathname }),
    })
      .then((response) => (response.ok ? response.json() : { redirectTo: null }))
      .then((data: { redirectTo?: string | null }) => {
        if (cancelled) return;
        if (data.redirectTo) {
          router.replace(data.redirectTo);
        } else {
          setChecked(true);
        }
      })
      .catch(() => {
        if (!cancelled) setChecked(true);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only
    // when the actual path changes, not on every router/setChecked identity
    // change.
  }, [pathname]);

  const links = [
    { href: `/${locale}`, label: t.home, icon: Home },
    { href: `/${locale}/projects`, label: t.projects, icon: Building2 },
    { href: `/${locale}/news`, label: t.news, icon: Newspaper },
  ];

  if (!checked) {
    // Deliberately blank rather than a spinner: this state is normally
    // gone in well under a second, and a spinner that flashes for a
    // fraction of a second reads as more broken than nothing at all.
    return <section className="min-h-[80vh]" aria-hidden />;
  }

  return (
    <section className="container-luxe flex min-h-[80vh] max-w-3xl flex-col items-center justify-center py-24 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/15 text-accent-700">
        <Compass size={22} aria-hidden />
      </span>

      <p className="mt-8 font-sans text-6xl font-light tracking-tight text-primary/20 sm:text-7xl">
        {t.code}
      </p>

      <h1 className="mt-2 text-3xl font-light text-primary sm:text-4xl">{t.title}</h1>

      <p className="mt-6 max-w-md text-sm leading-relaxed text-ink/70">{t.body}</p>

      <nav className="mt-10 flex flex-wrap items-center justify-center gap-3">
        {links.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className="btn-outline">
            <Icon size={15} aria-hidden />
            {label}
          </Link>
        ))}
      </nav>
    </section>
  );
}
